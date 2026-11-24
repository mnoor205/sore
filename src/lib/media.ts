import { and, eq } from "drizzle-orm";
import { database } from "./db";
import { assets, stores } from "./schema";
import { AppError } from "./security";
import type { AppEnv } from "./env";
import { PUBLIC_IMAGE_TYPES } from "./site-images";
export async function siteImages(env: AppEnv, storeId: string) {
  const rows = await database(env)
    .select({ id: assets.id, name: assets.name, type: assets.type })
    .from(assets)
    .where(
      and(
        eq(assets.storeId, storeId),
        eq(assets.ready, 1),
        eq(assets.purpose, "image"),
      ),
    );
  return rows
    .filter((a) => PUBLIC_IMAGE_TYPES.some((type) => type === a.type))
    .map((a) => ({
      id: a.id,
      name: a.name,
      url: `${new URL(env.APP_URL).origin}/media/${a.id}`,
    }));
}
export async function publicImageResponse(env: AppEnv, assetId: string) {
  const a = await database(env)
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, assetId),
        eq(assets.ready, 1),
        eq(assets.purpose, "image"),
      ),
    )
    .get();
  if (!a || !PUBLIC_IMAGE_TYPES.some((type) => type === a.type))
    throw new AppError("Image unavailable", 404);
  const object = await env.FILES.get(a.key);
  if (!object) throw new AppError("Image unavailable", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": a.type,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: object.httpEtag,
    },
  });
}
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
