import { headers } from "next/headers";
import { development, type AppEnv } from "./env";

export async function requestOrigin(env: AppEnv) {
  if (!development(env)) return new URL(env.APP_URL).origin;
  const values = await headers();
  const host = values.get("host");
  return host
    ? new URL(
        `${values.get("x-forwarded-proto") === "https" ? "https" : "http"}://${host}`,
      ).origin
    : new URL(env.APP_URL).origin;
}
