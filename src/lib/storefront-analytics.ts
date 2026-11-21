import { z } from "zod";
import type { AppEnv } from "./env";
import { database } from "./db";
import { views, type stores } from "./schema";
import { getProduct } from "./catalog";
import { AppError, hash, id } from "./security";
import { sources } from "./storefront-traffic";

type Store = typeof stores.$inferSelect;
function analyticsSettings(store: Store) {
  return {
    trackingEnabled: !!store.trackingEnabled,
    excludeOwnerVisits: !!store.excludeOwnerVisits,
  };
}
export async function setAnalyticsSettings(
  env: AppEnv,
  store: Store,
  input: unknown,
) {
  const patch = z
    .union([
      z.strictObject({ trackingEnabled: z.boolean() }),
      z.strictObject({ excludeOwnerVisits: z.boolean() }),
    ])
    .parse(input);
  const tracking = "trackingEnabled" in patch;
  const field = tracking ? "tracking_enabled" : "exclude_owner_visits";
  const value = tracking ? patch.trackingEnabled : patch.excludeOwnerVisits;
  const result = await env.DB.prepare(
    `UPDATE stores SET ${field}=? WHERE id=? AND owner_id=?`,
  )
    .bind(Number(value), store.id, store.ownerId)
    .run();
  if (!result.meta.changes) throw new AppError("Store unavailable", 404);
  return patch;
}

const impression = z.object({
  productId: z.string().min(1).max(96),
  visitor: z.uuid(),
});
const pageview = impression.extend({
  productId: impression.shape.productId.optional(),
  source: z.enum(sources),
});

function clientFamily(agent: string) {
  const device = /ipad|tablet|android(?!.*mobile)/i.test(agent)
    ? "Tablet"
    : /mobile|iphone|ipod/i.test(agent)
      ? "Phone"
      : agent
        ? "Desktop"
        : "Unknown";
  const browser = /edg(e|a|ios)?\//i.test(agent)
    ? "Edge"
    : /opr\/|opera/i.test(agent)
      ? "Opera"
      : /firefox|fxios/i.test(agent)
        ? "Firefox"
        : /chrome|crios/i.test(agent)
          ? "Chrome"
          : /safari/i.test(agent)
            ? "Safari"
            : "Other";
  return { device, browser };
}

export async function recordTraffic(
  env: AppEnv,
  store: Store,
  kind: "view" | "pageview",
  headers: Headers,
  currentOwner: () => Promise<string | null>,
  readBody: () => Promise<unknown>,
) {
  if (
    !store.trackingEnabled ||
    store.publicationState !== "published" ||
    headers.get("dnt") === "1" ||
    headers.get("sec-gpc") === "1" ||
    (kind === "pageview" && !env.STOREFRONT_ANALYTICS)
  )
    return false;
  if (store.excludeOwnerVisits && (await currentOwner()) === store.ownerId)
    return false;
  const day = new Date().toISOString().slice(0, 10);
  if (env.ANALYTICS_LIMITER) {
    const ip = headers.get("cf-connecting-ip") || "local";
    const key = await hash(
      `${env.SESSION_SECRET}:traffic:${day}:${store.id}:${ip}`,
    );
    if (!(await env.ANALYTICS_LIMITER.limit({ key })).success) return false;
  }
  const input = await readBody();
  const data =
    kind === "view" ? impression.parse(input) : pageview.parse(input);
  if (
    data.productId &&
    (await getProduct(env, store.id, data.productId)).state !== "published"
  )
    throw new AppError("Product unavailable", 404);
  const visitorHash = await hash(`${store.id}:${day}:${data.visitor}`);
  if ("source" in data) {
    const { device, browser } = clientFamily(headers.get("user-agent") || "");
    const country = headers.get("cf-ipcountry") || "";
    env.STOREFRONT_ANALYTICS!.writeDataPoint({
      indexes: [store.id],
      blobs: [
        data.productId || "",
        data.source,
        /^[A-Z]{2}$/.test(country) ? country : "Unknown",
        device,
        browser,
        visitorHash,
      ],
    });
  } else {
    await database(env)
      .insert(views)
      .values({
        id: id(),
        storeId: store.id,
        productId: data.productId,
        visitorHash,
        day,
        createdAt: Date.now(),
      })
      .onConflictDoNothing();
  }
  return true;
}

const sqlRows = z.object({
  data: z.array(
    z.object({
      label: z.string(),
      views: z.coerce.number().int().nonnegative(),
      visitors: z.coerce.number().int().nonnegative().optional(),
      productViews: z.coerce.number().int().nonnegative().optional(),
    }),
  ),
});
type Count = { label: string; views: number };
export type TrafficReport = {
  trend: { day: string; visitors: number; views: number }[];
  pages: Count[];
  sources: Count[];
  countries: Count[];
  devices: Count[];
  browsers: Count[];
  productViews: number;
};
export async function storefrontAnalytics(
  env: AppEnv,
  store: Store,
  days: number,
) {
  if (![7, 30, 90].includes(days)) throw new AppError("Invalid date range");
  const dayMs = 86400000;
  const end = (Math.floor(Date.now() / dayMs) + 1) * dayMs;
  const start = end - days * dayMs;
  const commerce = await env.DB.prepare(
    `SELECT
    (SELECT COUNT(*) FROM orders WHERE store_id=? AND is_test=0 AND status<>'free' AND session_id IS NOT NULL AND created_at>=? AND created_at<?) AS checkouts,
    (SELECT COUNT(*) FROM orders WHERE store_id=? AND is_test=0 AND status='paid' AND paid_at>=? AND paid_at<?) AS purchases`,
  )
    .bind(store.id, start, end, store.id, start, end)
    .first<{ checkouts: number; purchases: number }>();
  const base = {
    settings: analyticsSettings(store),
    commerce: commerce!,
    traffic: null as TrafficReport | null,
  };
  if (
    !env.STOREFRONT_ANALYTICS ||
    !env.ANALYTICS_READ_TOKEN ||
    !env.ANALYTICS_ACCOUNT_ID ||
    !env.ANALYTICS_DATASET
  )
    return { ...base, status: "setup" as const };
  // AE has no query parameters. The index comes only from the authenticated store.
  if (
    !/^[a-zA-Z0-9_-]{1,96}$/.test(store.id) ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(env.ANALYTICS_DATASET) ||
    !/^[a-f0-9]{32}$/i.test(env.ANALYTICS_ACCOUNT_ID)
  )
    return { ...base, status: "unavailable" as const };
  const scope = `FROM ${env.ANALYTICS_DATASET} WHERE index1 = '${store.id}' AND timestamp >= toDateTime(${start / 1000}) AND timestamp < toDateTime(${end / 1000})`;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.ANALYTICS_ACCOUNT_ID}/analytics_engine/sql`;
  async function query(sql: string) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.ANALYTICS_READ_TOKEN}` },
      body: sql + " FORMAT JSON",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Analytics query failed");
    return sqlRows.parse(await response.json()).data;
  }
  const ranked = (column: string) =>
    query(
      `SELECT ${column} AS label, SUM(_sample_interval) AS views ${scope} GROUP BY label ORDER BY views DESC LIMIT 10`,
    );
  try {
    const [daily, pages, sources, countries, devices, browsers] =
      await Promise.all([
        query(
          `SELECT formatDateTime(timestamp, '%Y-%m-%d') AS label, SUM(_sample_interval) AS views, COUNT(DISTINCT blob6) AS visitors, SUM(if(blob1 = '', 0, _sample_interval)) AS productViews ${scope} GROUP BY label ORDER BY label`,
        ),
        ranked("blob1"),
        ranked("blob2"),
        ranked("blob3"),
        ranked("blob4"),
        ranked("blob5"),
      ]);
    const byDay = new Map(daily.map((row) => [row.label, row]));
    const trend = Array.from({ length: days }, (_, i) => {
      const day = new Date(start + i * dayMs).toISOString().slice(0, 10);
      const row = byDay.get(day);
      return { day, views: row?.views ?? 0, visitors: row?.visitors ?? 0 };
    });
    return {
      ...base,
      status: "ready" as const,
      traffic: {
        trend,
        pages,
        sources,
        countries,
        devices,
        browsers,
        productViews: daily.reduce(
          (sum, row) => sum + (row.productViews ?? 0),
          0,
        ),
      },
    };
  } catch {
    return { ...base, status: "unavailable" as const };
  }
}
export type AnalyticsResponse = Awaited<ReturnType<typeof storefrontAnalytics>>;
