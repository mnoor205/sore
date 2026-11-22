import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { database } from "./db";
import { stores, entitlements } from "./schema";
import { limits, type AppEnv } from "./env";
import { stripeClient } from "./payments";
import { AppError, id, now } from "./security";
import { STRIPE_COUNTRIES } from "./stripe-countries";
export async function connectPayments(
  env: AppEnv,
  store: typeof stores.$inferSelect,
  country?: string,
) {
  const stripe = stripeClient(env);
  let account = store.stripeAccount;
  if (!account) {
    // Stripe requires the account's country before it accepts merchant
    // capabilities; its default currency then follows from that country.
    const code = country?.toUpperCase();
    if (!code || !(STRIPE_COUNTRIES as readonly string[]).includes(code))
      throw new AppError("Choose the country your business is based in");
    const result = await stripe.v2.core.accounts.create(
      {
        display_name: store.name,
        contact_email: store.supportEmail,
        dashboard: "full",
        identity: { country: code.toLowerCase() },
        defaults: {
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
        configuration: {
          merchant: { capabilities: { card_payments: { requested: true } } },
        },
        metadata: { store_id: store.id },
      },
      { idempotencyKey: `connect-${store.id}` },
    );
    account = result.id;
    await database(env)
      .update(stores)
      .set({ stripeAccount: account })
      .where(eq(stores.id, store.id));
  }
  const link = await stripe.v2.core.accountLinks.create({
    account,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${env.APP_URL}/api/connect/refresh`,
        return_url: `${env.APP_URL}/dashboard/payments?payments=refresh`,
      },
    },
  });
  return { url: link.url };
}
export async function refreshPayments(
  env: AppEnv,
  store: typeof stores.$inferSelect,
) {
  if (!store.stripeAccount) return { ready: false };
  const account = await stripeClient(env).v2.core.accounts.retrieve(
    store.stripeAccount,
    { include: ["configuration.merchant"] },
  );
  const ready =
    account.configuration?.merchant?.capabilities?.card_payments?.status ===
    "active";
  await database(env)
    .update(stores)
    .set({ paymentsReady: ready ? 1 : 0 })
    .where(eq(stores.id, store.id));
  return { ready };
}
export async function billingCheckout(
  env: AppEnv,
  store: typeof stores.$inferSelect,
  kind: "lifetime" | "subscription",
) {
  const db = database(env);
  let entitlement = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.storeId, store.id))
    .get();
  if (entitlement?.kind === "lifetime" && entitlement.status === "active")
    throw new AppError("Your lifetime entitlement is already active");
  if (
    entitlement?.subscriptionId &&
    ["active", "past_due"].includes(entitlement.status)
  )
    throw new AppError(
      "Manage or cancel your existing subscription in the billing portal first",
    );
  const product = env.STRIPE_LTD_PRODUCT_ID;
  const price = env.STRIPE_RECURRING_PRICE_ID;
  if (kind === "lifetime" ? !product : !price)
    throw new AppError(
      kind === "lifetime"
        ? "Lifetime offer has not been activated. Configure its Stripe product first."
        : "Recurring pricing has not been configured yet.",
      503,
    );
  const stripe = stripeClient(env);
  if (!entitlement?.customerId) {
    const customer = await stripe.customers.create(
      {
        email: store.supportEmail,
        name: store.name,
        metadata: { store_id: store.id },
      },
      { idempotencyKey: `billing-customer-${store.id}` },
    );
    await db
      .insert(entitlements)
      .values({
        storeId: store.id,
        kind: "none",
        status: "inactive",
        customerId: customer.id,
        updatedAt: now(),
      })
      .onConflictDoUpdate({
        target: entitlements.storeId,
        set: { customerId: customer.id },
      });
    entitlement = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.storeId, store.id))
      .get();
  }
  const reservation = id();
  const ladder = ladderConfig(env);
  // The founding price is locked per reservation from completed founding purchases
  // (the same count the homepage shows), so checkout never differs from the quote.
  // The cap separately counts active grants plus open reservations.
  const reserved = await env.DB.prepare(
    `INSERT INTO billing_sessions (id,store_id,kind,status,expires_at,created_at,grant_json,amount)
     SELECT ?,?,?,'pending',?,?,?,CASE WHEN ?='lifetime' THEN CAST(? AS INTEGER) + CAST(? AS INTEGER) * ((${PAID_SQL}) / CAST(? AS INTEGER)) END
     WHERE ?<>'lifetime' OR (${TAKEN_SQL}) < ?`,
  )
    .bind(
      reservation,
      store.id,
      kind,
      now() + 1800000,
      now(),
      JSON.stringify(limits(env)),
      kind,
      ladder.base,
      ladder.step,
      ladder.every,
      kind,
      ladder.limit,
    )
    .run();
  if (!reserved.meta.changes)
    throw new AppError("The founding lifetime offer is fully reserved");
  try {
    const amount =
      kind === "lifetime"
        ? (
            await env.DB.prepare(
              "SELECT amount FROM billing_sessions WHERE id=?",
            )
              .bind(reservation)
              .first<{ amount: number }>()
          )?.amount
        : null;
    if (kind === "lifetime" && !Number.isInteger(amount))
      throw new AppError("Founding price could not be reserved", 500);
    const session = await stripe.checkout.sessions.create(
      {
        integration_identifier:
          "sore_billing_" + id().replace(/-/g, "").slice(0, 8),
        mode: kind === "lifetime" ? "payment" : "subscription",
        customer: entitlement!.customerId!,
        line_items: [
          kind === "lifetime"
            ? {
                price_data: {
                  currency: "usd",
                  product: product!,
                  unit_amount: amount!,
                },
                quantity: 1,
              }
            : { price: price!, quantity: 1 },
        ],
        metadata: { store_id: store.id, kind, stream: "platform", reservation },
        ...(kind === "subscription"
          ? { subscription_data: { metadata: { store_id: store.id } } }
          : {
              invoice_creation: { enabled: true },
              payment_intent_data: {
                metadata: { store_id: store.id, kind: "lifetime" },
              },
            }),
        expires_at: Math.floor(now() / 1000) + 1800,
        success_url: `${env.APP_URL}/dashboard/billing?completed=1`,
        cancel_url: `${env.APP_URL}/dashboard/billing`,
        ...(env.PLATFORM_TAX_ENABLED === "true"
          ? {
              automatic_tax: { enabled: true },
              customer_update: { address: "auto" as const },
            }
          : {}),
      },
      { idempotencyKey: `billing-${reservation}` },
    );
    await env.DB.prepare(
      "UPDATE billing_sessions SET session_id=? WHERE id=? AND store_id=?",
    )
      .bind(session.id, reservation, store.id)
      .run();
    return { url: session.url };
  } catch (error) {
    await env.DB.prepare(
      "UPDATE billing_sessions SET status='failed' WHERE id=?",
    )
      .bind(reservation)
      .run();
    throw error;
  }
}
const TAKEN_SQL =
  "(SELECT COUNT(*) FROM entitlements WHERE kind='lifetime' AND status='active')+(SELECT COUNT(*) FROM billing_sessions WHERE kind='lifetime' AND status='pending' AND expires_at>" +
  "CAST(strftime('%s','now') AS INTEGER)*1000)";
// Completed founding purchases on real stores. Refunds don't rewind the ladder.
const PAID_SQL =
  "SELECT COUNT(DISTINCT b.session_id) FROM billing_sessions b JOIN stores s ON s.id=b.store_id WHERE b.kind='lifetime' AND b.status='paid' AND b.session_id IS NOT NULL AND s.demo=0";
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
/** Current founding offer: price for the next buyer and how many remain at it. */
export async function foundingOffer(env: AppEnv) {
  const ladder = ladderConfig(env);
  const row = await env.DB.prepare(
    `SELECT (${PAID_SQL}) AS paid, ${TAKEN_SQL} AS taken`,
  ).first<{ paid: number; taken: number }>();
  const paid = row?.paid ?? 0,
    taken = row?.taken ?? 0;
  const tier = Math.floor(paid / ladder.every);
  return {
    price: ladder.base + ladder.step * tier,
    nextPrice: ladder.base + ladder.step * (tier + 1),
    leftAtPrice: Math.min(
      ladder.every - (paid % ladder.every),
      Math.max(0, ladder.limit - taken),
    ),
    remaining: Math.max(0, ladder.limit - taken),
    available: !!env.STRIPE_LTD_PRODUCT_ID && taken < ladder.limit,
  };
}
export async function syncSubscription(env: AppEnv, subscriptionId: string) {
  const stripe = stripeClient(env),
    s = await stripe.subscriptions.retrieve(subscriptionId),
    db = database(env);
  const existing = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.subscriptionId, s.id))
    .get();
  const byCustomer =
    existing ||
    (await db
      .select()
      .from(entitlements)
      .where(
        eq(
          entitlements.customerId,
          typeof s.customer === "string" ? s.customer : s.customer.id,
        ),
      )
      .get());
  if (!byCustomer || byCustomer.kind === "lifetime") return;
  const end =
    Math.max(0, ...s.items.data.map((i) => i.current_period_end)) * 1000;
  const status =
    s.status === "active" || s.status === "trialing"
      ? "active"
      : s.status === "past_due"
        ? "past_due"
        : "inactive";
  await db
    .update(entitlements)
    .set({
      kind: "subscription",
      subscriptionId: s.id,
      status,
      paidUntil: end,
      graceUntil:
        status === "past_due"
          ? byCustomer.graceUntil || now() + 7 * 86400000
          : null,
      updatedAt: now(),
    })
    .where(eq(entitlements.storeId, byCustomer.storeId));
}
/**
 * Short-lived Account Session for Connect embedded components on the creator's
 * own connected account. The account comes from the authenticated store, never
 * from the request, so a creator can only ever manage their own Stripe account.
 */
export async function stripeAccountSession(
  env: AppEnv,
  store: typeof stores.$inferSelect,
) {
  if (!store.stripeAccount)
    throw new AppError("Connect Stripe before managing your account", 409);
  if (!env.STRIPE_PUBLISHABLE_KEY)
    throw new AppError(
      "Stripe account management isn't configured yet. Add the publishable key.",
      503,
    );
  const session = await stripeClient(env).accountSessions.create({
    account: store.stripeAccount,
    components: {
      notification_banner: { enabled: true },
      account_management: { enabled: true },
      payments: {
        enabled: true,
        features: {
          refund_management: true,
          dispute_management: true,
          capture_payments: true,
          destination_on_behalf_of_charge_management: false,
        },
      },
      payouts: { enabled: true },
    },
  });
  return {
    clientSecret: session.client_secret,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  };
}
