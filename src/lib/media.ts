import { and, eq } from "drizzle-orm";
import { database } from "./db";
import { assets, stores } from "./schema";
import { AppError } from "./security";
import type { AppEnv } from "./env";
export async function mediaResponse(
  env: AppEnv,
  assetId: string,
  ownerId?: string,
) {
  const db = database(env),
    a = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.ready, 1)))
      .get();
  if (!a || !["image", "sample"].includes(a.purpose))
    throw new AppError("Media unavailable", 404);
  const s = await db
    .select()
    .from(stores)
    .where(eq(stores.id, a.storeId))
    .get();
  if (!s) throw new AppError("Media unavailable", 404);
  if (s.ownerId !== ownerId) {
    if (s.publicationState !== "published")
      throw new AppError("Media unavailable", 404);
    const url = "/api/media/" + a.id;
    const used = await env.DB.prepare(
      `SELECT id FROM stores WHERE id=? AND photo=? UNION ALL SELECT p.id FROM products p WHERE p.store_id=? AND p.state='published' AND ((?='image' AND (p.image=? OR EXISTS(SELECT 1 FROM json_each(p.presentation_json,'$.previewImages') WHERE value=?))) OR (?='sample' AND json_extract(p.presentation_json,'$.sampleAssetId')=? AND NOT EXISTS(SELECT 1 FROM json_each(p.presentation_json,'$.hiddenSections') WHERE value='previews'))) LIMIT 1`,
    )
      .bind(s.id, url, s.id, a.purpose, url, url, a.purpose, a.id)
      .first();
    if (!used) throw new AppError("Media unavailable", 404);
  }
  const object = await env.FILES.get(a.key);
  if (!object) throw new AppError("Media unavailable", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": a.type,
      "Content-Disposition": `${a.purpose === "sample" ? "attachment" : "inline"}; filename="${a.name.replace(/[^\w. -]/g, "_")}"`,
      "Cache-Control": "private,no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
