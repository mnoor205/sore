import type Stripe from "stripe";
import { limits, type AppEnv } from "./env";
import { stripeClient } from "./payments";
import { AppError, hash, now } from "./security";

// Founding lifetime access is sold through Stripe Payment Links: one link per
// price tier, each capped by Stripe at `every` completed checkouts. Stripe
// deactivates a link the moment its cap is reached, so the price rises every
// `every` purchases even if our webhook is late. The app only has to point
// buyers at the lowest tier that still has room, creating it on first use.

export const LIFETIME_OFFER = "founding_lifetime";

type LinkRow = {
  product_id: string;
  tier: number;
  amount: number;
  size: number;
  price_id: string;
  link_id: string;
  url: string;
  sold_out: number;
};

export type LifetimeLadder = {
  /** Current price in cents, or null once every tier is sold out. */
  price: number | null;
  nextPrice: number | null;
  /** Purchases left before the price rises. */
  leftAtPrice: number;
  /** Founding purchases left across all tiers. */
  remaining: number;
  sold: number;
  every: number;
  step: number;
  url: string | null;
  available: boolean;
};

export function ladderConfig(env: AppEnv) {
  const positive = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  return {
    base: positive(env.LTD_PRICE_CENTS, 9900),
    step: Number.isInteger(Number(env.LTD_STEP_CENTS))
      ? Math.max(0, Number(env.LTD_STEP_CENTS))
      : 1000,
    every: positive(env.LTD_STEP_EVERY, 5),
    limit: positive(env.LTD_LIMIT, 100),
  };
}

export function tierPlan(env: AppEnv, tier: number) {
  const ladder = ladderConfig(env);
  return {
    amount: ladder.base + ladder.step * tier,
    size: Math.min(ladder.every, ladder.limit - ladder.every * tier),
    tiers: Math.ceil(ladder.limit / ladder.every),
  };
}

async function tierLink(
  env: AppEnv,
  stripe: Stripe,
  product: string,
  tier: number,
): Promise<LinkRow> {
  const select = () =>
    env.DB.prepare(
      "SELECT * FROM lifetime_links WHERE product_id=? AND tier=?",
    )
      .bind(product, tier)
      .first<LinkRow>();
  const existing = await select();
  if (existing) return existing;
  const { amount, size } = tierPlan(env, tier);
  // Idempotency keys make concurrent first visitors receive the same Stripe
  // objects, so a tier can never end up with two links (and 2× the sales).
  const key = `sore-ltd-${product}-${tier}-${amount}-${size}`;
  const metadata = {
    sore_offer: LIFETIME_OFFER,
    tier: String(tier),
    amount: String(amount),
  };
  const price = await stripe.prices.create(
    { currency: "usd", unit_amount: amount, product, metadata },
    { idempotencyKey: `${key}-price` },
  );
  const link = await stripe.paymentLinks.create(
    {
      line_items: [{ price: price.id, quantity: 1 }],
      restrictions: { completed_sessions: { limit: size } },
      metadata,
      payment_intent_data: { metadata: { ...metadata, kind: "lifetime" } },
      customer_creation: "always",
      invoice_creation: { enabled: true },
      after_completion: {
        type: "redirect",
        redirect: { url: `${env.APP_URL}/sign-up?lifetime=paid` },
      },
      inactive_message:
        "This founding price just sold out. Head back to Sore to get lifetime access at the current price.",
      ...(env.PLATFORM_TAX_ENABLED === "true"
        ? { automatic_tax: { enabled: true } }
        : {}),
    },
    { idempotencyKey: `${key}-link` },
  );
  await env.DB.prepare(
    "INSERT OR IGNORE INTO lifetime_links (product_id,tier,amount,size,price_id,link_id,url,sold_out,created_at) VALUES (?,?,?,?,?,?,?,0,?)",
  )
    .bind(product, tier, amount, size, price.id, link.id, link.url, now())
    .run();
  return (await select())!;
}

/** The live ladder, read from Stripe's own completed-checkout counts. */
export async function lifetimeLadder(env: AppEnv): Promise<LifetimeLadder> {
  const ladder = ladderConfig(env);
  const product = env.STRIPE_LTD_PRODUCT_ID;
  const base = {
    every: ladder.every,
    step: ladder.step,
  };
  const { tiers } = tierPlan(env, 0);
  const done = await env.DB.prepare(
    "SELECT COALESCE(MAX(tier)+1,0) AS next FROM lifetime_links WHERE product_id=? AND sold_out=1",
  )
    .bind(product ?? "")
    .first<{ next: number }>();
  const first = Number(done?.next ?? 0);
  if (!product || !env.STRIPE_SECRET_KEY) {
    // Without Stripe nothing can be sold; quote the tier the ladder stopped at.
    const sold = Math.min(ladder.limit, ladder.every * first);
    return {
      ...base,
      price: first < tiers ? tierPlan(env, first).amount : null,
      nextPrice: first + 1 < tiers ? tierPlan(env, first + 1).amount : null,
      leftAtPrice: first < tiers ? tierPlan(env, first).size : 0,
      remaining: ladder.limit - sold,
      sold,
      url: null,
      available: false,
    };
  }
  const stripe = stripeClient(env);
  for (let tier = first; tier < tiers; tier++) {
    const row = await tierLink(env, stripe, product, tier);
    if (row.sold_out) continue;
    const link = await stripe.paymentLinks.retrieve(row.link_id);
    const cap = link.restrictions?.completed_sessions;
    const count = cap?.count ?? 0,
      size = cap?.limit ?? row.size;
    if (count >= size) {
      await env.DB.prepare(
        "UPDATE lifetime_links SET sold_out=1 WHERE product_id=? AND tier=?",
      )
        .bind(product, tier)
        .run();
      continue;
    }
    const sold = ladder.every * tier + count;
    return {
      ...base,
      price: row.amount,
      nextPrice:
        tier + 1 < tiers ? tierPlan(env, tier + 1).amount : null,
      leftAtPrice: size - count,
      remaining: Math.max(0, ladder.limit - sold),
      sold,
      url: link.url,
      // A tier link someone paused in the Dashboard stops sales rather than
      // skipping ahead to a higher price.
      available: link.active,
    };
  }
  return {
    ...base,
    price: null,
    nextPrice: null,
    leftAtPrice: 0,
    remaining: 0,
    sold: ladder.limit,
    url: null,
    available: false,
  };
}

/** Where to send a buyer right now; ties the purchase to a signed-in store. */
export async function lifetimeCheckoutUrl(env: AppEnv, storeId?: string) {
  const ladder = await lifetimeLadder(env);
  if (!ladder.url || !ladder.available)
    throw new AppError(
      ladder.price === null
        ? "The founding lifetime offer is sold out"
        : "Lifetime checkout isn't open right now",
      409,
    );
  const url = new URL(ladder.url);
  if (storeId) url.searchParams.set("client_reference_id", storeId);
  return url.href;
}

export async function ownerIdForEmail(env: AppEnv, email: string) {
  // Same namespace sign-in uses (email-auth / branded-email-auth).
  return "cf_" + (await hash(env.ACCESS_ISSUER + "\n" + email.toLowerCase()));
}

/** Record a paid payment-link checkout and grant it if the buyer has a store. */
export async function fulfillLifetimeLink(
  env: AppEnv,
  session: Stripe.Checkout.Session,
) {
  if (session.payment_status !== "paid") return;
  const linkId =
    typeof session.payment_link === "string"
      ? session.payment_link
      : session.payment_link?.id;
  const row = await env.DB.prepare(
    "SELECT * FROM lifetime_links WHERE link_id=?",
  )
    .bind(linkId)
    .first<LinkRow>();
  if (!row) throw new AppError("Unknown lifetime payment link");
  if (session.currency !== "usd" || session.amount_subtotal !== row.amount)
    throw new AppError("Founding price mismatch");
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  const email = session.customer_details?.email?.toLowerCase() || null;
  const ownerId = email ? await ownerIdForEmail(env, email) : null;
  const reference = session.client_reference_id
    ? await env.DB.prepare("SELECT id FROM stores WHERE id=?")
        .bind(session.client_reference_id)
        .first<{ id: string }>()
    : null;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO lifetime_purchases (session_id,link_id,tier,amount,payment_intent,customer_id,email,owner_id,store_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'paid',?)",
  )
    .bind(
      session.id,
      row.link_id,
      row.tier,
      row.amount,
      paymentIntent ?? null,
      typeof session.customer === "string"
        ? session.customer
        : (session.customer?.id ?? null),
      email,
      ownerId,
      reference?.id ?? null,
      now(),
    )
    .run();
  const store = reference
    ? { id: reference.id }
    : ownerId
      ? await env.DB.prepare("SELECT id FROM stores WHERE owner_id=?")
          .bind(ownerId)
          .first<{ id: string }>()
      : null;
  if (store) await claimLifetime(env, store.id);
}

/**
 * Grant lifetime access from a paid payment-link purchase made for this store,
 * or by its owner's email before the store existed. Refunded purchases never
 * grant, and an already active lifetime entitlement is left alone.
 */
export async function claimLifetime(env: AppEnv, storeId: string) {
  const store = await env.DB.prepare(
    "SELECT s.id, s.owner_id, e.kind, e.status FROM stores s LEFT JOIN entitlements e ON e.store_id=s.id WHERE s.id=?",
  )
    .bind(storeId)
    .first<{
      id: string;
      owner_id: string;
      kind: string | null;
      status: string | null;
    }>();
  if (!store || (store.kind === "lifetime" && store.status === "active"))
    return false;
  const purchase = await env.DB.prepare(
    `SELECT * FROM lifetime_purchases p WHERE p.status='paid'
       AND (p.store_id=? OR (p.store_id IS NULL AND p.owner_id=?))
       AND NOT EXISTS (SELECT 1 FROM billing_refunds r WHERE r.payment_intent=p.payment_intent AND r.fully_refunded=1)
     ORDER BY p.created_at LIMIT 1`,
  )
    .bind(store.id, store.owner_id)
    .first<{
      session_id: string;
      payment_intent: string | null;
      customer_id: string | null;
    }>();
  if (!purchase) return false;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE lifetime_purchases SET store_id=? WHERE session_id=? AND store_id IS NULL",
    ).bind(store.id, purchase.session_id),
    env.DB.prepare(
      `INSERT INTO entitlements (store_id,kind,status,customer_id,payment_intent,updated_at,grant_json)
       VALUES (?,'lifetime','active',?,?,?,?)
       ON CONFLICT(store_id) DO UPDATE SET kind='lifetime',status='active',
         customer_id=COALESCE(entitlements.customer_id,excluded.customer_id),
         payment_intent=excluded.payment_intent,updated_at=excluded.updated_at,
         grant_json=excluded.grant_json`,
    ).bind(
      store.id,
      purchase.customer_id,
      purchase.payment_intent,
      now(),
      JSON.stringify(limits(env)),
    ),
  ]);
  return true;
}
