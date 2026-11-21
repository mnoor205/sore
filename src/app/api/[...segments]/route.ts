import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { z, ZodError } from "zod";
import { getEnv, development, storeLimits } from "@/lib/env";
import { identity, creator } from "@/lib/auth";
import { revokeSession, SESSION_COOKIE, LOGIN_COOKIE } from "@/lib/email-auth";
import { database } from "@/lib/db";
import {
  stores,
  products,
  contacts,
  orders,
  activities,
  discounts,
  outbox,
  entitlements,
  connections,
  views,
  assets,
  emailAttempts,
} from "@/lib/schema";
import {
  catalog,
  getStore,
  getProduct,
  saveProduct,
  storeInput,
  publicProduct,
} from "@/lib/catalog";
import {
  AppError,
  checkOrigin,
  csv,
  hash,
  id,
  now,
  rateLimit,
  sign,
  verify,
} from "@/lib/security";
import {
  beginCheckout,
  confirmOrder,
  refundOrder,
  stripeClient,
} from "@/lib/payments";
import {
  defaultRange,
  productPerformance,
  salesSummary,
  storeContext,
} from "@/lib/reporting";
import { download, downloadLink, orderAccess } from "@/lib/access";
import { completeUpload, prepareUpload } from "@/lib/uploads";
import {
  billingCheckout,
  connectPayments,
  refreshPayments,
} from "@/lib/billing";
import { verifyWebhook } from "@/lib/webhooks";
import {
  loadSetup,
  saveSetup,
  completeSetupStep,
  rehearseDelivery,
} from "@/lib/onboarding";
import { forPublicProduct } from "@/lib/presentation";
import { mediaResponse } from "@/lib/media";
import { deliverEmail } from "@/lib/email";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments: string[] }> };
async function route(req: NextRequest, { params }: Context) {
  try {
    const baseEnv = await getEnv(),
      env = development(baseEnv)
        ? {
            ...baseEnv,
            APP_URL: req.headers.get("origin") || req.nextUrl.origin,
          }
        : baseEnv,
      db = database(env),
      parts = (await params).segments,
      path = parts.join("/"),
      query = req.nextUrl.searchParams;
    const body = async () => {
      if (Number(req.headers.get("content-length") || 0) > 65536)
        throw new AppError("Request too large", 413);
      return req.json();
    };
    const json = (value: unknown, status = 200) =>
      NextResponse.json(value, {
        status,
        headers: { "Cache-Control": "private,no-store" },
      });
    if (path.startsWith("webhooks/") && req.method === "POST")
      return json(
        await verifyWebhook(
          env,
          req,
          parts[1] === "connect" ? "connect" : "billing",
        ),
      );
    if (req.method !== "GET") checkOrigin(req, baseEnv.APP_URL);
    if (path === "dev/session" && req.method === "POST") {
      if (!development(env)) throw new AppError("Not found", 404);
      await rateLimit(env, "dev-session", 30);
      const data = z
        .object({ workspace: z.enum(["demo", "new"]) })
        .parse(await body());
      const subject = data.workspace === "demo" ? "dev_demo" : `dev_${id()}`;
      const response = json({
        url: data.workspace === "demo" ? "/dashboard" : "/onboarding",
      });
      response.cookies.set(
        "coachlane_dev",
        await sign(
          { subject, aud: "coachlane-development" },
          env.SESSION_SECRET,
          86400,
        ),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: req.nextUrl.protocol === "https:",
          path: "/",
          maxAge: 86400,
        },
      );
      return response;
    }
    if (path === "signout" && req.method === "POST") {
      await revokeSession(env, req.cookies.get(SESSION_COOKIE)?.value);
      const response = json({
        url:
          development(env) ||
          env.AUTH_PROVIDER === "email" ||
          !env.ACCESS_ISSUER
            ? "/sign-in"
            : env.APP_URL + "/cdn-cgi/access/logout",
      });
      response.cookies.delete("coachlane_dev");
      for (const name of [SESSION_COOKIE, LOGIN_COOKIE, "__Host-coachlane_otp"])
        response.cookies.set(name, "", {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
      return response;
    }
    if (path === "setup" && req.method === "GET")
      return json(await loadSetup(env, await identity(env)));
    if (path === "setup" && req.method === "POST")
      return json(await saveSetup(env, await identity(env), await body()));
    if (path === "setup/step" && req.method === "POST") {
      const data = z
        .object({ step: z.number().int().min(1).max(5) })
        .parse(await body());
      return json(await completeSetupStep(env, await identity(env), data.step));
    }
    if (parts[0] === "media" && req.method === "GET") {
      let ownerId: string | undefined;
      try {
        ownerId = await identity(env);
      } catch {}
      return await mediaResponse(env, parts[1], ownerId);
    }
    if (path === "download" && req.method === "GET")
      return await download(env, query.get("ticket") || "");
    if (path === "upload" && req.method === "PUT") {
      if (!development(env)) throw new AppError("Not found", 404);
      const t = await verify<{
        storeId: string;
        assetId: string;
        size: number;
        type: string;
      }>(query.get("ticket") || "", env.DOWNLOAD_SECRET);
      const s = await creator(env);
      if (s.id !== t.storeId) throw new AppError("Forbidden", 403);
      const a = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, t.assetId),
            eq(assets.storeId, s.id),
            eq(assets.ready, 0),
          ),
        )
        .get();
      if (!a || Number(req.headers.get("content-length")) !== t.size)
        throw new AppError("Upload size mismatch");
      const fixed = new FixedLengthStream(t.size);
      await Promise.all([
        env.FILES.put(a.key, fixed.readable, {
          httpMetadata: { contentType: t.type },
        }),
        req.body!.pipeTo(fixed.writable),
      ]);
      return json({ uploaded: true });
    }
    if (parts[0] === "access") {
      await rateLimit(
        env,
        `access:${req.headers.get("cf-connecting-ip") || "local"}`,
        60,
      );
      const o = await orderAccess(env, parts[1], query.get("token") || "");
      if (parts[2] === "download")
        return json({
          url: await downloadLink(env, o.id, query.get("token") || ""),
        });
      return json({
        id: o.id,
        title: o.title,
        status: o.status,
        refunded: o.refunded,
        amount: o.amount,
        currency: o.currency,
        isTest: !!o.isTest,
      });
    }
    if (parts[0] === "public") {
      const s = await getStore(env, parts[1]);
      if (s.publicationState !== "published")
        throw new AppError("Store not found", 404);
      if (parts[2] === "checkout" && req.method === "POST") {
        await rateLimit(
          env,
          `checkout:${s.id}:${req.headers.get("cf-connecting-ip") || "local"}`,
          15,
        );
        return json(await beginCheckout(env, s.id, await body()));
      }
      if (parts[2] === "view" && req.method === "POST") {
        await rateLimit(
          env,
          `view:${s.id}:${req.headers.get("cf-connecting-ip") || "local"}`,
          120,
        );
        try {
          const owner = await identity(env);
          if (owner === s.ownerId)
            return json({ recorded: false, reason: "creator preview" });
        } catch {}
        const data = z
          .object({ productId: z.string(), visitor: z.string().uuid() })
          .parse(await body());
        const p = await getProduct(env, s.id, data.productId);
        if (p.state !== "published")
          throw new AppError("Product unavailable", 404);
        await db
          .insert(views)
          .values({
            id: id(),
            storeId: s.id,
            productId: p.id,
            visitorHash: await hash(`${s.id}:${data.visitor}`),
            day: new Date().toISOString().slice(0, 10),
            createdAt: now(),
          })
          .onConflictDoNothing();
        return json({ recorded: true });
      }
      if (parts[2] === "link" && req.method === "GET") {
        const p = await getProduct(env, s.id, query.get("product") || "");
        if (p.kind !== "link" || p.state !== "published" || !p.deliveryUrl)
          throw new AppError("Link not found", 404);
        return Response.redirect(p.deliveryUrl, 302);
      }
      return json({
        store: {
          name: s.name,
          slug: s.slug,
          bio: s.bio,
          photo: s.photo,
          accent: s.accent,
          currency: s.currency,
          socials: JSON.parse(s.socials),
          supportEmail: s.supportEmail,
          demo: !!s.demo,
          stylePreset: s.stylePreset,
        },
        products: (
          await db
            .select(publicProduct)
            .from(products)
            .where(
              and(eq(products.storeId, s.id), eq(products.state, "published")),
            )
            .orderBy(asc(products.position))
        ).map(forPublicProduct),
      });
    }
    if (path === "store" && req.method === "POST") {
      const ownerId = await identity(env),
        data = storeInput.parse(await body());
      if (
        await db.select().from(stores).where(eq(stores.ownerId, ownerId)).get()
      )
        throw new AppError("You already have a store");
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
      return json({ url: "/dashboard" });
    }
    if (path === "oauth/bridge") {
      const request = await verify<{ nonce: string; aud: string }>(
        query.get("request") || "",
        env.OAUTH_BRIDGE_SECRET,
      );
      if (request.aud !== env.APP_URL)
        throw new AppError("Invalid OAuth audience", 401);
      let s;
      try {
        s = await creator(env);
      } catch {
        return NextResponse.redirect(
          `${env.APP_URL}/sign-in?redirect_url=${encodeURIComponent(new URL(req.nextUrl.pathname + req.nextUrl.search, env.APP_URL).href)}`,
        );
      }
      const ticket = await sign(
        {
          nonce: request.nonce,
          subject: s.ownerId,
          storeId: s.id,
          aud: env.MCP_URL,
        },
        env.OAUTH_BRIDGE_SECRET,
        120,
      );
      return NextResponse.redirect(
        `${env.MCP_URL}/callback?ticket=${encodeURIComponent(ticket)}`,
      );
    }
    const s = await creator(env);
    await rateLimit(env, `creator:${s.id}`, 180);
    if (path === "setup/rehearse" && req.method === "POST") {
      const data = z.object({ productId: z.string() }).parse(await body());
      return json(await rehearseDelivery(env, s.id, data.productId));
    }
    if (parts[0] === "drafts" && parts[2] === "history") {
      await getProduct(env, s.id, parts[1]);
      return json({
        items: (
          await env.DB.prepare(
            "SELECT version,source,actor_id,created_at FROM draft_changes WHERE store_id=? AND product_id=? ORDER BY created_at DESC LIMIT 50",
          )
            .bind(s.id, parts[1])
            .all()
        ).results,
      });
    }
    if (path === "workspace") {
      const from = query.get("from"),
        to = query.get("to");
      const range =
        from && to
          ? { from, to }
          : defaultRange(Number(query.get("days") || 30));
      const [items, summary, performance, entitlement] = await Promise.all([
        catalog(env, s.id),
        salesSummary(env, s.id, range),
        productPerformance(env, s.id, range),
        db
          .select()
          .from(entitlements)
          .where(eq(entitlements.storeId, s.id))
          .get(),
      ]);
      const quota = await storeLimits(env, s.id);
      return json({
        store: s,
        products: items,
        summary,
        performance,
        entitlement: entitlement
          ? {
              kind: entitlement.kind,
              status: entitlement.status,
              paidUntil: entitlement.paidUntil,
              graceUntil: entitlement.graceUntil,
            }
          : null,
        mode: env.APP_MODE,
        limits: {
          products: quota.products,
          uploadMB: quota.upload / 1024 / 1024,
          storageMB: quota.storage / 1024 / 1024,
        },
        mcpUrl: `${env.MCP_URL}/mcp`,
        feesBps: Number(env.PLATFORM_FEE_BPS || 0),
        ltdPrice: Number(env.LTD_PRICE_CENTS || 9900),
        recurringConfigured: !!env.STRIPE_RECURRING_PRICE_ID,
        stripeConfigured: !!env.STRIPE_SECRET_KEY,
      });
    }
    if (path === "store/link-copied" && req.method === "POST") {
      await db
        .update(stores)
        .set({ linkCopiedAt: now() })
        .where(eq(stores.id, s.id));
      return json({ recorded: true });
    }
    if (path === "store" && req.method === "PATCH") {
      const data = storeInput.parse(await body());
      if (data.currency !== s.currency) {
        const existing = await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.storeId, s.id))
          .limit(1);
        if (existing.length)
          throw new AppError(
            "Store currency cannot change after an order has been created",
          );
      }
      const taken = await db
        .select()
        .from(stores)
        .where(eq(stores.slug, data.slug))
        .get();
      if (taken && taken.id !== s.id)
        throw new AppError("This address is already taken");
      await db
        .update(stores)
        .set({ ...data, socials: JSON.stringify(data.socials) })
        .where(eq(stores.id, s.id));
      return json({ saved: true });
    }
    if (parts[0] === "products") {
      if (req.method === "POST" || req.method === "PATCH")
        return json({
          id: await saveProduct(env, s.id, await body(), parts[1]),
        });
      if (req.method === "DELETE") {
        await getProduct(env, s.id, parts[1]);
        await db
          .update(products)
          .set({ state: "archived", updatedAt: now() })
          .where(and(eq(products.id, parts[1]), eq(products.storeId, s.id)));
        return json({ archived: true });
      }
    }
    if (path === "reorder" && req.method === "POST") {
      const data = z
        .object({ ids: z.array(z.string()).max(100) })
        .parse(await body());
      const items = await catalog(env, s.id);
      if (
        new Set(data.ids).size !== data.ids.length ||
        data.ids.length !== items.length ||
        data.ids.some((v) => !items.some((p) => p.id === v))
      )
        throw new AppError("Product list changed. Refresh and try again.");
      if (data.ids.length)
        await env.DB.batch(
          data.ids.map((pid, position) =>
            env.DB.prepare(
              "UPDATE products SET position=? WHERE id=? AND store_id=?",
            ).bind(position, pid, s.id),
          ),
        );
      return json({ saved: true });
    }
    if (path === "uploads" && req.method === "POST")
      return json(await prepareUpload(env, s.id, await body()));
    if (path === "uploads/complete" && req.method === "POST")
      return json(
        await completeUpload(
          env,
          s.id,
          z.object({ assetId: z.string() }).parse(await body()).assetId,
        ),
      );
    if (path === "customers" || path === "orders") {
      const search = (query.get("search") || "").slice(0, 254);
      let data: Record<string, unknown>[];
      if (path === "customers")
        data = await db
          .select({
            id: contacts.id,
            name: contacts.name,
            email: contacts.email,
            marketing: contacts.marketing,
            createdAt: contacts.createdAt,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.storeId, s.id),
              eq(contacts.isTest, 0),
              search ? like(contacts.email, `%${search}%`) : undefined,
            ),
          )
          .orderBy(desc(contacts.createdAt))
          .limit(query.has("csv") ? 10000 : 200);
      else
        data = await db
          .select({
            id: orders.id,
            title: orders.title,
            email: contacts.email,
            amount: orders.amount,
            currency: orders.currency,
            tax: orders.tax,
            status: orders.status,
            refunded: orders.refunded,
            refundAmount: orders.refundAmount,
            createdAt: orders.createdAt,
            deliveryStatus: outbox.status,
            paymentIntent: orders.paymentIntent,
            connectedAccount: orders.connectedAccount,
          })
          .from(orders)
          .innerJoin(
            contacts,
            and(eq(contacts.id, orders.contactId), eq(contacts.storeId, s.id)),
          )
          .leftJoin(
            outbox,
            and(eq(outbox.orderId, orders.id), eq(outbox.storeId, s.id)),
          )
          .where(
            and(
              eq(orders.storeId, s.id),
              eq(orders.isTest, 0),
              search ? like(contacts.email, `%${search}%`) : undefined,
            ),
          )
          .orderBy(desc(orders.createdAt))
          .limit(query.has("csv") ? 10000 : 200);
      if (query.has("csv"))
        return new Response(csv(data), {
          headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition": `attachment; filename="${path}.csv"`,
            "Cache-Control": "no-store",
          },
        });
      return json({ items: data, limit: 200 });
    }
    if (path === "orders/resend" && req.method === "POST") {
      const orderId = z
        .object({ orderId: z.string() })
        .parse(await body()).orderId;
      const o = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.storeId, s.id)))
        .get();
      if (!o || !["paid", "free"].includes(o.status) || o.refunded)
        throw new AppError("This order has no active access", 403);
      await db
        .update(outbox)
        .set({
          status: "pending",
          generation: sql`${outbox.generation}+1`,
          attempts: 0,
          nextAt: now(),
          lockedUntil: 0,
          lastError: null,
        })
        .where(and(eq(outbox.orderId, orderId), eq(outbox.storeId, s.id)));
      if (development(env)) await deliverEmail(env, orderId);
      else await env.FULFILLMENT.send({ id: orderId });
      return json({ queued: true, mode: env.APP_MODE });
    }
    if (path === "discounts") {
      if (req.method === "GET")
        return json({
          items: await db
            .select()
            .from(discounts)
            .where(eq(discounts.storeId, s.id)),
        });
      const data = z
        .object({
          productId: z.string(),
          code: z
            .string()
            .trim()
            .min(2)
            .max(40)
            .regex(/^[a-zA-Z0-9_-]+$/),
          percent: z.number().int().min(1).max(99),
          expiresAt: z.number().int().min(now()),
          maxUses: z.number().int().min(1).max(100000),
        })
        .parse(await body());
      const p = await getProduct(env, s.id, data.productId);
      if (!p.price || p.kind !== "resource")
        throw new AppError("Discounts require a paid product");
      await db.insert(discounts).values({
        ...data,
        code: data.code.toUpperCase(),
        id: id(),
        storeId: s.id,
      });
      return json({ saved: true });
    }
    if (path === "payments/connect" && req.method === "POST")
      return json(await connectPayments(env, s));
    if (path === "payments/refresh" && req.method === "POST")
      return json(await refreshPayments(env, s));
    if (path === "connect/refresh" && req.method === "GET")
      return NextResponse.redirect((await connectPayments(env, s)).url);
    if (path === "billing/checkout" && req.method === "POST")
      return json(
        await billingCheckout(
          env,
          s,
          z
            .object({ kind: z.enum(["lifetime", "subscription"]) })
            .parse(await body()).kind,
        ),
      );
    if (path === "billing/portal" && req.method === "POST") {
      const e = await db
        .select()
        .from(entitlements)
        .where(eq(entitlements.storeId, s.id))
        .get();
      if (!e?.customerId) throw new AppError("No billing account yet");
      const session = await stripeClient(env).billingPortal.sessions.create({
        customer: e.customerId,
        return_url: `${env.APP_URL}/dashboard/billing`,
      });
      return json({ url: session.url });
    }
    if (path === "connections" && req.method === "GET")
      return json({
        items: await db
          .select({
            id: connections.id,
            name: connections.name,
            scopes: connections.scopes,
            createdAt: connections.createdAt,
            revokedAt: connections.revokedAt,
          })
          .from(connections)
          .where(eq(connections.storeId, s.id)),
      });
    if (path === "connections/revoke" && req.method === "POST") {
      const connectionId = z.object({ id: z.string() }).parse(await body()).id;
      await db
        .update(connections)
        .set({ revokedAt: now() })
        .where(
          and(
            eq(connections.id, connectionId),
            eq(connections.storeId, s.id),
            eq(connections.ownerId, s.ownerId),
          ),
        );
      return json({ revoked: true });
    }
    if (path === "ai-report") {
      const range = defaultRange(30),
        report = {
          generatedAt: new Date().toISOString(),
          context: await storeContext(env, s.id),
          summary: await salesSummary(env, s.id, range),
          performance: await productPerformance(env, s.id, range),
        };
      return new Response(JSON.stringify(report, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            'attachment; filename="coachlane-ai-context.json"',
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "dev/payment" && req.method === "POST") {
      if (!development(env)) throw new AppError("Not found", 404);
      const data = z
        .object({
          orderId: z.string(),
          token: z.string(),
          outcome: z.enum(["success", "failure", "refund"]),
        })
        .parse(await body());
      const o = await orderAccess(env, data.orderId, data.token);
      if (o.storeId !== s.id) throw new AppError("Forbidden", 403);
      if (data.outcome === "success")
        await confirmOrder(env, o.id, s.id, {
          sessionId: `dev_${o.id}`,
          paymentIntent: `dev_pi_${o.id}`,
          amount: o.amount,
          currency: o.currency,

          account: o.connectedAccount,
          tax: 0,
        });
      else if (data.outcome === "failure")
        await db
          .update(orders)
          .set({ status: "failed" })
          .where(
            and(
              eq(orders.id, o.id),
              eq(orders.storeId, s.id),
              eq(orders.status, "pending"),
            ),
          );
      else if (o.status === "paid")
        await refundOrder(
          env,
          o.paymentIntent!,
          o.connectedAccount,
          o.amount,
          o.amount,
        );
      return json({
        url: `/access/${o.id}?token=${data.token}`,
        mode: "development",
      });
    }
    throw new AppError("Endpoint not found", 404);
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(
      JSON.stringify({
        event: "request_failed",
        type: error instanceof Error ? error.name : "unknown",
      }),
    );
    return NextResponse.json(
      {
        error:
          "The request could not be completed. Check your configuration and try again.",
      },
      { status: 500 },
    );
  }
}
export {
  route as GET,
  route as POST,
  route as PATCH,
  route as DELETE,
  route as PUT,
};
