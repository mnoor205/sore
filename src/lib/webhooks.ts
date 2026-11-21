import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { database } from "./db";
import { orders, stores, entitlements, webhookEvents } from "./schema";
import type { AppEnv } from "./env";
import {
  confirmOrder,
  refundOrder,
  releaseReservation,
  stripeClient,
} from "./payments";
import { syncSubscription } from "./billing";
import { AppError, now } from "./security";
export async function handleStripeEvent(
  env: AppEnv,
  event: Stripe.Event,
  stream: "connect" | "billing",
) {
  const db = database(env);
  if (
    await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, `${stream}:${event.id}`))
      .get()
  )
    return;
  if (stream === "connect") {
    if (!event.account) throw new AppError("Expected connected account event");
    const store = await db
      .select()
      .from(stores)
      .where(eq(stores.stripeAccount, event.account))
      .get();
    if (!store) return;
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    ) {
      const raw = event.data.object as Stripe.Checkout.Session;
      const session = await stripeClient(env).checkout.sessions.retrieve(
        raw.id,
        {},
        { stripeAccount: event.account },
      );
      if (
        session.payment_status === "paid" &&
        session.metadata?.stream === "creator"
      ) {
        if (session.metadata.store_id !== store.id)
          throw new AppError("Store mismatch");
        const amount =
          (session.amount_total || 0) -
          (session.total_details?.amount_tax || 0);
        await confirmOrder(env, session.metadata.order_id, store.id, {
          sessionId: session.id,
          paymentIntent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent!.id,
          amount,
          currency: session.currency!,
          account: event.account,
          tax: session.total_details?.amount_tax || 0,
        });
      }
    } else if (
      [
        "checkout.session.expired",
        "checkout.session.async_payment_failed",
      ].includes(event.type)
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const o = await db
        .select()
        .from(orders)
        .where(
          and(eq(orders.sessionId, session.id), eq(orders.storeId, store.id)),
        )
        .get();
      if (o?.status === "pending") {
        if (o.discountId)
          await releaseReservation(env, o.id, o.discountId, store.id);
        await db
          .update(orders)
          .set({
            status: event.type.endsWith("expired") ? "expired" : "failed",
          })
          .where(
            and(
              eq(orders.id, o.id),
              eq(orders.storeId, store.id),
              eq(orders.status, "pending"),
            ),
          );
      }
    } else if (event.type === "charge.refunded") {
      const raw = event.data.object as Stripe.Charge;
      const c = await stripeClient(env).charges.retrieve(
        raw.id,
        {},
        { stripeAccount: event.account },
      );
      if (c.payment_intent) {
        const records: { id: string; amount: number; created: number }[] = [];
        for await (const refund of stripeClient(env).refunds.list(
          { charge: c.id, limit: 100 },
          { stripeAccount: event.account },
        )) {
          if (refund.status === "succeeded")
            records.push({
              id: refund.id,
              amount: refund.amount,
              created: refund.created,
            });
          if (records.length > 1000)
            throw new AppError(
              "Refund reconciliation exceeds its safe query bound",
              503,
            );
        }
        await refundOrder(
          env,
          typeof c.payment_intent === "string"
            ? c.payment_intent
            : c.payment_intent.id,
          event.account,
          c.amount_refunded,
          c.amount,
          records,
        );
      }
    } else if (event.type === "account.updated") {
      const a = event.data.object as Stripe.Account;
      await db
        .update(stores)
        .set({ paymentsReady: a.charges_enabled ? 1 : 0 })
        .where(eq(stores.id, store.id));
    }
  } else {
    if (event.account)
      throw new AppError("Connected sales cannot change platform billing");
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    ) {
      const raw = event.data.object as Stripe.Checkout.Session,
        s = await stripeClient(env).checkout.sessions.retrieve(raw.id);
      const m = s.metadata;
      if (m?.stream === "platform" && s.payment_status === "paid") {
        const reservation = await env.DB.prepare(
          "SELECT * FROM billing_sessions WHERE id=? AND store_id=? AND session_id=?",
        )
          .bind(m.reservation, m.store_id, s.id)
          .first();
        if (!reservation) throw new AppError("Billing reservation mismatch");
        const e = await db
          .select()
          .from(entitlements)
          .where(eq(entitlements.storeId, m.store_id))
          .get();
        if (
          !e ||
          e.customerId !==
            (typeof s.customer === "string" ? s.customer : s.customer?.id)
        )
          throw new AppError("Billing customer mismatch");
        if (m.kind === "lifetime") {
          const paidIntent =
            typeof s.payment_intent === "string"
              ? s.payment_intent
              : s.payment_intent!.id;
          if (e.paymentIntent === paidIntent && e.status === "refunded") return;
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE entitlements SET kind='lifetime',status='active',payment_intent=?,updated_at=?,grant_json=(SELECT grant_json FROM billing_sessions WHERE id=?) WHERE store_id=? AND NOT EXISTS (SELECT 1 FROM billing_refunds WHERE payment_intent=? AND fully_refunded=1)",
            ).bind(
              typeof s.payment_intent === "string"
                ? s.payment_intent
                : s.payment_intent!.id,
              now(),
              m.reservation,
              m.store_id,
              paidIntent,
            ),
            env.DB.prepare(
              "UPDATE billing_sessions SET status='paid' WHERE id=?",
            ).bind(m.reservation),
          ]);
        } else if (s.subscription) {
          await env.DB.prepare(
            "UPDATE entitlements SET grant_json=(SELECT grant_json FROM billing_sessions WHERE id=?) WHERE store_id=? AND kind<>'lifetime'",
          )
            .bind(m.reservation, m.store_id)
            .run();
          await syncSubscription(
            env,
            typeof s.subscription === "string"
              ? s.subscription
              : s.subscription.id,
          );
          await env.DB.prepare(
            "UPDATE billing_sessions SET status='paid' WHERE id=?",
          )
            .bind(m.reservation)
            .run();
        }
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const s = event.data.object as Stripe.Subscription;
      await syncSubscription(env, s.id);
    } else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed"
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = invoice.parent?.subscription_details?.subscription;
      if (subscription)
        await syncSubscription(
          env,
          typeof subscription === "string" ? subscription : subscription.id,
        );
    } else if (event.type === "checkout.session.expired") {
      const s = event.data.object as Stripe.Checkout.Session;
      await env.DB.prepare(
        "UPDATE billing_sessions SET status='expired' WHERE session_id=? AND status='pending'",
      )
        .bind(s.id)
        .run();
    } else if (event.type === "charge.refunded") {
      const raw = event.data.object as Stripe.Charge,
        c = await stripeClient(env).charges.retrieve(raw.id);
      if (c.refunded && c.payment_intent) {
        const pi =
          typeof c.payment_intent === "string"
            ? c.payment_intent
            : c.payment_intent.id;
        await env.DB.prepare(
          "INSERT INTO billing_refunds (payment_intent,fully_refunded,created_at) VALUES (?,1,?) ON CONFLICT(payment_intent) DO UPDATE SET fully_refunded=1",
        )
          .bind(pi, now())
          .run();
        await db
          .update(entitlements)
          .set({ status: "refunded", updatedAt: now() })
          .where(
            and(
              eq(entitlements.paymentIntent, pi),
              eq(entitlements.kind, "lifetime"),
            ),
          );
      }
    }
  }
  await db
    .insert(webhookEvents)
    .values({ id: `${stream}:${event.id}`, stream, createdAt: now() })
    .onConflictDoNothing();
}
export async function verifyWebhook(
  env: AppEnv,
  req: Request,
  stream: "connect" | "billing",
) {
  const secret =
    stream === "connect"
      ? env.STRIPE_CONNECT_WEBHOOK_SECRET
      : env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!secret)
    throw new AppError("Webhook signing secret is not configured", 503);
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw new AppError("Missing webhook signature", 400);
  let event: Stripe.Event;
  try {
    event = await stripeClient(env).webhooks.constructEventAsync(
      await req.text(),
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    throw new AppError("Webhook signature verification failed", 400);
  }
  await handleStripeEvent(env, event, stream);
  return { received: true };
}
