import Stripe from "stripe";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import {
  products,
  stores,
  orders,
  discounts,
  outbox,
  activities,
  entitlements,
} from "./schema";
import type { AppEnv } from "./env";
import { development } from "./env";
import { contact, getProduct } from "./catalog";
import { AppError, hash, id, now, token } from "./security";
export function stripeClient(env: AppEnv) {
  if (!env.STRIPE_SECRET_KEY)
    throw new AppError(
      "Stripe is not configured. Connect your sandbox to continue.",
      503,
    );
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}
export function entitled(
  e:
    | {
        kind: string;
        status: string;
        paidUntil: number | null;
        graceUntil: number | null;
      }
    | undefined,
  at = now(),
) {
  if (!e) return false;
  if (e.kind === "lifetime") return e.status === "active";
  return (
    e.kind === "subscription" &&
    ((e.status === "active" && (e.paidUntil || 0) > at) ||
      (e.status === "past_due" && (e.graceUntil || 0) > at))
  );
}
export async function requireSelling(env: AppEnv, storeId: string) {
  const db = database(env);
  const s = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (development(env)) return;
  const e = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.storeId, storeId))
    .get();
  if (!entitled(e))
    throw new AppError(
      "This store is not accepting new checkouts. Existing purchase access remains available.",
      403,
    );
}
export const checkoutInput = z.object({
  productId: z.string().max(80),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  marketing: z.boolean().default(false),
  code: z.string().trim().max(40).optional(),
});
export async function beginCheckout(
  env: AppEnv,
  storeId: string,
  input: unknown,
) {
  const data = checkoutInput.parse(input);
  await requireSelling(env, storeId);
  const db = database(env),
    p = await getProduct(env, storeId, data.productId),
    s = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (p.state !== "published" || p.kind !== "resource" || !s)
    throw new AppError("This product is unavailable", 404);
  if (
    p.price > 0 &&
    !development(env) &&
    (!s.stripeAccount || !s.paymentsReady)
  )
    throw new AppError("This creator has not activated payments", 409);
  const c = await contact(env, storeId, data.name, data.email, data.marketing),
    orderId = id(),
    accessToken = token();
  let discount: typeof discounts.$inferSelect | undefined;
  if (data.code && p.price > 0) {
    discount = await db
      .select()
      .from(discounts)
      .where(
        and(
          eq(discounts.storeId, storeId),
          eq(discounts.productId, p.id),
          eq(discounts.code, data.code.toUpperCase()),
        ),
      )
      .get();
    if (!discount) throw new AppError("Discount code is invalid");
    const reserved = await env.DB.prepare(
      "UPDATE discounts SET reserved=reserved+1 WHERE id=? AND store_id=? AND expires_at>? AND used+reserved<max_uses RETURNING id",
    )
      .bind(discount.id, storeId, now())
      .first();
    if (!reserved)
      throw new AppError(
        "This discount has expired or reached its redemption limit",
      );
  }
  let orderCreated = false;
  const amount = Math.round((p.price * (100 - (discount?.percent || 0))) / 100),
    accessUrl = `${env.APP_URL}/access/${orderId}?token=${accessToken}`;
  try {
    await db.batch([
      db.insert(orders).values({
        id: orderId,
        storeId,
        productId: p.id,
        contactId: c.id,
        title: p.title,
        description: p.description,
        assetId: p.assetId,
        deliveryUrl: p.deliveryUrl,
        amount,
        currency: s.currency,
        status: p.price === 0 ? "free" : "pending",
        connectedAccount: s.stripeAccount,
        discountId: discount?.id,
        discountPercent: discount?.percent || 0,
        accessHash: await hash(accessToken),
        createdAt: now(),
      }),
      db.insert(outbox).values({
        id: orderId,
        storeId,
        orderId,
        payload: JSON.stringify({
          to: c.email,
          name: c.name,
          title: p.title,
          url: accessUrl,
        }),
        status: p.price === 0 ? "pending" : "awaiting_payment",
        nextAt: now(),
        createdAt: now(),
      }),
      ...(p.price === 0
        ? [
            db.insert(activities).values({
              id: id(),
              storeId,
              contactId: c.id,
              productId: p.id,
              kind: "free_signup",
              createdAt: now(),
            }),
          ]
        : []),
    ]);
    orderCreated = true;
    if (p.price === 0)
      return {
        url: accessUrl,
        orderId,
        mode: development(env) ? "development" : "production",
      };
    if (development(env))
      return {
        url: `${env.APP_URL}/checkout/${orderId}?token=${accessToken}`,
        orderId,
        mode: "development",
      };
    const stripe = stripeClient(env),
      bps = Number(env.PLATFORM_FEE_BPS || 0);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        integration_identifier:
          "coachlane_creator_" + id().replace(/-/g, "").slice(0, 8),
        customer_email: c.email,
        line_items: [
          {
            price_data: {
              currency: s.currency,
              unit_amount: amount,
              tax_behavior: "exclusive",
              product_data: { name: p.title },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: { order_id: orderId, store_id: storeId },
          ...(bps
            ? { application_fee_amount: Math.round((amount * bps) / 10000) }
            : {}),
        },
        metadata: { order_id: orderId, store_id: storeId, stream: "creator" },
        success_url: accessUrl,
        cancel_url: `${env.APP_URL}/${s.slug}/p/${p.id}`,
        expires_at: Math.floor(now() / 1000) + 1800,
        ...(s.taxEnabled ? { automatic_tax: { enabled: true } } : {}),
      },
      {
        stripeAccount: s.stripeAccount!,
        idempotencyKey: `checkout-${orderId}`,
      },
    );
    await db
      .update(orders)
      .set({ sessionId: session.id })
      .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)));
    return { url: session.url!, orderId, mode: "production" };
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeConnectionError ||
      error instanceof Stripe.errors.StripeAPIError
    )
      throw error;
    if (discount) {
      if (orderCreated)
        await releaseReservation(env, orderId, discount.id, storeId);
      else
        await env.DB.prepare(
          "UPDATE discounts SET reserved=MAX(0,reserved-1) WHERE id=? AND store_id=?",
        )
          .bind(discount.id, storeId)
          .run();
    }
    await db
      .update(orders)
      .set({ status: "failed" })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
    throw error;
  }
}
export async function releaseReservation(
  env: AppEnv,
  orderId: string,
  discountId: string,
  storeId: string,
) {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE discounts SET reserved=MAX(0,reserved-1) WHERE id=? AND store_id=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND store_id=? AND reservation_released=0 AND status<>'paid')",
    ).bind(discountId, storeId, orderId, storeId),
    env.DB.prepare(
      "UPDATE orders SET reservation_released=1 WHERE id=? AND store_id=? AND status<>'paid'",
    ).bind(orderId, storeId),
  ]);
}
export async function confirmOrder(
  env: AppEnv,
  orderId: string,
  storeId: string,
  values: {
    sessionId: string;
    paymentIntent: string;
    amount: number;
    currency: string;
    account: string | null;
    tax: number;
  },
) {
  const db = database(env);
  const o = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
    .get();
  if (
    !o ||
    o.amount !== values.amount ||
    o.currency !== values.currency ||
    o.connectedAccount !== values.account ||
    (o.sessionId && o.sessionId !== values.sessionId)
  )
    throw new AppError("Payment does not match order", 400);
  if (o.status === "paid") return;
  if (!["pending"].includes(o.status))
    throw new AppError("Order is no longer payable", 409);
  const operations = [
    env.DB.prepare(
      "UPDATE discounts SET used=used+1,reserved=MAX(0,reserved-1) WHERE id=? AND store_id=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND store_id=? AND status='pending')",
    ).bind(o.discountId, storeId, orderId, storeId),
    env.DB.prepare(
      "UPDATE orders SET status='paid',paid_at=?,session_id=?,payment_intent=?,tax=? WHERE id=? AND store_id=? AND status='pending'",
    ).bind(
      now(),
      values.sessionId,
      values.paymentIntent,
      values.tax,
      orderId,
      storeId,
    ),
    env.DB.prepare(
      "UPDATE outbox SET status='pending',next_at=? WHERE id=? AND store_id=? AND status='awaiting_payment' AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='paid')",
    ).bind(now(), orderId, storeId, orderId),
  ];
  await env.DB.batch(operations);
}
export async function refundOrder(
  env: AppEnv,
  paymentIntent: string,
  account: string | null,
  refundedTotal: number,
  chargeTotal: number,
  records?: { id: string; amount: number; created: number }[],
) {
  const db = database(env);
  const o = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.paymentIntent, paymentIntent),
        account === null
          ? isNull(orders.connectedAccount)
          : eq(orders.connectedAccount, account),
      ),
    )
    .get();
  if (!o || chargeTotal <= 0) return;
  const full = refundedTotal >= chargeTotal;
  const productRefund = full
    ? o.amount
    : Math.min(o.amount, Math.round((refundedTotal * o.amount) / chargeTotal));
  if (productRefund < o.refundAmount) return;
  const operations: D1PreparedStatement[] = [];
  if (records) {
    let cumulative = 0,
      allocated = 0;
    for (const r of [...records].sort(
      (a, b) => a.created - b.created || a.id.localeCompare(b.id),
    )) {
      cumulative += r.amount;
      const current = Math.min(
        o.amount,
        Math.round((cumulative * o.amount) / chargeTotal),
      );
      operations.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO refunds (id,store_id,order_id,amount,currency,created_at) VALUES (?,?,?,?,?,?)",
        ).bind(
          r.id,
          o.storeId,
          o.id,
          current - allocated,
          o.currency,
          r.created * 1000,
        ),
      );
      allocated = current;
    }
  } else {
    operations.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO refunds (id,store_id,order_id,amount,currency,created_at) SELECT ?,store_id,id,?-refund_amount,currency,? FROM orders WHERE id=? AND store_id=? AND refund_amount<?",
      ).bind(
        paymentIntent + ":" + refundedTotal,
        productRefund,
        now(),
        o.id,
        o.storeId,
        productRefund,
      ),
    );
  }
  operations.push(
    env.DB.prepare(
      "UPDATE orders SET refund_amount=?,refunded=?,refunded_at=? WHERE id=? AND store_id=? AND refund_amount<=?",
    ).bind(productRefund, full ? 1 : 0, now(), o.id, o.storeId, productRefund),
  );
  await env.DB.batch(operations);
}
