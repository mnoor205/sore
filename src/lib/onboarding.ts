import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { stores, products, assets, contacts, orders, outbox } from "./schema";
import {
  catalog,
  getProduct,
  saveProduct,
  storeInput,
  validatePublication,
} from "./catalog";
import { development, type AppEnv } from "./env";
import { presentation } from "./presentation";
import { AppError, hash, id, now, token } from "./security";
import { setupContentSchema, type SetupContent } from "./onboarding-types";
import { copyStanImage } from "./stan-import";
type Progress = {
  owner_id: string;
  step: number;
  content_json: string;
  store_id: string | null;
  product_id: string | null;
  version: number;
  completed: number;
  updated_at: number;
};
export async function loadSetup(env: AppEnv, ownerId: string) {
  let row = await env.DB.prepare(
    "SELECT * FROM onboarding_progress WHERE owner_id=?",
  )
    .bind(ownerId)
    .first<Progress>();
  const db = database(env),
    store = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, ownerId))
      .get();
  if (!row) {
    const list = store ? await catalog(env, store.id) : [],
      p =
        list.find((p) => !p.revisionOf && p.state === "published") ||
        list.find((p) => p.state === "draft");
    const content = setupContentSchema.parse({
      creator: store
        ? {
            name: store.name,
            slug: store.slug,
            bio: store.bio,
            photo: store.photo,
            supportEmail: store.supportEmail,
            audience: store.audience,
            whatTheySell: store.whatTheySell,
            currency: store.currency,
          }
        : {},
      product: p
        ? {
            title: p.title,
            description: p.description,
            image: p.image,
            buttonLabel: p.buttonLabel,
            isPaid: p.price > 0,
            price: p.price,
            deliveryType: p.deliveryType,
            deliveryUrl: p.deliveryUrl || "",
            assetId: p.assetId,
          }
        : {},
      appearance: store?.stylePreset || "studio",
    });
    const completed =
      !!store &&
      store.publicationState === "published" &&
      list.some((p) => p.state === "published");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO onboarding_progress(owner_id,step,content_json,store_id,product_id,completed,updated_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(
        ownerId,
        completed ? 5 : store ? 2 : 1,
        JSON.stringify(content),
        store?.id || null,
        p?.id || null,
        completed ? 1 : 0,
        now(),
      )
      .run();
    row = await env.DB.prepare(
      "SELECT * FROM onboarding_progress WHERE owner_id=?",
    )
      .bind(ownerId)
      .first<Progress>();
  }
  const product =
    row!.product_id && store
      ? await getProduct(env, store.id, row!.product_id).catch(() => null)
      : null;
  return {
    ownerId,
    step: row!.step,
    content: setupContentSchema.parse(JSON.parse(row!.content_json)),
    store: store || null,
    product,
    version: row!.version,
    completed: !!row!.completed,
    mode: env.APP_MODE,
    updatedAt: row!.updated_at,
  };
}
export async function saveSetup(env: AppEnv, ownerId: string, input: unknown) {
  const data = z
    .object({
      expectedVersion: z.number().int().positive(),
      step: z.number().int().min(1).max(5),
      content: setupContentSchema,
    })
    .strict()
    .parse(input);
  await loadSetup(env, ownerId);
  const changed = await env.DB.prepare(
    "UPDATE onboarding_progress SET content_json=?,step=?,version=version+1,updated_at=? WHERE owner_id=? AND version=? RETURNING version",
  )
    .bind(
      JSON.stringify(data.content),
      data.step,
      now(),
      ownerId,
      data.expectedVersion,
    )
    .first();
  if (!changed)
    throw new AppError(
      "Setup was edited elsewhere. Reload to resume the newest saved progress.",
      409,
    );
  return loadSetup(env, ownerId);
}
/** Copies images prefilled from a Stan import into the store, so they outlive the Stan account. */
async function rehostStanImages(
  env: AppEnv,
  ownerId: string,
  storeId: string,
  content: SetupContent,
) {
  const rehost = async (url: string) => {
    try {
      if (!/(^|\.)stanwith\.me$/i.test(new URL(url).hostname)) return url;
    } catch {
      return url;
    }
    return (await copyStanImage(env, storeId, url)) || url;
  };
  const photo = await rehost(content.creator.photo),
    image = await rehost(content.product.image);
  if (photo === content.creator.photo && image === content.product.image)
    return content;
  const next = {
    ...content,
    creator: { ...content.creator, photo },
    product: { ...content.product, image },
  };
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE onboarding_progress SET content_json=? WHERE owner_id=?",
    ).bind(JSON.stringify(next), ownerId),
    env.DB.prepare("UPDATE stores SET photo=? WHERE id=? AND photo=?").bind(
      photo,
      storeId,
      content.creator.photo,
    ),
  ]);
  return next;
}
export async function completeSetupStep(
  env: AppEnv,
  ownerId: string,
  step: number,
) {
  const state = await loadSetup(env, ownerId),
    db = database(env);
  let store = state.store,
    productId = state.product?.id || null;
  if (store && (step === 1 || step === 2))
    state.content = await rehostStanImages(
      env,
      ownerId,
      store.id,
      state.content,
    );
  if (step === 1) {
    const data = storeInput.parse(state.content.creator);
    if (!store) {
      if (
        await db.select().from(stores).where(eq(stores.slug, data.slug)).get()
      )
        throw new AppError("This store address is already taken", 409);
      const storeId = id();
      await db.insert(stores).values({
        ...data,
        id: storeId,
        ownerId,
        publicationState: "draft",
        socials: JSON.stringify(data.socials),
        createdAt: now(),
      });
      store = (await db
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .get())!;
      await env.DB.prepare(
        "UPDATE onboarding_progress SET store_id=? WHERE owner_id=?",
      )
        .bind(store.id, ownerId)
        .run();
    } else {
      const taken = await db
        .select()
        .from(stores)
        .where(eq(stores.slug, data.slug))
        .get();
      if (taken && taken.id !== store.id)
        throw new AppError("This store address is already taken", 409);
      await db
        .update(stores)
        .set({
          name: data.name,
          bio: data.bio,
          photo: data.photo,
          slug: data.slug,
          supportEmail: data.supportEmail,
          audience: data.audience,
          whatTheySell: data.whatTheySell,
        })
        .where(eq(stores.id, store.id));
    }
  } else if (step === 2) {
    if (!store) throw new AppError("Complete your creator profile first");
    const existing = state.product;
    if (state.content.product.isPaid && state.content.product.price < 1)
      throw new AppError("Enter a price for your paid product");
    const data = {
      ...state.content.product,
      price: state.content.product.isPaid ? state.content.product.price : 0,
      state: "draft",
      kind: "resource",
    };
    if (existing?.state === "published") {
      productId = await saveProduct(env, store.id, {
        ...data,
        presentation: presentation(existing.presentationJson),
      });
      await db
        .update(products)
        .set({ revisionOf: existing.id, baseVersion: existing.version })
        .where(and(eq(products.id, productId), eq(products.storeId, store.id)));
    } else
      productId = await saveProduct(
        env,
        store.id,
        { ...data, expectedVersion: existing?.version },
        existing?.id,
      );
    if (store.currency !== state.content.creator.currency) {
      const o = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.storeId, store.id), eq(orders.isTest, 0)))
        .limit(1);
      if (o.length)
        throw new AppError("Store currency is locked after the first order");
      await db
        .update(stores)
        .set({ currency: state.content.creator.currency })
        .where(eq(stores.id, store.id));
    }
    await env.DB.prepare(
      "UPDATE onboarding_progress SET product_id=? WHERE owner_id=?",
    )
      .bind(productId, ownerId)
      .run();
  } else if (step === 3) {
    if (!store) throw new AppError("Complete your creator profile first");
    await db
      .update(stores)
      .set({ stylePreset: state.content.appearance })
      .where(eq(stores.id, store.id));
  } else if (step === 5) {
    if (!store || !state.product)
      throw new AppError("Add a product before publishing");
    const p = await getProduct(env, store.id, state.product.id);
    await validatePublication(env, store.id, p);
    if (p.state !== "published")
      productId = await saveProduct(
        env,
        store.id,
        {
          ...p,
          presentation: presentation(p.presentationJson),
          state: "published",
          expectedVersion: p.version,
        },
        p.id,
      );
    await db
      .update(stores)
      .set({ publicationState: "published" })
      .where(eq(stores.id, store.id));
    await env.DB.prepare(
      "UPDATE onboarding_progress SET completed=1,product_id=? WHERE owner_id=?",
    )
      .bind(productId, ownerId)
      .run();
  }
  await env.DB.prepare(
    "UPDATE onboarding_progress SET step=?,version=version+1,updated_at=? WHERE owner_id=?",
  )
    .bind(Math.min(5, step + 1), now(), ownerId)
    .run();
  return loadSetup(env, ownerId);
}
export async function rehearseDelivery(
  env: AppEnv,
  storeId: string,
  productId: string,
) {
  const p = await getProduct(env, storeId, productId),
    db = database(env),
    store = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!store) throw new AppError("Store unavailable", 404);
  await validatePublication({ ...env, APP_MODE: "development" }, storeId, {
    ...p,
    priceConfirmed: 1,
  });
  const orderId = id(),
    contactId = id(),
    access = token(),
    url = `${env.APP_URL}/access/${orderId}?token=${access}`;
  await db.batch([
    db.insert(contacts).values({
      id: contactId,
      storeId,
      name: "Delivery rehearsal",
      email: `rehearsal-${orderId}@example.invalid`,
      marketing: 0,
      isTest: 1,
      createdAt: now(),
    }),
    db.insert(orders).values({
      id: orderId,
      storeId,
      productId: p.id,
      contactId,
      title: p.title,
      description: p.description,
      assetId: p.assetId,
      deliveryUrl: p.deliveryUrl,
      amount: p.price,
      currency: store.currency,
      status: p.price ? "paid" : "free",
      isTest: 1,
      paidAt: p.price ? now() : null,
      accessHash: await hash(access),
      createdAt: now(),
    }),
    db.insert(outbox).values({
      id: orderId,
      storeId,
      orderId,
      payload: JSON.stringify({
        to: `rehearsal-${orderId}@example.invalid`,
        name: "Delivery rehearsal",
        title: p.title,
        url,
      }),
      status: "development",
      nextAt: now(),
      createdAt: now(),
    }),
  ]);
  return {
    url,
    mode: "delivery_rehearsal",
    notice:
      "Simulated purchase for checking protected delivery. No Stripe charge or email was made. Excluded from contacts, sales and reporting. Complete a real Stripe sandbox checkout separately before launch.",
  };
}
