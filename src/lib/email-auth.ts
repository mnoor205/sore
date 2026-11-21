import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { AppEnv } from "./env";
import { AppError, hash, now, sign, token, verify } from "./security";

export const SESSION_COOKIE = "__Host-coachlane_session";
export const LOGIN_COOKIE = "__Host-coachlane_login";
const LOGIN_SECONDS = 600;
const SESSION_MS = 8 * 60 * 60 * 1000;
const resolvers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function accessConfigured(env: AppEnv) {
  try {
    const issuer = new URL(env.ACCESS_ISSUER || "");
    return (
      issuer.protocol === "https:" &&
      /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer.hostname) &&
      issuer.origin === env.ACCESS_ISSUER &&
      !!env.ACCESS_AUDIENCE &&
      new URL(env.APP_URL).protocol === "https:"
    );
  } catch {
    return false;
  }
}
function requireAccess(env: AppEnv) {
  if (!accessConfigured(env))
    throw new AppError("Email sign-in has not been configured", 503);
}

export function loginDestination(
  value: string | null | undefined,
  appUrl: string,
) {
  const origin = new URL(appUrl).origin;
  try {
    const url = new URL(value || "/dashboard", origin);
    if (
      url.origin === origin &&
      (url.pathname === "/dashboard" ||
        url.pathname.startsWith("/dashboard/") ||
        url.pathname === "/onboarding" ||
        url.pathname === "/api/oauth/bridge")
    )
      return url.pathname + url.search;
  } catch {}
  return "/dashboard";
}

export async function verifyAccessIdentity(env: AppEnv, assertion: string) {
  requireAccess(env);
  try {
    if (!assertion || assertion.length > 16384) throw new Error();
    const issuer = env.ACCESS_ISSUER!;
    let keys = resolvers.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs"), {
        timeoutDuration: 5000,
        cacheMaxAge: 300000,
        cooldownDuration: 30000,
      });
      resolvers.set(issuer, keys);
    }
    const { payload } = await jwtVerify(assertion, keys, {
      issuer,
      audience: env.ACCESS_AUDIENCE!,
      algorithms: ["RS256"],
      requiredClaims: ["iss", "aud", "exp", "iat", "sub", "email"],
      clockTolerance: 5,
      maxTokenAge: "24h",
    });
    const email = z
      .string()
      .email()
      .max(320)
      .parse(payload.email)
      .toLowerCase();
    z.string().min(1).max(200).parse(payload.sub);
    if (payload.type !== "app" || payload.iat! > Math.floor(now() / 1000) + 60)
      throw new Error();
    return {
      // A verified email keeps its store if an Access seat is removed/re-added.
      ownerId: "cf_" + (await hash(issuer + "\n" + email)),
      email,
      expiresAt: payload.exp! * 1000,
    };
  } catch {
    throw new AppError(
      "Email verification could not be validated. Please start sign-in again.",
      401,
    );
  }
}

export async function beginEmailLogin(env: AppEnv, returnTo?: string | null) {
  requireAccess(env);
  const nonce = token();
  const nonceHash = await hash(nonce);
  const expiresAt = now() + LOGIN_SECONDS * 1000;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rates WHERE expires_at<=?").bind(now()),
    env.DB.prepare("DELETE FROM creator_login_states WHERE expires_at<=?").bind(
      now(),
    ),
    env.DB.prepare("DELETE FROM creator_sessions WHERE expires_at<=?").bind(
      now(),
    ),
    env.DB.prepare(
      "INSERT INTO creator_login_states(nonce_hash,expires_at) VALUES (?,?)",
    ).bind(nonceHash, expiresAt),
  ]);
  const state = await sign(
    {
      aud: "coachlane-email-login",
      nonce,
      returnTo: loginDestination(returnTo, env.APP_URL),
    },
    env.SESSION_SECRET,
    LOGIN_SECONDS,
  );
  return { nonce, state, url: env.APP_URL + "/auth/verify?state=" + nonce };
}

export async function completeEmailLogin(
  env: AppEnv,
  input: {
    stateCookie: string;
    nonce: string;
    assertion: string;
  },
) {
  requireAccess(env);
  const state = await verify<{ aud: string; nonce: string; returnTo: string }>(
    input.stateCookie,
    env.SESSION_SECRET,
  );
  if (
    state.aud !== "coachlane-email-login" ||
    !input.nonce ||
    state.nonce !== input.nonce
  )
    throw new AppError(
      "Sign-in did not start in this browser. Please start again.",
      401,
    );
  const identity = await verifyAccessIdentity(env, input.assertion);
  const session = token();
  const sessionHash = await hash(session);
  const nonceHash = await hash(input.nonce);
  const expiresAt = Math.min(identity.expiresAt, now() + SESSION_MS);
  if (expiresAt <= now()) throw new AppError("Email verification expired", 401);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO creator_sessions(token_hash,owner_id,email,expires_at,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM creator_login_states WHERE nonce_hash=? AND expires_at>?)",
    ).bind(
      sessionHash,
      identity.ownerId,
      identity.email,
      expiresAt,
      now(),
      nonceHash,
      now(),
    ),
    env.DB.prepare("DELETE FROM creator_login_states WHERE nonce_hash=?").bind(
      nonceHash,
    ),
  ]);
  if (
    !(await env.DB.prepare(
      "SELECT token_hash FROM creator_sessions WHERE token_hash=?",
    )
      .bind(sessionHash)
      .first())
  )
    throw new AppError(
      "This sign-in request expired or was already used. Please start again.",
      401,
    );
  let returnTo = loginDestination(state.returnTo, env.APP_URL);
  const store = await env.DB.prepare("SELECT id FROM stores WHERE owner_id=?")
    .bind(identity.ownerId)
    .first();
  if (
    !store &&
    (returnTo.startsWith("/dashboard") ||
      returnTo.startsWith("/api/oauth/bridge"))
  )
    returnTo = "/onboarding";
  return { session, expiresAt, returnTo };
}

export async function sessionIdentity(env: AppEnv, session?: string) {
  requireAccess(env);
  if (!session || !/^[a-f0-9]{64}$/.test(session))
    throw new AppError("Please sign in", 401);
  const identity = await env.DB.prepare(
    "SELECT owner_id,email FROM creator_sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(session), now())
    .first<{ owner_id: string; email: string }>();
  if (!identity) throw new AppError("Please sign in again", 401);
  return { ownerId: identity.owner_id, email: identity.email };
}

export async function revokeSession(env: AppEnv, session?: string) {
  if (session && /^[a-f0-9]{64}$/.test(session))
    await env.DB.prepare("DELETE FROM creator_sessions WHERE token_hash=?")
      .bind(await hash(session))
      .run();
}
