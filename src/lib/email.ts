import { and, eq, lte } from "drizzle-orm";
import { database } from "./db";
import { outbox, emailAttempts, orders } from "./schema";
import { development, type AppEnv } from "./env";
import { id, now } from "./security";
import { resourceEmail } from "./resource-email";
export async function dispatchOutbox(env: AppEnv) {
  const due = await database(env)
    .select({ id: outbox.id })
    .from(outbox)
    .where(and(eq(outbox.status, "pending"), lte(outbox.nextAt, now())))
    .limit(50);
  for (const row of due) await env.FULFILLMENT.send({ id: row.id });
  await env.DB.prepare("DELETE FROM rates WHERE expires_at<?")
    .bind(now())
    .run();
}
export async function deliverEmail(env: AppEnv, outboxId: string) {
  const row = await env.DB.prepare(
    "UPDATE outbox SET locked_until=?,attempts=attempts+1 WHERE id=? AND status='pending' AND locked_until<? AND next_at<=? RETURNING *",
  )
    .bind(now() + 60000, outboxId, now(), now())
    .first<{
      id: string;
      store_id: string;
      order_id: string;
      payload: string;
      attempts: number;
      generation: number;
    }>();
  if (!row) return;
  const db = database(env);
  const o = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, row.order_id), eq(orders.storeId, row.store_id)))
    .get();
  if (!o || !["paid", "free"].includes(o.status) || o.refunded) {
    await db
      .update(outbox)
      .set({ status: "canceled" })
      .where(eq(outbox.id, row.id));
    return;
  }
  const payload = JSON.parse(row.payload) as {
    to: string;
    name: string;
    title: string;
    url: string;
  };
  try {
    if (development(env) || o.isTest) {
      await db.batch([
        db
          .update(outbox)
          .set({ status: "development", lockedUntil: 0 })
          .where(eq(outbox.id, row.id)),
        db.insert(emailAttempts).values({
          id: id(),
          outboxId: row.id,
          status: "development: not sent",
          createdAt: now(),
        }),
      ]);
      return;
    }
    const { subject, text, html } = resourceEmail(payload);
    if (env.FULFILLMENT_EMAIL && env.EMAIL_FROM) {
      // Cloudflare Email Sending on the verified getsore.me domain.
      try {
        await env.FULFILLMENT_EMAIL.send({
          from: { email: env.EMAIL_FROM, name: "Sore" },
          to: payload.to,
          subject,
          text,
          html,
        });
      } catch {
        throw new Error("email_provider_cloudflare");
      }
    } else {
      if (!env.EMAIL_API_KEY || !env.EMAIL_FROM)
        throw new Error("email_not_configured");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.EMAIL_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `fulfillment-${row.id}-${row.generation}`,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [payload.to],
          subject,
          text,
          html,
        }),
      });
      if (!response.ok) throw new Error(`email_provider_${response.status}`);
    }
    await db.batch([
      db
        .update(outbox)
        .set({ status: "sent", lockedUntil: 0, lastError: null })
        .where(eq(outbox.id, row.id)),
      db.insert(emailAttempts).values({
        id: id(),
        outboxId: row.id,
        status: "accepted by provider",
        createdAt: now(),
      }),
    ]);
  } catch (error) {
    const code =
      error instanceof Error && /^email_/.test(error.message)
        ? error.message
        : "email_send_failed";
    await db.batch([
      db
        .update(outbox)
        .set({
          status: row.attempts >= 8 ? "failed" : "pending",
          lockedUntil: 0,
          nextAt: now() + Math.min(3600000, 2 ** row.attempts * 30000),
          lastError: code,
        })
        .where(eq(outbox.id, row.id)),
      db
        .insert(emailAttempts)
        .values({ id: id(), outboxId: row.id, status: code, createdAt: now() }),
    ]);
    throw new Error(code);
  }
}
