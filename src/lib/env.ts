import { getCloudflareContext } from "@opennextjs/cloudflare";
/** The subset of the Workers AI binding the storefront editor uses. */
export type AiBinding = {
  run(
    model: string,
    input: unknown,
    options?: { gateway?: { id: string } },
  ): Promise<unknown>;
  aiGatewayLogId?: string | null;
};
export type AppEnv = {
  DB: D1Database;
  /** Workers AI binding; storefront AI edits route through AI Gateway. */
  AI?: AiBinding;
  AI_GATEWAY_ID?: string;
  STOREFRONT_AI_DAILY_LIMIT?: string;
  STOREFRONT_AI_GLOBAL_DAILY_LIMIT?: string;
  FILES: R2Bucket;
  FULFILLMENT: Queue<{ id: string }>;
  APP_MODE: string;
  APP_URL: string;
  MCP_URL: string;
  SESSION_SECRET: string;
  OAUTH_BRIDGE_SECRET: string;
  DOWNLOAD_SECRET: string;
  STOREFRONT_ANALYTICS?: AnalyticsEngineDataset;
  ANALYTICS_DATASET?: string;
  ANALYTICS_ACCOUNT_ID?: string;
  ANALYTICS_READ_TOKEN?: string;
  ANALYTICS_LIMITER?: RateLimit;
  AUTH_PROVIDER?: string;
  OTP_FROM?: string;
  LOGIN_EMAIL?: CloudflareEnv["LOGIN_EMAIL"];
  ACCESS_ISSUER?: string;
  ACCESS_AUDIENCE?: string;
  STRIPE_SECRET_KEY?: string;
  /** Public key for Connect embedded components in the creator dashboard. */
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
  STRIPE_BILLING_WEBHOOK_SECRET?: string;
  STRIPE_RECURRING_PRICE_ID?: string;
  STRIPE_LTD_PRODUCT_ID?: string;
  PLATFORM_FEE_BPS?: string;
  PLATFORM_TAX_ENABLED?: string;
  LTD_PRICE_CENTS?: string;
  LTD_STEP_CENTS?: string;
  LTD_STEP_EVERY?: string;
  LTD_LIMIT?: string;
  MAX_PRODUCTS?: string;
  MAX_UPLOAD_MB?: string;
  MAX_STORAGE_MB?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Native Cloudflare send_email binding for buyer fulfillment (email Worker). */
  FULFILLMENT_EMAIL?: CloudflareEnv["LOGIN_EMAIL"];
};
export async function getEnv(): Promise<AppEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as AppEnv;
}
export function development(env: Pick<AppEnv, "APP_MODE">) {
  return env.APP_MODE === "development";
}
export function limits(env: AppEnv) {
  return {
    products: Number(env.MAX_PRODUCTS || 50),
    upload: Number(env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
    storage: Number(env.MAX_STORAGE_MB || 500) * 1024 * 1024,
  };
}
export async function storeLimits(env: AppEnv, storeId: string) {
  const row = await env.DB.prepare(
    "SELECT grant_json FROM entitlements WHERE store_id=? AND kind IN ('lifetime','subscription')",
  )
    .bind(storeId)
    .first<{ grant_json: string | null }>();
  if (row?.grant_json) {
    const grant = JSON.parse(row.grant_json);
    if (
      Number.isInteger(grant.products) &&
      grant.products > 0 &&
      Number.isInteger(grant.upload) &&
      grant.upload > 0 &&
      Number.isInteger(grant.storage) &&
      grant.storage > 0
    )
      return grant as ReturnType<typeof limits>;
  }
  return limits(env);
}
