import { and, eq } from "drizzle-orm";
import { database } from "./db";
import { orders, assets } from "./schema";
import type { AppEnv } from "./env";
import { AppError, hash, sign, verify } from "./security";
export async function orderAccess(
  env: AppEnv,
  orderId: string,
  accessToken: string,
) {
  const o = await database(env)
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .get();
  if (!o || (await hash(accessToken)) !== o.accessHash)
    throw new AppError("This access link is invalid", 404);
  return o;
}
export function mayAccess(o: { status: string; refunded: number }) {
  return ["paid", "free"].includes(o.status) && o.refunded !== 1;
}
export async function downloadLink(
  env: AppEnv,
  orderId: string,
  accessToken: string,
) {
  const o = await orderAccess(env, orderId, accessToken);
  if (!mayAccess(o))
    throw new AppError(
      o.refunded
        ? "Access revoked after refund"
        : "Payment has not been confirmed",
      403,
    );
  const signed = await sign(
    { orderId: o.id, storeId: o.storeId, assetId: o.assetId },
    env.DOWNLOAD_SECRET,
    120,
  );
  return `${env.APP_URL}/api/download?ticket=${encodeURIComponent(signed)}`;
}
export async function download(env: AppEnv, ticket: string) {
  const value = await verify<{
      orderId: string;
      storeId: string;
      assetId: string | null;
    }>(ticket, env.DOWNLOAD_SECRET),
    db = database(env);
  const o = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, value.orderId), eq(orders.storeId, value.storeId)))
    .get();
  if (!o || !mayAccess(o) || o.assetId !== value.assetId)
    throw new AppError("Access is unavailable", 403);
  if (o.deliveryUrl) return Response.redirect(o.deliveryUrl, 302);
  const asset = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, o.assetId!),
        eq(assets.storeId, o.storeId),
        eq(assets.ready, 1),
      ),
    )
    .get();
  if (!asset) throw new AppError("File unavailable", 404);
  const file = await env.FILES.get(asset.key);
  if (!file) throw new AppError("File unavailable", 404);
  return new Response(file.body, {
    headers: {
      "Content-Type": asset.type,
      "Content-Disposition": `attachment; filename="${asset.name.replace(/[^\w. -]/g, "_")}"`,
      "Cache-Control": "private,no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
