import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { products, stores, assets, contacts } from "./schema";
import { development, storeLimits, type AppEnv } from "./env";
import { imageUrl, presentation, presentationSchema } from "./presentation";
import { AppError, id, now, safeUrl } from "./security";
import { themeSchema } from "./storefront-theme";
export const publicProduct = {
  id: products.id,
  title: products.title,
  description: products.description,
  image: products.image,
  buttonLabel: products.buttonLabel,
  price: products.price,
  kind: products.kind,
  state: products.state,
  position: products.position,
  deliveryType: products.deliveryType,
  presentationJson: products.presentationJson,
};
export const productInput = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(5000).default(""),
  image: imageUrl.default(""),
  buttonLabel: z.string().trim().min(1).max(50).default("Get the resource"),
  price: z.number().int().min(0).max(10000000),
  kind: z.enum(["resource", "link"]).default("resource"),
  deliveryType: z.enum(["url", "file"]).default("url"),
  deliveryUrl: z.union([safeUrl, z.literal("")]).optional(),
  assetId: z.string().max(80).nullable().optional(),
  state: z.enum(["draft", "published", "archived"]).default("draft"),
  presentation: presentationSchema.optional(),
  expectedVersion: z.number().int().positive().optional(),
  confirmSuggestedPrice: z.boolean().default(false),
});
export const storeInput = z.object({
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    .refine(
      (s) =>
        ![
          "api",
          "auth",
          "dashboard",
          "sign-in",
          "sign-up",
          "sign-out",
          "access",
          "checkout",
          "onboarding",
          "art",
          "privacy",
          "terms",
        ].includes(s),
      "This address is reserved",
    ),
  name: z.string().trim().min(2).max(100),
  bio: z.string().trim().max(350).default(""),
  photo: imageUrl.default(""),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ec008c"),
  supportEmail: z.string().email(),
  audience: z.string().max(1000).default(""),
  goals: z.string().max(1000).default(""),
  whatTheySell: z.string().max(1000).default(""),
  stylePreset: z.enum(["studio", "editorial", "botanical"]).optional(),
  currency: z.enum(["usd", "cad", "gbp", "eur", "aud"]).default("usd"),
  timezone: z
    .string()
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose an IANA time zone")
    .default("America/Chicago"),
  socials: z.record(z.string().max(50), safeUrl).default({}),
  theme: themeSchema.optional(),
});
export async function getStore(env: AppEnv, slug: string) {
  const store = await database(env)
    .select()
    .from(stores)
    .where(eq(stores.slug, slug))
    .get();
  if (!store) throw new AppError("Store not found", 404);
  return store;
}
export async function getProduct(
  env: AppEnv,
  storeId: string,
  productId: string,
) {
  const p = await database(env)
    .select()
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
    .get();
  if (!p) throw new AppError("Product not found", 404);
  return p;
}
export async function validatePresentationAssets(
  env: AppEnv,
  storeId: string,
  details: ReturnType<typeof presentation>,
  deliverableId: string | null,
  image: string,
) {
  const db = database(env);
  for (const url of [image, ...details.previewImages]) {
    if (url.startsWith("/api/media/")) {
      const a = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, url.split("/").at(-1)!),
            eq(assets.storeId, storeId),
            eq(assets.ready, 1),
            eq(assets.purpose, "image"),
          ),
        )
        .get();
      if (!a) throw new AppError("Preview image is unavailable", 404);
    }
  }
  if (details.sampleAssetId) {
    if (details.sampleAssetId === deliverableId)
      throw new AppError(
        "A sample must be separate from the purchased deliverable",
      );
    const a = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, details.sampleAssetId),
          eq(assets.storeId, storeId),
          eq(assets.ready, 1),
          eq(assets.purpose, "sample"),
        ),
      )
      .get();
    if (!a)
      throw new AppError(
        "Sample is unavailable or is a protected deliverable",
        404,
      );
  }
}
export async function validatePublication(
  env: AppEnv,
  storeId: string,
  p: {
    kind: string;
    price: number;
    deliveryType: string;
    deliveryUrl?: string | null;
    assetId?: string | null;
    priceConfirmed?: number;
  },
) {
  if (p.priceConfirmed === 0)
    throw new AppError(
      "Confirm the proposed price in the dashboard before publishing",
      409,
    );
  if (p.kind === "link") {
    if (!p.deliveryUrl) throw new AppError("Add a destination URL");
    return;
  }
  if (p.deliveryType === "url" && !p.deliveryUrl)
    throw new AppError("Add your resource URL before publishing");
  if (p.deliveryType === "file") {
    if (!p.assetId) throw new AppError("Upload a file before publishing");
    const a = await database(env)
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, p.assetId),
          eq(assets.storeId, storeId),
          eq(assets.ready, 1),
          eq(assets.purpose, "deliverable"),
        ),
      )
      .get();
    if (!a || !(await env.FILES.head(a.key)))
      throw new AppError(
        "The deliverable file is unavailable. Complete the upload first.",
        409,
      );
  }
  if (p.price > 0 && !development(env)) {
    const store = await database(env)
      .select()
      .from(stores)
      .where(eq(stores.id, storeId))
      .get();
    if (!store?.stripeAccount || !store.paymentsReady)
      throw new AppError(
        "Connect and verify payments before publishing a paid product",
        409,
      );
  }
}
export async function saveProduct(
  env: AppEnv,
  storeId: string,
  input: unknown,
  productId?: string,
) {
  const data = productInput.parse(input),
    db = database(env),
    existing = productId
      ? await getProduct(env, storeId, productId)
      : undefined;
  if (
    existing &&
    data.expectedVersion !== undefined &&
    existing.version !== data.expectedVersion
  )
    throw new AppError(
      "A newer edit exists. Reload this product before saving.",
      409,
    );
  if (data.kind === "link") {
    if (!data.deliveryUrl) throw new AppError("Add a destination URL");
    data.price = 0;
    data.deliveryType = "url";
  }
  const details = data.presentation || presentation(existing?.presentationJson);
  if (data.assetId) {
    const a = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, data.assetId),
          eq(assets.storeId, storeId),
          eq(assets.ready, 1),
          eq(assets.purpose, "deliverable"),
        ),
      )
      .get();
    if (!a) throw new AppError("Uploaded file is unavailable", 404);
  }
  const {
    presentation: ignored,
    expectedVersion,
    confirmSuggestedPrice,
    ...rest
  } = data;
  const values = {
    ...rest,
    deliveryUrl: data.deliveryType === "url" ? data.deliveryUrl || null : null,
    assetId: data.deliveryType === "file" ? data.assetId || null : null,
    presentationJson: JSON.stringify(details),
    priceConfirmed: confirmSuggestedPrice ? 1 : (existing?.priceConfirmed ?? 1),
    updatedAt: now(),
    lastChangeId: id(),
  };
  await validatePresentationAssets(
    env,
    storeId,
    details,
    values.assetId,
    values.image,
  );
  if (data.state === "published")
    await validatePublication(env, storeId, values);
  if (existing) {
    if (existing.revisionOf && data.state === "published") {
      const live = await getProduct(env, storeId, existing.revisionOf);
      if (live.version !== existing.baseVersion)
        throw new AppError(
          "The live product changed after this revision was drafted. Review a new revision.",
          409,
        );
      const marker = values.lastChangeId;
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO draft_changes (id,store_id,product_id,version,source,actor_id,content_json,created_at) SELECT ?,?,?,?,'dashboard_publish_revision',owner_id,?,? FROM stores WHERE id=? AND EXISTS(SELECT 1 FROM products WHERE id=? AND store_id=? AND version=?) AND EXISTS(SELECT 1 FROM products WHERE id=? AND store_id=? AND state='draft' AND version=?)",
        ).bind(
          marker,
          storeId,
          live.id,
          live.version + 1,
          JSON.stringify({
            title: values.title,
            description: values.description,
            presentation: details,
            price: values.price,
          }),
          now(),
          storeId,
          live.id,
          storeId,
          live.version,
          existing.id,
          storeId,
          existing.version,
        ),
        env.DB.prepare(
          "UPDATE products SET title=?,description=?,image=?,button_label=?,price=?,kind=?,delivery_type=?,delivery_url=?,asset_id=?,presentation_json=?,price_confirmed=1,version=version+1,updated_at=?,last_change_id=? WHERE id=? AND store_id=? AND version=? AND EXISTS(SELECT 1 FROM draft_changes WHERE id=?)",
        ).bind(
          values.title,
          values.description,
          values.image,
          values.buttonLabel,
          values.price,
          values.kind,
          values.deliveryType,
          values.deliveryUrl,
          values.assetId,
          values.presentationJson,
          now(),
          marker,
          live.id,
          storeId,
          live.version,
          marker,
        ),
        env.DB.prepare(
          "UPDATE products SET state='archived',version=version+1,updated_at=? WHERE id=? AND store_id=? AND version=? AND EXISTS(SELECT 1 FROM draft_changes WHERE id=?)",
        ).bind(now(), existing.id, storeId, existing.version, marker),
      ]);
      if (
        !(await env.DB.prepare("SELECT id FROM draft_changes WHERE id=?")
          .bind(marker)
          .first())
      )
        throw new AppError(
          "A newer edit exists. Reload before publishing.",
          409,
        );
      return live.id;
    }
    const changed = await db
      .update(products)
      .set({ ...values, version: existing.version + 1 })
      .where(
        and(
          eq(products.id, existing.id),
          eq(products.storeId, storeId),
          eq(products.version, existing.version),
        ),
      )
      .returning({ id: products.id });
    if (!changed.length)
      throw new AppError("A newer edit exists. Reload before saving.", 409);
    await env.DB.prepare(
      "INSERT INTO draft_changes (id,store_id,product_id,version,source,actor_id,content_json,created_at) SELECT ?,?,?,?, ?,owner_id,?,? FROM stores WHERE id=?",
    )
      .bind(
        values.lastChangeId,
        storeId,
        existing.id,
        existing.version + 1,
        data.state === "published" ? "dashboard_publish" : "dashboard_save",
        JSON.stringify({
          title: values.title,
          description: values.description,
          presentation: details,
        }),
        now(),
        storeId,
      )
      .run();
    return existing.id;
  }
  const newId = id(),
    quota = await storeLimits(env, storeId);
  const result = await env.DB.prepare(
    "INSERT INTO products (id,store_id,title,description,image,button_label,price,kind,delivery_type,delivery_url,asset_id,state,position,presentation_json,price_confirmed,last_change_id,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(MAX(position),-1)+1,?,?,?,?,? FROM products WHERE store_id=? HAVING COUNT(*)<?",
  )
    .bind(
      newId,
      storeId,
      values.title,
      values.description,
      values.image,
      values.buttonLabel,
      values.price,
      values.kind,
      values.deliveryType,
      values.deliveryUrl,
      values.assetId,
      values.state,
      values.presentationJson,
      values.priceConfirmed,
      values.lastChangeId,
      now(),
      now(),
      storeId,
      quota.products,
    )
    .run();
  if (!result.meta.changes)
    throw new AppError(
      `Your store has reached the ${quota.products} product limit`,
    );
  return newId;
}
export async function contact(
  env: AppEnv,
  storeId: string,
  name: string,
  email: string,
  marketing: boolean,
) {
  const db = database(env);
  const normalized = email.trim().toLowerCase();
  await db
    .insert(contacts)
    .values({
      id: id(),
      storeId,
      name,
      email: normalized,
      marketing: marketing ? 1 : 0,
      createdAt: now(),
    })
    .onConflictDoUpdate({
      target: [contacts.storeId, contacts.email],
      set: {
        name,
        marketing: sql`MAX(${contacts.marketing}, ${marketing ? 1 : 0})`,
      },
    });
  return (await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.storeId, storeId), eq(contacts.email, normalized)))
    .get())!;
}
export async function catalog(env: AppEnv, storeId: string) {
  return database(env)
    .select()
    .from(products)
    .where(eq(products.storeId, storeId))
    .orderBy(asc(products.position));
}
