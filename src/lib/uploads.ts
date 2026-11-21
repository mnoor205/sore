import { AwsClient } from "aws4fetch";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { assets } from "./schema";
import { development, storeLimits, type AppEnv } from "./env";
import { AppError, id, now, sign, verify } from "./security";
const input = z
  .object({
    name: z
      .string()
      .min(1)
      .max(180)
      .regex(
        /\.(pdf|zip|png|jpe?g|webp)$/i,
        "Upload a PDF, ZIP, PNG, JPEG or WebP",
      ),
    size: z.number().int().positive(),
    type: z.enum([
      "application/pdf",
      "application/zip",
      "application/x-zip-compressed",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]),
    purpose: z.enum(["deliverable", "sample", "image"]).default("deliverable"),
  })
  .refine(
    (v) =>
      v.purpose === "image"
        ? v.type.startsWith("image/")
        : !v.type.startsWith("image/"),
    "Choose an image for covers or a PDF/ZIP for deliverables and samples",
  );
export async function prepareUpload(
  env: AppEnv,
  storeId: string,
  body: unknown,
) {
  const data = input.parse(body),
    l = await storeLimits(env, storeId);
  if (data.size > l.upload)
    throw new AppError(`File must be under ${l.upload / 1024 / 1024} MB`);
  const assetId = id(),
    key = `staging/${storeId}/${assetId}/${data.name.replace(/[^\w.\-]/g, "_")}`;
  const result = await env.DB.prepare(
    "INSERT INTO assets (id,store_id,key,name,type,size,created_at,purpose) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM assets WHERE store_id=?) + ? <= ?",
  )
    .bind(
      assetId,
      storeId,
      key,
      data.name,
      data.type,
      data.size,
      now(),
      data.purpose,
      storeId,
      data.size,
      l.storage,
    )
    .run();
  if (!result.meta.changes) throw new AppError("Storage limit reached");
  const directConfigured =
    !!env.R2_ACCESS_KEY_ID &&
    !!env.R2_SECRET_ACCESS_KEY &&
    !!env.R2_ACCOUNT_ID &&
    !!env.R2_BUCKET_NAME;
  // Without bucket-scoped S3 credentials, the file streams through this Worker into
  // the private R2 binding using a short-lived, owner-bound, size-locked ticket.
  if (development(env) || !directConfigured) {
    const ticket = await sign(
      { assetId, storeId, size: data.size, type: data.type },
      env.DOWNLOAD_SECRET,
      300,
    );
    return {
      assetId,
      url: `${env.APP_URL}/api/upload?ticket=${ticket}`,
      headers: { "Content-Type": data.type },
      mode: development(env) ? "development" : "worker",
    };
  }
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", "300");
  const signed = await client.sign(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": data.type, "Content-Length": String(data.size) },
    aws: { signQuery: true, allHeaders: true },
  });
  return {
    assetId,
    url: signed.url,
    headers: { "Content-Type": data.type },
    mode: "direct",
  };
}
export async function completeUpload(
  env: AppEnv,
  storeId: string,
  assetId: string,
) {
  const db = database(env);
  const a = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.storeId, storeId)))
    .get();
  if (!a) throw new AppError("Upload not found", 404);
  if (a.ready) return { assetId, name: a.name };
  const object = await env.FILES.head(a.key);
  if (
    !object ||
    object.size !== a.size ||
    object.size > (await storeLimits(env, storeId)).upload
  )
    throw new AppError("Uploaded file size does not match");
  const prefix = await env.FILES.get(a.key, {
    range: { offset: 0, length: 12 },
  });
  const bytes = new Uint8Array(await prefix!.arrayBuffer());
  const isPdf =
    bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70;
  const isZip =
    bytes[0] === 80 && bytes[1] === 75 && [3, 5, 7].includes(bytes[2]);
  const isPng =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (
    !{
      "application/pdf": isPdf,
      "application/zip": isZip,
      "application/x-zip-compressed": isZip,
      "image/png": isPng,
      "image/jpeg": isJpeg,
      "image/webp": isWebp,
    }[a.type]
  ) {
    await env.FILES.delete(a.key);
    await db
      .delete(assets)
      .where(and(eq(assets.id, assetId), eq(assets.storeId, storeId)));
    throw new AppError("File contents do not match the declared format");
  }
  const finalKey = `${storeId}/${a.purpose}/${assetId}/${a.name.replace(/[^\w.\-]/g, "_")}`;
  const source = await env.FILES.get(a.key);
  if (!source) throw new AppError("Uploaded file unavailable", 404);
  await env.FILES.put(finalKey, source.body, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: a.type },
  });
  await db
    .update(assets)
    .set({ key: finalKey, ready: 1 })
    .where(
      and(
        eq(assets.id, assetId),
        eq(assets.storeId, storeId),
        eq(assets.ready, 0),
      ),
    );
  await env.FILES.delete(a.key);
  return { assetId, name: a.name };
}
