import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { products, stores } from "./schema";
import { getProduct } from "./catalog";
import { presentation } from "./presentation";
import { storeLimits, type AppEnv } from "./env";
import { AppError, hash, id, now } from "./security";
export const draftContentSchema = z
  .object({
    title: z.string().trim().min(2).max(140),
    description: z.string().trim().max(5000).default(""),
    audience: z.string().trim().max(2000).default(""),
    includedItems: z
      .array(z.string().trim().min(1).max(500))
      .max(30)
      .default([]),
    faqs: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(300),
            answer: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .max(15)
      .default([]),
    buttonText: z.string().trim().min(1).max(50).default("Get the resource"),
    suggestedPrice: z.number().int().min(0).max(10000000).nullable().optional(),
  })
  .strict();
export const draftPatchSchema = z
  .object({
    title: z.string().trim().min(2).max(140).optional(),
    description: z.string().trim().max(5000).optional(),
    audience: z.string().trim().max(2000).optional(),
    includedItems: z
      .array(z.string().trim().min(1).max(500))
      .max(30)
      .optional(),
    faqs: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(300),
            answer: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .max(15)
      .optional(),
    buttonText: z.string().trim().min(1).max(50).optional(),
    suggestedPrice: z.number().int().min(0).max(10000000).nullable().optional(),
  })
  .strict();
export const createDraftInput = z
  .object({
    requestId: z.string().uuid(),
    sourceProductId: z.string().max(80).optional(),
    content: draftContentSchema,
  })
  .strict();
export const updateDraftInput = z
  .object({
    requestId: z.string().uuid(),
    draftId: z.string().max(80),
    expectedVersion: z.number().int().positive(),
    content: draftPatchSchema.refine(
      (v) => Object.keys(v).length > 0,
      "Provide at least one change",
    ),
  })
  .strict();
type Actor = { ownerId: string; connectionId: string };
function savedContent(p: typeof products.$inferSelect) {
  const details = presentation(p.presentationJson);
  return {
    title: p.title,
    description: p.description,
    audience: details.audience,
    includedItems: details.includedItems,
    faqs: details.faqs,
    buttonText: p.buttonLabel,
    suggestedPrice: p.suggestedPrice,
  };
}
export function draftResult(env: AppEnv, p: typeof products.$inferSelect) {
  return {
    draftId: p.id,
    version: p.version,
    state: p.state,
    sourceProductId: p.revisionOf,
    content: savedContent(p),
    reviewUrl: `${env.APP_URL}/dashboard/products?draft=${encodeURIComponent(p.id)}`,
    notice:
      "Private unpublished draft. Suggested prices require confirmation in the dashboard. Only the creator can publish.",
  };
}
async function priorRequest(
  env: AppEnv,
  storeId: string,
  requestId: string,
  inputHash: string,
) {
  const row = await env.DB.prepare(
    "SELECT input_hash,response_json FROM draft_requests WHERE store_id=? AND request_id=?",
  )
    .bind(storeId, requestId)
    .first<{ input_hash: string; response_json: string }>();
  if (!row) return null;
  if (row.input_hash !== inputHash)
    throw new AppError(
      "This request ID was already used with different content",
      409,
    );
  return JSON.parse(row.response_json) as ReturnType<typeof draftResult>;
}
async function checkActor(env: AppEnv, storeId: string, actor: Actor) {
  const store = await database(env)
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.ownerId, actor.ownerId)))
    .get();
  if (!store) throw new AppError("Store unavailable", 403);
}
export async function createProductDraft(
  env: AppEnv,
  storeId: string,
  actor: Actor,
  input: unknown,
) {
  await checkActor(env, storeId, actor);
  const data = createDraftInput.parse(input),
    inputHash = await hash(JSON.stringify({ operation: "create", ...data }));
  const prior = await priorRequest(env, storeId, data.requestId, inputHash);
  if (prior) return prior;
  const base = data.sourceProductId
    ? await getProduct(env, storeId, data.sourceProductId)
    : undefined;
  if (base && base.state !== "published")
    throw new AppError("A revision must reference a published product");
  const draftId =
      "draft_" + (await hash(storeId + ":" + data.requestId)).slice(0, 40),
    changeId = id(),
    time = now();
  const details = {
    ...presentation(base?.presentationJson),
    audience: data.content.audience,
    includedItems: data.content.includedItems,
    faqs: data.content.faqs,
  };
  const suggested = data.content.suggestedPrice ?? null;
  const p = {
    ...base,
    id: draftId,
    storeId,
    title: data.content.title,
    description: data.content.description,
    buttonLabel: data.content.buttonText,
    price: base?.price || 0,
    image: base?.image || "",
    kind: "resource",
    deliveryType: base?.deliveryType || "url",
    deliveryUrl: base?.deliveryUrl || null,
    assetId: base?.assetId || null,
    state: "draft",
    position: base?.position || 0,
    presentationJson: JSON.stringify(details),
    version: 1,
    lastChangeId: changeId,
    revisionOf: base?.id || null,
    baseVersion: base?.version || null,
    suggestedPrice: suggested,
    priceConfirmed: suggested === null ? 1 : 0,
    draftSource: "mcp",
    createdAt: time,
    updatedAt: time,
  } satisfies typeof products.$inferSelect;
  const response = draftResult(env, p),
    quota = await storeLimits(env, storeId);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO products (id,store_id,title,description,button_label,price,image,kind,delivery_type,delivery_url,asset_id,state,position,presentation_json,version,last_change_id,revision_of,base_version,suggested_price,price_confirmed,draft_source,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM products WHERE store_id=?)<? AND NOT EXISTS(SELECT 1 FROM draft_requests WHERE store_id=? AND request_id=?)",
    ).bind(
      p.id,
      p.storeId,
      p.title,
      p.description,
      p.buttonLabel,
      p.price,
      p.image,
      p.kind,
      p.deliveryType,
      p.deliveryUrl,
      p.assetId,
      p.state,
      p.position,
      p.presentationJson,
      p.version,
      changeId,
      p.revisionOf,
      p.baseVersion,
      p.suggestedPrice,
      p.priceConfirmed,
      p.draftSource,
      time,
      time,
      storeId,
      quota.products,
      storeId,
      data.requestId,
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO draft_changes (id,store_id,product_id,version,source,actor_id,content_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND store_id=? AND last_change_id=?)",
    ).bind(
      changeId,
      storeId,
      draftId,
      1,
      "mcp:" + actor.connectionId,
      actor.ownerId,
      JSON.stringify(response.content),
      time,
      draftId,
      storeId,
      changeId,
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO draft_requests (store_id,request_id,operation,input_hash,product_id,response_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND store_id=? AND last_change_id=?)",
    ).bind(
      storeId,
      data.requestId,
      "create",
      inputHash,
      draftId,
      JSON.stringify(response),
      time,
      draftId,
      storeId,
      changeId,
    ),
  ]);
  const saved = await priorRequest(env, storeId, data.requestId, inputHash);
  if (!saved)
    throw new AppError(
      "Draft quota reached or request could not be saved",
      409,
    );
  return saved;
}
export async function updateProductDraft(
  env: AppEnv,
  storeId: string,
  actor: Actor,
  input: unknown,
) {
  await checkActor(env, storeId, actor);
  const data = updateDraftInput.parse(input),
    inputHash = await hash(JSON.stringify({ operation: "update", ...data }));
  const prior = await priorRequest(env, storeId, data.requestId, inputHash);
  if (prior) return prior;
  const p = await getProduct(env, storeId, data.draftId);
  if (p.state !== "draft")
    throw new AppError(
      "Only unpublished drafts can be updated. Use create_product_draft with sourceProductId to propose a published-product revision.",
      409,
    );
  if (p.version !== data.expectedVersion)
    throw new AppError(
      "A newer edit exists. Review the current draft version before updating.",
      409,
    );
  const content = { ...savedContent(p), ...data.content },
    details = {
      ...presentation(p.presentationJson),
      audience: content.audience,
      includedItems: content.includedItems,
      faqs: content.faqs,
    };
  const changedPrice = data.content.suggestedPrice !== undefined,
    changeId = id(),
    time = now();
  const next = {
    ...p,
    title: content.title,
    description: content.description,
    buttonLabel: content.buttonText,
    presentationJson: JSON.stringify(details),
    suggestedPrice: content.suggestedPrice ?? null,
    priceConfirmed: changedPrice
      ? content.suggestedPrice === null
        ? 1
        : 0
      : p.priceConfirmed,
    version: p.version + 1,
    updatedAt: time,
    lastChangeId: changeId,
    draftSource: "mcp",
  };
  const response = draftResult(env, next);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE products SET title=?,description=?,button_label=?,presentation_json=?,suggested_price=?,price_confirmed=?,version=version+1,last_change_id=?,draft_source='mcp',updated_at=? WHERE id=? AND store_id=? AND state='draft' AND version=? AND NOT EXISTS(SELECT 1 FROM draft_requests WHERE store_id=? AND request_id=?)",
    ).bind(
      next.title,
      next.description,
      next.buttonLabel,
      next.presentationJson,
      next.suggestedPrice,
      next.priceConfirmed,
      changeId,
      time,
      p.id,
      storeId,
      data.expectedVersion,
      storeId,
      data.requestId,
    ),
    env.DB.prepare(
      "INSERT INTO draft_changes (id,store_id,product_id,version,source,actor_id,content_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND store_id=? AND last_change_id=?)",
    ).bind(
      changeId,
      storeId,
      p.id,
      next.version,
      "mcp:" + actor.connectionId,
      actor.ownerId,
      JSON.stringify(response.content),
      time,
      p.id,
      storeId,
      changeId,
    ),
    env.DB.prepare(
      "INSERT INTO draft_requests (store_id,request_id,operation,input_hash,product_id,response_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND store_id=? AND last_change_id=?)",
    ).bind(
      storeId,
      data.requestId,
      "update",
      inputHash,
      p.id,
      JSON.stringify(response),
      time,
      p.id,
      storeId,
      changeId,
    ),
  ]);
  const saved = await priorRequest(env, storeId, data.requestId, inputHash);
  if (!saved)
    throw new AppError(
      "A newer edit exists. Reload the draft before updating.",
      409,
    );
  return saved;
}
