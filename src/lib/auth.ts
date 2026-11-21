import { lifetimeCheckoutPath } from "./lifetime-checkout";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { database } from "./db";
import { stores } from "./schema";
import { development, type AppEnv } from "./env";
import { AppError, verify } from "./security";
import {
  accessConfigured,
  sessionIdentity,
  SESSION_COOKIE,
  loginDestination,
} from "./email-auth";
export async function identity(env: AppEnv): Promise<string> {
  if (development(env)) {
    const cookie = (await cookies()).get("coachlane_dev")?.value;
    if (cookie) {
      const value = await verify<{ subject: string; aud: string }>(
        cookie,
        env.SESSION_SECRET,
      );
      if (value.aud === "coachlane-development") return value.subject;
    }
    throw new AppError("Sign in to your development workspace", 401);
  }
  if (!accessConfigured(env))
    throw new AppError("Creator authentication has not been configured", 503);
  return (
    await sessionIdentity(env, (await cookies()).get(SESSION_COOKIE)?.value)
  ).ownerId;
}
export async function creator(env: AppEnv) {
  const ownerId = await identity(env);
  const store = await database(env)
    .select()
    .from(stores)
    .where(eq(stores.ownerId, ownerId))
    .get();
  if (!store) throw new AppError("Create your store to continue", 404);
  return store;
}

// Validate the server session rather than treating the presence of a cookie as
// proof of sign-in. Database failures must not silently look like a logout.
export async function signedInDestination(env: AppEnv, requested?: string) {
  let ownerId: string;
  try {
    ownerId = await identity(env);
  } catch (error) {
    if (error instanceof AppError && [401, 503].includes(error.status))
      return null;
    throw error;
  }
  const store = await env.DB.prepare("SELECT id FROM stores WHERE owner_id=?")
    .bind(ownerId)
    .first();
  const destination = loginDestination(requested, env.APP_URL);
  return store || destination === lifetimeCheckoutPath
    ? destination
    : "/onboarding";
}
