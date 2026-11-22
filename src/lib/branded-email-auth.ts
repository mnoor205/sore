import { z } from "zod";
import type { AppEnv } from "./env";
import {
  AppError,
  hash,
  now,
  sign,
  token,
  verify,
  rateLimit,
} from "./security";
import { loginDestination } from "./email-auth";
import { loginEmail } from "./login-email";

export const OTP_COOKIE = "__Host-coachlane_otp";
export const BRANDED_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const TTL = 600;
export function brandedEmailConfigured(env: AppEnv) {
  return (
    env.AUTH_PROVIDER === "email" &&
    !!env.LOGIN_EMAIL &&
    !!env.OTP_FROM &&
    !!env.ACCESS_ISSUER &&
    new URL(env.APP_URL).protocol === "https:"
  );
}
function requireEmail(env: AppEnv) {
  if (!brandedEmailConfigured(env))
    throw new AppError("Email sign-in is not configured", 503);
}
async function key(env: AppEnv) {
  if (env.SESSION_SECRET.length < 32)
    throw new AppError("Email sign-in is not configured", 503);
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
const material = (nonce: string, code: string) =>
  new TextEncoder().encode("coachlane-email-code\n" + nonce + "\n" + code);
async function digest(env: AppEnv, nonce: string, code: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", await key(env), material(nonce, code)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function dailyLimit(env: AppEnv, name: string, limit: number) {
  const r = await env.DB.prepare(
    "INSERT INTO rates(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(name + ":" + Math.floor(now() / 86400000), now() + 86400000)
    .first<{ count: number }>();
  if ((r?.count || 0) > limit)
    throw new AppError(
      "Too many codes requested. Please try again later.",
      429,
    );
}
export async function requestEmailCode(
  env: AppEnv,
  input: { email: string; returnTo?: string; ip: string },
) {
  requireEmail(env);
  const email = z
    .string()
    .trim()
    .email()
    .max(320)
    .parse(input.email)
    .toLowerCase();
  const emailKey = await digest(env, "email-rate", email);
  const ipKey = await hash(input.ip);
  await rateLimit(env, "otp-send:" + ipKey, 5);
  await dailyLimit(env, "otp-email:" + emailKey, 20);
  await dailyLimit(env, "otp-ip:" + ipKey, 100);
  const nonce = token(),
    challengeHash = await hash(nonce);
  let random: number;
  do {
    random = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (random >= 4294000000);
  const code = String(random % 1000000).padStart(6, "0");
  const codeHash = await digest(env, nonce, code);
  await env.DB.prepare("DELETE FROM creator_email_codes WHERE expires_at<=?")
    .bind(now())
    .run();
  await env.DB.prepare("DELETE FROM rates WHERE expires_at<=?")
    .bind(now())
    .run();
  await env.DB.prepare("DELETE FROM creator_sessions WHERE expires_at<=?")
    .bind(now())
    .run();
  const saved = await env.DB.prepare(
    "INSERT INTO creator_email_codes(challenge_hash,email,code_hash,expires_at,created_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET challenge_hash=excluded.challenge_hash,code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,created_at=excluded.created_at WHERE creator_email_codes.created_at<=? RETURNING challenge_hash",
  )
    .bind(
      challengeHash,
      email,
      codeHash,
      now() + TTL * 1000,
      now(),
      now() - 60000,
    )
    .first();
  if (!saved)
    throw new AppError(
      "Please wait a minute before requesting another code.",
      429,
    );
  try {
    await env.LOGIN_EMAIL!.send({
      from: { email: env.OTP_FROM!, name: "Sore" },
      to: email,
      ...loginEmail(code),
    });
  } catch {
    await env.DB.prepare(
      "DELETE FROM creator_email_codes WHERE challenge_hash=?",
    )
      .bind(challengeHash)
      .run();
    throw new AppError(
      "We couldn't send your code. Please try again shortly.",
      503,
    );
  }
  const state = await sign(
    {
      aud: "coachlane-branded-email",
      nonce,
      returnTo: loginDestination(input.returnTo, env.APP_URL),
    },
    env.SESSION_SECRET,
    TTL,
  );
  return { state };
}
export async function completeEmailCode(
  env: AppEnv,
  stateCookie: string,
  code: string,
  ip: string,
) {
  requireEmail(env);
  await rateLimit(env, "otp-verify:" + (await hash(ip)), 20);
  const state = await verify<{ aud: string; nonce: string; returnTo: string }>(
    stateCookie,
    env.SESSION_SECRET,
  );
  if (
    state.aud !== "coachlane-branded-email" ||
    !/^[a-f0-9]{64}$/.test(state.nonce)
  )
    throw new AppError("Please request a new sign-in code.", 401);
  const challengeHash = await hash(state.nonce);
  const row = await env.DB.prepare(
    "UPDATE creator_email_codes SET attempts=attempts+1 WHERE challenge_hash=? AND expires_at>? AND attempts<5 RETURNING email,code_hash",
  )
    .bind(challengeHash, now())
    .first<{ email: string; code_hash: string }>();
  const invalid = () =>
    new AppError(
      "Invalid or expired code. Please try again or request a new code.",
      401,
    );
  if (!row) throw invalid();
  if (
    !/^\d{6}$/.test(code) ||
    !(await crypto.subtle.verify(
      "HMAC",
      await key(env),
      Uint8Array.from(row.code_hash.match(/../g)!, (b) => parseInt(b, 16)),
      material(state.nonce, code),
    ))
  )
    throw invalid();
  const session = token(),
    sessionHash = await hash(session),
    expiresAt = now() + BRANDED_SESSION_MS;
  // Keep the original, verified-email namespace so existing creators retain ownership.
  const ownerId = "cf_" + (await hash(env.ACCESS_ISSUER + "\n" + row.email));
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO creator_sessions(token_hash,owner_id,email,expires_at,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM creator_email_codes WHERE challenge_hash=? AND code_hash=? AND expires_at>? AND attempts<=5)",
    ).bind(
      sessionHash,
      ownerId,
      row.email,
      expiresAt,
      now(),
      challengeHash,
      row.code_hash,
      now(),
    ),
    env.DB.prepare(
      "DELETE FROM creator_email_codes WHERE challenge_hash=?",
    ).bind(challengeHash),
  ]);
  if (
    !(await env.DB.prepare(
      "SELECT token_hash FROM creator_sessions WHERE token_hash=?",
    )
      .bind(sessionHash)
      .first())
  )
    throw invalid();
  let returnTo = loginDestination(state.returnTo, env.APP_URL);
  if (
    !(await env.DB.prepare("SELECT id FROM stores WHERE owner_id=?")
      .bind(ownerId)
      .first()) &&
    returnTo !== "/onboarding"
  )
    returnTo = "/onboarding";
  return { session, expiresAt, returnTo };
}
