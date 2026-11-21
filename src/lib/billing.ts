import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { database } from "./db";
import { stores, entitlements } from "./schema";
import { limits, type AppEnv } from "./env";
import { stripeClient } from "./payments";
import { AppError, id, now } from "./security";
export async function connectPayments(
  env: AppEnv,
  store: typeof stores.$inferSelect,
) {
  const stripe = stripeClient(env);
  let account = store.stripeAccount;
  if (!account) {
    const result = await stripe.v2.core.accounts.create(
      {
        display_name: store.name,
        contact_email: store.supportEmail,
        dashboard: "full",
        defaults: {
          currency: store.currency,
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
        return_url: `${env.APP_URL}/dashboard/settings?payments=refresh`,
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
  const price =
    kind === "lifetime"
      ? env.STRIPE_LTD_PRICE_ID
      : env.STRIPE_RECURRING_PRICE_ID;
  if (!price)
    throw new AppError(
      kind === "lifetime"
        ? "Lifetime offer has not been activated. Configure its Stripe price first."
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
  const reserved = await env.DB.prepare(
    "INSERT INTO billing_sessions (id,store_id,kind,status,expires_at,created_at,grant_json) SELECT ?,?,?,'pending',?,?,? WHERE ?<>'lifetime' OR ((SELECT COUNT(*) FROM entitlements WHERE kind='lifetime' AND status='active')+(SELECT COUNT(*) FROM billing_sessions WHERE kind='lifetime' AND status='pending')) < ?",
  )
    .bind(
      reservation,
      store.id,
      kind,
      now() + 1800000,
      now(),
      JSON.stringify(limits(env)),
      kind,
      Number(env.LTD_LIMIT || 100),
    )
    .run();
  if (!reserved.meta.changes)
    throw new AppError("The founding lifetime offer is fully reserved");
  try {
    const p = await stripe.prices.retrieve(price);
    if (
      kind === "lifetime" &&
      (p.recurring ||
        p.unit_amount !== Number(env.LTD_PRICE_CENTS || 9900) ||
        p.currency !== "usd")
    )
      throw new AppError(
        "Lifetime price does not match the configured USD offer",
      );
    const session = await stripe.checkout.sessions.create(
      {
        integration_identifier:
          "coachlane_billing_" + id().replace(/-/g, "").slice(0, 8),
        mode: kind === "lifetime" ? "payment" : "subscription",
        customer: entitlement!.customerId!,
        line_items: [{ price, quantity: 1 }],
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
