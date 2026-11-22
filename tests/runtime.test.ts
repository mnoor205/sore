import {
  checkoutMessageUrl,
  linkMessageUrl,
  commerceData,
  customSiteDocument,
  customSiteSchema,
  CUSTOM_SITE_CSP,
  CUSTOM_SITE_SANDBOX,
  customSiteCsp,
} from "../src/lib/custom-site";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";
import {
  accessIssuer,
  accessAudience,
  accessJwks,
  accessJwt,
} from "./access-fixture";
let mf: Miniflare;
let stripeSession: Record<string, unknown> = {};
let stripeResponses: Record<string, unknown> = {};
let stripeRequests: { path: string; body: string }[] = [];
let analyticsQueries: string[] = [];
let analyticsFailure = false;
let providerCalls = 0;
let providerFail = false;
const props = {
  storeId: "a",
  ownerId: "owner_a",
  connectionId: "connection_a",
};
const range = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2027-01-01T00:00:00.000Z",
};
async function call(path: string, body: unknown) {
  const r = await mf.dispatchFetch("https://mcp.example.test/test/" + path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const data = (await r.json()) as any;
  if (path === "init" && r.status !== 200)
    throw new Error("Fixture setup failed: " + JSON.stringify(data));
  return { status: r.status, data };
}
async function query(sql: string, args: unknown[] = []) {
  return (await call("query", { sql, args })).data.results;
}
async function checkout(productId = "paid", code?: string) {
  const r = await call("checkout", {
    storeId: "a",
    input: {
      productId,
      name: "Test Buyer",
      email: "test@example.test",
      marketing: false,
      code,
    },
  });
  expect(r.status).toBe(200);
  return { ...r.data, token: new URL(r.data.url).searchParams.get("token") };
}
async function confirm(order: Record<string, any>) {
  return call("confirm", {
    orderId: order.orderId,
    storeId: "a",
    values: {
      sessionId: "cs_" + order.orderId,
      paymentIntent: "pi_" + order.orderId,
      amount: order.amount ?? 2000,
      currency: "usd",
      account: "acct_a",
      tax: 0,
    },
  });
}
async function mcp(name: string, args: unknown = {}, auth = props) {
  return call("mcp", {
    props: auth,
    message: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    },
  });
}
const png = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
]);
// Mirrors the shape of a real stan.store page: store data inside the RSC flight payload,
// with the user object referenced from a separate row.
function stanFixture() {
  const user = {
    username: "coachjo",
    full_name: "Coach Jo",
    bio: "  Helping new coaches   find clients ",
    user_image: "https://assets.stanwith.me/live/user_profile/jo.png",
    data: {
      currency: "USD",
      socials: {
        instagram: "coachjo",
        youtube: "https://www.youtube.com/@coachjo",
        mail_to: "jo@example.test",
      },
    },
  };
  const page = (
    order: number,
    product: Record<string, unknown>,
    extra = {},
  ) => ({
    page_id: order,
    type: product.type,
    order,
    status: 2,
    data: { product, ...extra },
  });
  const storeData = {
    user: "$13:0:props:user",
    store: {
      pages: [
        page(2, {
          id: 11,
          type: "link",
          title: "Work with me",
          description: "",
          image: "https://assets.stanwith.me/graphics/device/link.png",
          price: { amount: 0, currency: "USD" },
          link: { url: "https://coachjo.example.test/apply" },
        }),
        page(
          1,
          {
            id: 10,
            type: "digital-download",
            title: "Client Finder Workbook",
            description:
              "<p>Find clients &amp; keep them.</p><ul><li>12 pages</li><li>Templates</li></ul><script>alert(1)</script>",
            image: "https://assets.stanwith.me/live/msc/1/cover.png",
            price: { amount: 27.5, currency: "USD" },
          },
          { submit_title: "Get My Workbook" },
        ),
        page(3, {
          id: 12,
          type: "meeting",
          title: "Strategy call",
          description: "45 minutes",
          image: "",
          price: { amount: 150, currency: "USD" },
        }),
        { ...page(4, { id: 13, type: "link", title: "Hidden" }), status: 1 },
      ],
    },
  };
  const flight =
    "13:" +
    JSON.stringify([["$", "$L3e", null, { user }]]) +
    "\n14:" +
    JSON.stringify([["$", "$L3f", null, { storeData }]]) +
    "\n";
  const half = Math.floor(flight.length / 2);
  return `<html><body><script>self.__next_f.push([1,${JSON.stringify(flight.slice(0, half))}])</script><script>self.__next_f.push([1,${JSON.stringify(flight.slice(half))}])</script></body></html>`;
}
beforeAll(async () => {
  mkdirSync("artifacts", { recursive: true });
  await build({
    entryPoints: ["tests/runtime-worker.ts"],
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    target: "es2022",
    outfile: "artifacts/runtime-worker.mjs",
    external: ["cloudflare:workers", "node:*"],
    conditions: ["workerd", "worker", "browser"],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "artifacts/runtime-worker.mjs",
      compatibilityDate: "2026-11-19",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: { DB: "test" },
      r2Buckets: ["FILES"],
      kvNamespaces: ["OAUTH_KV"],
      bindings: {
        APP_MODE: "development",
        ACCESS_ISSUER: accessIssuer,
        ACCESS_AUDIENCE: accessAudience,
        APP_URL: "https://app.example.test",
        MCP_URL: "https://mcp.example.test",
        DOWNLOAD_SECRET: "test-download-secret-that-is-at-least-32-characters",
        SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters",
        OAUTH_BRIDGE_SECRET: "test-oauth-secret-that-is-at-least-32-characters",
        STRIPE_SECRET_KEY: "sk_test_fixture",
        STRIPE_PUBLISHABLE_KEY: "pk_test_fixture",
        STRIPE_LTD_PRODUCT_ID: "prod_ltd",
        LTD_LIMIT: "7",
        STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_fixture",
        STRIPE_BILLING_WEBHOOK_SECRET: "whsec_platform",
        EMAIL_API_KEY: "test_email_key",
        EMAIL_FROM: "Test <test@example.test>",
      },
      outboundService: async (req) => {
        if (new URL(req.url).pathname.endsWith("/analytics_engine/sql")) {
          const sql = await req.text();
          analyticsQueries.push(sql);
          if (analyticsFailure)
            return new Response("unauthorized", { status: 403 });
          return Response.json({
            data: sql.includes("formatDateTime")
              ? [
                  {
                    label: new Date().toISOString().slice(0, 10),
                    visitors: "2",
                    views: "8",
                    productViews: "3",
                  },
                ]
              : [],
          });
        }
        if (req.url === accessIssuer + "/cdn-cgi/access/certs")
          return Response.json(accessJwks);
        if (new URL(req.url).hostname === "api.stripe.com") {
          stripeRequests.push({
            path: new URL(req.url).pathname,
            body: await req.clone().text(),
          });
          return new Response(
            JSON.stringify(
              stripeResponses[new URL(req.url).pathname] || stripeSession,
            ),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (new URL(req.url).hostname === "stan.store")
          return new URL(req.url).pathname === "/coachjo"
            ? new Response(stanFixture(), {
                headers: { "Content-Type": "text/html" },
              })
            : new Response("Not found", { status: 404 });
        if (new URL(req.url).hostname === "assets.stanwith.me")
          return new Response(png, {
            headers: { "Content-Type": "image/png" },
          });
        if (new URL(req.url).hostname === "api.resend.com") {
          providerCalls++;
          return new Response(
            providerFail ? "unavailable" : '{"id":"email_test"}',
            {
              status: providerFail ? 503 : 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response("Unmocked external request", { status: 503 });
      },
    }),
  );
  await call("init", {
    sql: readdirSync("migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync("migrations/" + name, "utf8"))
      .join("\n"),
  });
}, 60000);
beforeEach(async () => {
  providerCalls = 0;
  providerFail = false;
  stripeSession = {};
  stripeResponses = {};
  stripeRequests = [];
  await call("init", {
    sql: `DELETE FROM storefront_ai_messages;\nDELETE FROM storefront_drafts;\nDELETE FROM creator_sessions;\nDELETE FROM creator_login_states;\nDELETE FROM draft_changes;\nDELETE FROM draft_requests;\nDELETE FROM onboarding_progress;\nDELETE FROM email_attempts;\nDELETE FROM outbox;\nDELETE FROM refunds;\nDELETE FROM activities;\nDELETE FROM orders;\nDELETE FROM contacts;\nDELETE FROM discounts;\nDELETE FROM views;\nDELETE FROM products;\nDELETE FROM import_sources;\nDELETE FROM assets;\nDELETE FROM entitlements;\nDELETE FROM connections;\nDELETE FROM billing_sessions;\nDELETE FROM billing_refunds;\nDELETE FROM lifetime_links;\nDELETE FROM lifetime_purchases;\nDELETE FROM webhook_events;\nDELETE FROM stores;\nDELETE FROM rates;\nINSERT INTO stores(id,owner_id,slug,name,stripe_account,demo,created_at) VALUES ('a','owner_a','store-a','Store A','acct_a',1,1),('b','owner_b','store-b','Store B','acct_b',1,1);\nINSERT INTO products(id,store_id,title,description,price,delivery_url,state,created_at,updated_at) VALUES ('paid','a','Paid Resource','Untrusted text',2000,'https://private.example.test/a','published',1,1),('free','a','Free Guide','A guide',0,'https://private.example.test/free','published',1,1),('other','b','Other Store','Other',3000,'https://private.example.test/other','published',1,1);\nINSERT INTO connections(id,store_id,owner_id,client_id,name,created_at) VALUES ('connection_a','a','owner_a','client_a','Test Client',1);\nINSERT INTO assets(id,store_id,key,name,type,size,ready,created_at) VALUES ('asset_a','a','a/file.pdf','file.pdf','application/pdf',12,1,1);`,
  });
});
afterAll(async () => {
  await mf?.dispose();
});
describe("Workers commerce and security", () => {
  it("denies cross-tenant product reads and writes", async () => {
    expect(
      (await call("product", { storeId: "b", productId: "paid" })).status,
    ).toBe(404);
    expect(
      (
        await call("save", {
          storeId: "b",
          productId: "paid",
          input: { title: "Changed", price: 1, state: "draft" },
        })
      ).status,
    ).toBe(404);
  });
  it("denies cross-tenant asset completion and attachment", async () => {
    expect(
      (await call("upload", { storeId: "b", assetId: "asset_a" })).status,
    ).toBe(404);
    expect(
      (
        await call("save", {
          storeId: "b",
          input: {
            title: "Wrong file",
            price: 1,
            deliveryType: "file",
            assetId: "asset_a",
            state: "published",
          },
        })
      ).status,
    ).toBe(404);
  });
  it("does not grant access to pending or failed payments", async () => {
    const o = await checkout();
    expect(
      (await call("access", { orderId: o.orderId, token: o.token })).data
        .allowed,
    ).toBe(false);
    expect(
      (await call("link", { orderId: o.orderId, token: o.token })).status,
    ).toBe(403);
    await query("UPDATE orders SET status='failed' WHERE id=?", [o.orderId]);
    expect((await confirm(o)).status).toBe(409);
  });
  it("confirms once and keeps fulfillment durable when checkout closes", async () => {
    const o = await checkout();
    await confirm(o);
    await confirm(o);
    expect((await query("SELECT * FROM orders")).length).toBe(1);
    expect(
      (await query("SELECT * FROM outbox WHERE status='pending'")).length,
    ).toBe(1);
    expect(
      (await call("access", { orderId: o.orderId, token: o.token })).data
        .allowed,
    ).toBe(true);
    expect(
      (await call("access", { orderId: o.orderId, token: "wrong" })).status,
    ).toBe(404);
  });
  it("verifies webhook signatures and handles duplicate Stripe webhooks", async () => {
    const o = await checkout();
    stripeSession = {
      id: "cs_" + o.orderId,
      payment_status: "paid",
      metadata: { order_id: o.orderId, store_id: "a", stream: "creator" },
      amount_total: 2000,
      total_details: { amount_tax: 0 },
      currency: "usd",
      payment_intent: "pi_" + o.orderId,
    };
    const event = {
      id: "evt_one",
      type: "checkout.session.completed",
      account: "acct_a",
      data: { object: { id: stripeSession.id } },
    };
    const payload = JSON.stringify(event),
      timestamp = Math.floor(Date.now() / 1000),
      signature = `t=${timestamp},v1=${createHmac("sha256", "whsec_fixture")
        .update(timestamp + "." + payload)
        .digest("hex")}`;
    expect(
      (await call("webhook", { payload, signature: "invalid" })).status,
    ).toBe(400);
    expect((await call("webhook", { payload, signature })).status).toBe(200);
    expect((await call("webhook", { payload, signature })).status).toBe(200);
    expect((await query("SELECT * FROM webhook_events")).length).toBe(1);
    expect(
      (await query("SELECT * FROM outbox WHERE status='pending'")).length,
    ).toBe(1);
  });
  it("pending asynchronous checkout events never unlock access", async () => {
    const o = await checkout();
    stripeSession = {
      id: "cs_" + o.orderId,
      payment_status: "unpaid",
      metadata: { order_id: o.orderId, store_id: "a", stream: "creator" },
    };
    const payload = JSON.stringify({
        id: "evt_pending",
        type: "checkout.session.completed",
        account: "acct_a",
        data: { object: { id: stripeSession.id } },
      }),
      t = Math.floor(Date.now() / 1000);
    await call("webhook", {
      payload,
      signature: `t=${t},v1=${createHmac("sha256", "whsec_fixture")
        .update(t + "." + payload)
        .digest("hex")}`,
    });
    expect(
      (await call("access", { orderId: o.orderId, token: o.token })).data
        .allowed,
    ).toBe(false);
  });
  it("refunds update metrics and revoke even an issued download ticket", async () => {
    const o = await checkout();
    await confirm(o);
    const link = (await call("link", { orderId: o.orderId, token: o.token }))
      .data.url;
    await call("refund", {
      paymentIntent: "pi_" + o.orderId,
      account: "acct_a",
      refunded: 2000,
      total: 2000,
    });
    expect(
      (await call("access", { orderId: o.orderId, token: o.token })).data
        .allowed,
    ).toBe(false);
    expect(
      (
        await call("download", {
          ticket: new URL(link).searchParams.get("ticket"),
        })
      ).status,
    ).toBe(403);
    const report = (await call("report", { storeId: "a", range })).data;
    expect(report.grossProductSales).toBe(2000);
    expect(report.refunds).toBe(2000);
  });
  it("discount expiry, product scope and concurrent redemption reservations are enforced", async () => {
    await query(
      "INSERT INTO discounts(id,store_id,product_id,code,percent,expires_at,max_uses) VALUES ('d','a','paid','SAVE',25,?,1),('old','a','paid','OLD',50,1,1)",
      [Date.now() + 3600000],
    );
    expect(
      (
        await call("checkout", {
          storeId: "a",
          input: {
            productId: "paid",
            name: "Test",
            email: "x@example.test",
            code: "OLD",
          },
        })
      ).status,
    ).toBe(400);
    const results = await Promise.all([
      call("checkout", {
        storeId: "a",
        input: {
          productId: "paid",
          name: "Test",
          email: "x@example.test",
          code: "SAVE",
        },
      }),
      call("checkout", {
        storeId: "a",
        input: {
          productId: "paid",
          name: "Test",
          email: "y@example.test",
          code: "SAVE",
        },
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const o = results.find((r) => r.status === 200)!.data;
    await confirm({ ...o, amount: 1500 });
    const d = (await query("SELECT * FROM discounts WHERE id='d'"))[0];
    expect(d.used).toBe(1);
    expect(d.reserved).toBe(0);
  });
  it("free deliveries deduplicate contacts and retain request history without marketing opt-in", async () => {
    const a = await checkout("free");
    await checkout("free");
    expect((await query("SELECT * FROM contacts")).length).toBe(1);
    expect((await query("SELECT * FROM contacts"))[0].marketing).toBe(0);
    expect((await query("SELECT * FROM activities")).length).toBe(2);
    expect(
      (await call("access", { orderId: a.orderId, token: a.token })).data
        .allowed,
    ).toBe(true);
    const report = (await call("report", { storeId: "a", range })).data;
    expect(report.freeSignups).toBe(2);
    expect(report.paidOrders).toBe(0);
  });
  it("purchased snapshots survive product replacement and archive", async () => {
    const o = await checkout();
    await confirm(o);
    await call("save", {
      storeId: "a",
      productId: "paid",
      input: {
        title: "Replacement",
        description: "New version",
        price: 5000,
        deliveryUrl: "https://example.test/replacement",
        state: "archived",
      },
    });
    const rows = await query(
      "SELECT title,delivery_url FROM orders WHERE id=?",
      [o.orderId],
    );
    expect(rows[0].title).toBe("Paid Resource");
    expect(rows[0].delivery_url).toBe("https://private.example.test/a");
    expect(
      (await call("access", { orderId: o.orderId, token: o.token })).data
        .allowed,
    ).toBe(true);
  });
  it("mismatched account, amount and currency never confirm an order", async () => {
    const o = await checkout();
    for (const extra of [
      { account: "acct_b" },
      { amount: 1 },
      { currency: "eur" },
    ])
      expect(
        (
          await call("confirm", {
            orderId: o.orderId,
            storeId: "a",
            values: {
              sessionId: "x",
              paymentIntent: "p",
              amount: 2000,
              currency: "usd",
              account: "acct_a",
              tax: 0,
              ...extra,
            },
          })
        ).status,
      ).toBe(400);
    expect(
      (await call("access", { orderId: o.orderId, token: o.token })).data
        .allowed,
    ).toBe(false);
  });
  it("lifetime and recurring entitlements have distinct lapse behavior", async () => {
    for (const [entitlement, allowed] of [
      [
        { kind: "lifetime", status: "active", paidUntil: 1, graceUntil: null },
        true,
      ],
      [
        {
          kind: "lifetime",
          status: "refunded",
          paidUntil: null,
          graceUntil: null,
        },
        false,
      ],
      [
        {
          kind: "subscription",
          status: "active",
          paidUntil: 100,
          graceUntil: null,
        },
        false,
      ],
      [
        {
          kind: "subscription",
          status: "past_due",
          paidUntil: 100,
          graceUntil: 1000,
        },
        true,
      ],
      [
        {
          kind: "subscription",
          status: "past_due",
          paidUntil: 100,
          graceUntil: 400,
        },
        false,
      ],
    ] as const)
      expect(
        (await call("entitled", { entitlement, at: 500 })).data.allowed,
      ).toBe(allowed);
  });
  it("email attempts retry safely and development never sends mail", async () => {
    const o = await checkout("free");
    await call("email", { id: o.orderId });
    expect(providerCalls).toBe(0);
    expect((await query("SELECT status FROM outbox"))[0].status).toBe(
      "development",
    );
    await query("UPDATE outbox SET status='pending' WHERE id=?", [o.orderId]);
    providerFail = true;
    expect(
      (await call("email", { id: o.orderId, production: true })).status,
    ).toBe(400);
    expect((await query("SELECT status FROM outbox"))[0].status).toBe(
      "pending",
    );
    await query("UPDATE outbox SET next_at=0 WHERE id=?", [o.orderId]);
    providerFail = false;
    await call("email", { id: o.orderId, production: true });
    await call("email", { id: o.orderId, production: true });
    expect(providerCalls).toBe(2);
    expect((await query("SELECT * FROM email_attempts")).length).toBe(3);
  });
});
describe("MCP authorization and reporting", () => {
  it("SDK Streamable HTTP initializes and advertises the four read tools and two draft-only write tools", async () => {
    const initialized = await call("mcp", {
      props,
      message: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      },
    });
    expect(initialized.data.result.serverInfo.name).toBe("sore");
    const tools = await call("mcp", {
      props,
      message: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    expect(tools.data.result.tools).toHaveLength(6);
    for (const tool of tools.data.result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(
        !["create_product_draft", "update_product_draft"].includes(tool.name),
      );
      expect(tool.outputSchema).toBeTruthy();
    }
  });
  it("catalog excludes private URLs, buyer data and other tenants", async () => {
    await checkout("free");
    const r = await mcp("list_products", { limit: 1, cursor: 0 });
    expect(r.data.result.structuredContent.products).toHaveLength(1);
    expect(r.data.result.structuredContent.nextCursor).toBe(1);
    const all = JSON.stringify(
      (await mcp("list_products", { limit: 50 })).data,
    );
    expect(all).not.toContain("private.example");
    expect(all).not.toContain("test@example");
    expect(all).not.toContain("Other Store");
  });
  it("caller supplied cross-tenant product IDs cannot authorize access", async () => {
    const r = await mcp("get_product_performance", {
      ...range,
      productId: "other",
    });
    expect(r.data.result.isError).toBe(true);
    expect(
      (await call("connection", { props: { ...props, storeId: "b" } })).status,
    ).toBe(401);
  });
  it.each([7, 30, 90, 365])(
    "reconciles %i days of product views at UTC boundaries",
    async (length) => {
      const end = Date.UTC(2026, 10, 21);
      const day = 86400000;
      const start = end - length * day;
      for (const [index, [product, time]] of (
        [
          ["free", start - length * day],
          ["paid", start - 1],
          ["paid", start],
          ["free", start],
          ["paid", end - 1],
          ["free", end],
          ["other", start],
        ] as const
      ).entries()) {
        await query("INSERT INTO views VALUES (?, ?, ?, ?, ?, ?)", [
          String(index),
          product === "other" ? "b" : "a",
          product,
          "visitor",
          new Date(time).toISOString().slice(0, 10),
          time,
        ]);
      }
      const r = await call("visits", {
        storeId: "a",
        range: {
          from: new Date(start).toISOString(),
          to: new Date(end).toISOString(),
        },
      });
      expect(r.status).toBe(200);
      expect(r.data.days).toHaveLength(length);
      expect(r.data.days[0].count).toBe(2);
      expect(r.data.days[1].count).toBe(0);
      expect(r.data.days.at(-1).count).toBe(1);
      expect(r.data.total).toBe(3);
      expect(r.data.previous).toBe(2);
      expect(r.data.products.map((p: { count: number }) => p.count)).toEqual([
        2, 1,
      ]);
    },
  );
  it("MCP totals match the dashboard reporting service", async () => {
    const o = await checkout();
    await confirm(o);
    await checkout("free");
    const dashboard = (await call("report", { storeId: "a", range })).data;
    const m = (await mcp("get_sales_summary", range)).data.result
      .structuredContent;
    expect(m).toEqual(dashboard);
  });
  it("no-data and sparse samples remain truthful and date ranges are bounded", async () => {
    const r = (await mcp("get_sales_summary", range)).data.result
      .structuredContent;
    expect(r.grossProductSales).toBe(0);
    expect(r.paidOrders).toBe(0);
    const p = (await mcp("get_product_performance", range)).data.result
      .structuredContent.products;
    expect(p[0].views).toBeNull();
    expect(p[0].sampleCount).toBe(0);
    const invalid = await mcp("get_sales_summary", {
      from: "2020-01-01T00:00:00.000Z",
      to: "2027-01-01T00:00:00.000Z",
    });
    expect(invalid.data.result.isError).toBe(true);
  });
  it("revocation blocks every subsequent tool invocation", async () => {
    await query("UPDATE connections SET revoked_at=1 WHERE id='connection_a'");
    expect((await mcp("get_store_context")).data.result.isError).toBe(true);
  });
  it("invalid and expired signed credentials fail", async () => {
    const { ticket } = (
      await call("sign", { data: { subject: "owner_a" }, seconds: -10 })
    ).data;
    expect((await call("verify", { ticket })).status).toBe(401);
    expect((await call("verify", { ticket: "bad.value" })).status).toBe(401);
  });
  it("real OAuth discovery challenges unauthenticated calls and rejects arbitrary tokens", async () => {
    const r = await mf.dispatchFetch("https://mcp.example.test/mcp");
    if (r.status !== 401) console.log("OAuth error:", await r.clone().text());
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("resource_metadata");
    const metadata = await mf.dispatchFetch(
      "https://mcp.example.test/.well-known/oauth-protected-resource/mcp",
    );
    const discovered = (await metadata.json()) as any;
    expect(discovered.resource).toBe("https://mcp.example.test/mcp");
    // Draft writes are optional; only read access is required at the resource.
    expect(discovered.scopes_supported).toEqual(["store:read"]);
    const bad = await mf.dispatchFetch("https://mcp.example.test/mcp", {
      headers: { Authorization: "Bearer arbitrary-global-key" },
    });
    expect(bad.status).toBe(401);
  });
});

it("OAuth completes a real PKCE consent/token round trip and enforces audience and revocation", async () => {
  const resource = "https://mcp.example.test/mcp",
    redirect = "https://client.example.test/callback",
    verifier = "a".repeat(64),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const registered = await mf.dispatchFetch(
    "https://mcp.example.test/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Runtime AI Client",
        redirect_uris: [redirect],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    },
  );
  expect(registered.status, await registered.clone().text()).toBe(201);
  const client = (await registered.json()) as any;
  const u = new URL("https://mcp.example.test/authorize");
  u.search = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: redirect,
    scope: "store:read products:draft:write",
    state: "state123",
    resource,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const initial = await mf.dispatchFetch(u, { redirect: "manual" });
  expect(initial.status).toBe(302);
  const loginCookie = initial.headers.get("set-cookie")!.split(";")[0],
    bridge = new URL(initial.headers.get("location")!).searchParams.get(
      "request",
    );
  const decoded = (await call("verify", { ticket: bridge })).data;
  const ticket = (
    await call("sign", {
      data: {
        nonce: decoded.nonce,
        subject: "owner_a",
        storeId: "a",
        aud: "https://mcp.example.test",
      },
      seconds: 120,
    })
  ).data.ticket;
  const callback = await mf.dispatchFetch(
    "https://mcp.example.test/callback?ticket=" + encodeURIComponent(ticket),
    { headers: { Cookie: loginCookie } },
  );
  expect(callback.status, await callback.clone().text()).toBe(200);
  const html = await callback.text(),
    handle = html.match(/name="handle" value="([^"]+)"/)![1],
    cookies = callback.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  expect(html).toContain("client.example.test");
  expect(html).toContain("Runtime AI Client");
  const approve = await mf.dispatchFetch("https://mcp.example.test/authorize", {
    redirect: "manual",
    method: "POST",
    headers: {
      Cookie: cookies,
      Origin: "https://mcp.example.test",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      handle,
      decision: "approve",
      scope: "products:draft:write",
    }),
  });
  expect(approve.status, await approve.clone().text()).toBe(302);
  const returned = new URL(approve.headers.get("location")!);
  expect(returned.searchParams.get("state")).toBe("state123");
  const exchanged = await mf.dispatchFetch(
    "https://mcp.example.test/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code: returned.searchParams.get("code")!,
        redirect_uri: redirect,
        code_verifier: verifier,
        resource,
      }),
    },
  );
  expect(exchanged.status, await exchanged.clone().text()).toBe(200);
  const tokens = (await exchanged.json()) as any;
  expect(tokens.access_token).toBeTruthy();
  const headers = {
    Authorization: "Bearer " + tokens.access_token,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  const message = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "get_store_context", arguments: {} },
  });
  const valid = await mf.dispatchFetch(resource, {
    method: "POST",
    headers,
    body: message,
  });
  expect(valid.status, await valid.clone().text()).toBe(200);
  expect(((await valid.json()) as any).result.structuredContent.name).toBe(
    "Store A",
  );
  expect(tokens.scope).toContain("products:draft:write");
  const authorizedDraft = await mf.dispatchFetch(resource, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "create_product_draft",
        arguments: {
          requestId: crypto.randomUUID(),
          content: {
            title: "Draft from authenticated OAuth client",
            description: "My existing material.",
          },
        },
      },
    }),
  });
  expect(authorizedDraft.status).toBe(200);
  expect(
    ((await authorizedDraft.json()) as any).result.structuredContent.state,
  ).toBe("draft");
  const { OAUTH_KV: kv } = await mf.getBindings<{
    OAUTH_KV: {
      list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
      get(key: string): Promise<string | null>;
      put(key: string, value: string): Promise<void>;
    };
  }>();
  const keys = await kv.list({ prefix: "token:owner_a:" });
  const accessKey = keys.keys.find((k) =>
    k.name.includes(tokens.access_token.split(":")[1]),
  );
  expect(accessKey).toBeTruthy();
  const savedToken = await kv.get(accessKey!.name);
  await kv.put(
    accessKey!.name,
    JSON.stringify({ ...JSON.parse(savedToken!), expiresAt: 1 }),
  );
  const expired = await mf.dispatchFetch(resource, {
    method: "POST",
    headers,
    body: message,
  });
  expect(expired.status).toBe(401);
  await kv.put(accessKey!.name, savedToken!);
  const wrongAudience = await mf.dispatchFetch(
    "https://mcp.example.test/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: client.client_id,
        refresh_token: tokens.refresh_token,
        resource: "https://wrong.example.test/mcp",
      }),
    },
  );
  expect(wrongAudience.status).toBe(400);
  await query("UPDATE connections SET revoked_at=1 WHERE client_id=?", [
    client.client_id,
  ]);
  const revoked = await mf.dispatchFetch(resource, {
    method: "POST",
    headers,
    body: message,
  });
  expect(revoked.status).toBe(401);
});
it("a lifetime grant keeps purchased quotas when engineering defaults change", async () => {
  await query(
    "INSERT INTO entitlements(store_id,kind,status,updated_at,grant_json) VALUES ('a','lifetime','active',1,?)",
    [JSON.stringify({ products: 50, upload: 26214400, storage: 524288000 })],
  );
  const limits = (await call("limits", { storeId: "a" })).data;
  expect(limits.products).toBe(50);
  expect(limits.storage).toBe(524288000);
  expect((await call("limits", { storeId: "b" })).data.products).toBe(2);
});
it("partial refunds retain their own reporting dates and exclude the tax portion", async () => {
  const o = await checkout();
  await confirm(o);
  const first = {
      id: "re_first",
      amount: 1200,
      created: Date.parse("2026-06-15T12:00:00Z") / 1000,
    },
    second = {
      id: "re_second",
      amount: 1200,
      created: Date.parse("2026-07-15T12:00:00Z") / 1000,
    };
  await call("refund", {
    paymentIntent: "pi_" + o.orderId,
    account: "acct_a",
    refunded: 1200,
    total: 2400,
    records: [first],
  });
  await call("refund", {
    paymentIntent: "pi_" + o.orderId,
    account: "acct_a",
    refunded: 2400,
    total: 2400,
    records: [first, second],
  });
  const june = (
    await call("report", {
      storeId: "a",
      range: {
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-07-01T00:00:00.000Z",
      },
    })
  ).data;
  expect(june.refunds).toBe(1000);
  const july = (
    await call("report", {
      storeId: "a",
      range: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z",
      },
    })
  ).data;
  expect(july.refunds).toBe(1000);
  expect((await query("SELECT * FROM refunds")).length).toBe(2);
});

async function platformEvent(
  id: string,
  type: string,
  object: Record<string, unknown>,
) {
  const payload = JSON.stringify({ id, type, data: { object } }),
    t = Math.floor(Date.now() / 1000);
  return call("webhook", {
    stream: "billing",
    payload,
    signature: `t=${t},v1=${createHmac("sha256", "whsec_platform")
      .update(t + "." + payload)
      .digest("hex")}`,
  });
}
it("verified lifetime activation preserves its grant and cannot be converted or revived after refund", async () => {
  const grant = JSON.stringify({
    products: 50,
    upload: 26214400,
    storage: 524288000,
  });
  await query(
    "INSERT INTO entitlements(store_id,customer_id,updated_at) VALUES ('a','cus_a',1)",
  );
  await query(
    "INSERT INTO billing_sessions(id,store_id,kind,session_id,expires_at,created_at,grant_json,amount) VALUES ('r','a','lifetime','cs_ltd',9999999999999,1,?,9900)",
    [grant],
  );
  stripeSession = {
    id: "cs_ltd",
    payment_status: "paid",
    customer: "cus_a",
    payment_intent: "pi_ltd",
    currency: "usd",
    amount_subtotal: 9900,
    metadata: {
      stream: "platform",
      store_id: "a",
      kind: "lifetime",
      reservation: "r",
    },
  };
  expect(
    (
      await platformEvent("evt_ltd", "checkout.session.completed", {
        id: "cs_ltd",
      })
    ).status,
  ).toBe(200);
  let e = (await query("SELECT * FROM entitlements WHERE store_id='a'"))[0];
  expect(e.kind).toBe("lifetime");
  expect(e.status).toBe("active");
  expect(e.grant_json).toBe(grant);
  stripeResponses["/v1/subscriptions/sub_old"] = {
    id: "sub_old",
    customer: "cus_a",
    status: "canceled",
    items: { data: [] },
  };
  await platformEvent("evt_old", "customer.subscription.deleted", {
    id: "sub_old",
  });
  expect(
    (await query("SELECT kind FROM entitlements WHERE store_id='a'"))[0].kind,
  ).toBe("lifetime");
  stripeResponses["/v1/charges/ch_ltd"] = {
    id: "ch_ltd",
    refunded: true,
    payment_intent: "pi_ltd",
  };
  await platformEvent("evt_refund", "charge.refunded", { id: "ch_ltd" });
  expect(
    (await query("SELECT status FROM entitlements WHERE store_id='a'"))[0]
      .status,
  ).toBe("refunded");
  await platformEvent("evt_late", "checkout.session.async_payment_succeeded", {
    id: "cs_ltd",
  });
  expect(
    (await query("SELECT status FROM entitlements WHERE store_id='a'"))[0]
      .status,
  ).toBe("refunded");
});
it("subscription webhooks activate, renew, preserve the failure grace deadline and cancel", async () => {
  await query(
    "INSERT INTO entitlements(store_id,customer_id,updated_at) VALUES ('a','cus_a',1)",
  );
  const active = {
    id: "sub_a",
    customer: "cus_a",
    status: "active",
    items: {
      data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400 }],
    },
  };
  stripeResponses["/v1/subscriptions/sub_a"] = active;
  expect(
    (
      await platformEvent("evt_active", "customer.subscription.updated", {
        id: "sub_a",
      })
    ).status,
  ).toBe(200);
  let e = (await query("SELECT * FROM entitlements WHERE store_id='a'"))[0];
  expect(e.kind).toBe("subscription");
  expect(e.status).toBe("active");
  active.items.data[0].current_period_end += 86400;
  await platformEvent("evt_renew", "invoice.paid", {
    parent: { subscription_details: { subscription: "sub_a" } },
  });
  expect(
    (await query("SELECT paid_until FROM entitlements WHERE store_id='a'"))[0]
      .paid_until,
  ).toBe(active.items.data[0].current_period_end * 1000);
  stripeResponses["/v1/subscriptions/sub_a"] = {
    ...active,
    status: "past_due",
  };
  await platformEvent("evt_failure", "invoice.payment_failed", {
    parent: { subscription_details: { subscription: "sub_a" } },
  });
  e = (await query("SELECT * FROM entitlements WHERE store_id='a'"))[0];
  expect(e.status).toBe("past_due");
  const grace = e.grace_until;
  await platformEvent("evt_failure_2", "customer.subscription.updated", {
    id: "sub_a",
  });
  expect(
    (await query("SELECT grace_until FROM entitlements WHERE store_id='a'"))[0]
      .grace_until,
  ).toBe(grace);
  stripeResponses["/v1/subscriptions/sub_a"] = {
    ...active,
    status: "canceled",
  };
  await platformEvent("evt_cancel", "customer.subscription.deleted", {
    id: "sub_a",
  });
  expect(
    (await query("SELECT status FROM entitlements WHERE store_id='a'"))[0]
      .status,
  ).toBe("inactive");
});
function stripeBody(path: string) {
  return new URLSearchParams(
    stripeRequests.filter((r) => r.path === path).at(-1)!.body,
  );
}
function tierLink(id: string, count: number, limit = 5) {
  stripeResponses[`/v1/payment_links/${id}`] = {
    id,
    active: count < limit,
    url: `https://buy.stripe.com/${id}`,
    restrictions: { completed_sessions: { count, limit } },
  };
}
it("founding price starts at $99 and rises $10 every five buys", async () => {
  // Tier 0: the app creates a $99 price and a payment link capped at 5 sales.
  stripeResponses["/v1/prices"] = { id: "price_t0" };
  stripeResponses["/v1/payment_links"] = {
    id: "plink_t0",
    url: "https://buy.stripe.com/plink_t0",
  };
  tierLink("plink_t0", 2);
  let r = await call("billing", { storeId: "a", kind: "lifetime" });
  expect(r.status).toBe(200);
  expect(r.data.url).toBe(
    "https://buy.stripe.com/plink_t0?client_reference_id=a",
  );
  expect(stripeBody("/v1/prices").get("unit_amount")).toBe("9900");
  expect(stripeBody("/v1/prices").get("product")).toBe("prod_ltd");
  expect(stripeBody("/v1/prices").get("currency")).toBe("usd");
  let link = stripeBody("/v1/payment_links");
  expect(link.get("restrictions[completed_sessions][limit]")).toBe("5");
  expect(link.get("line_items[0][price]")).toBe("price_t0");
  expect(link.get("metadata[sore_offer]")).toBe("founding_lifetime");
  // Asking again reuses the stored tier link instead of creating another.
  r = await call("billing", { storeId: "b", kind: "lifetime" });
  expect(r.data.url).toContain("plink_t0");
  expect(
    stripeRequests.filter((x) => x.path === "/v1/payment_links").length,
  ).toBe(1);

  // Stripe retires the link after its fifth sale; the next buyer gets $109.
  tierLink("plink_t0", 5);
  stripeResponses["/v1/prices"] = { id: "price_t1" };
  stripeResponses["/v1/payment_links"] = {
    id: "plink_t1",
    url: "https://buy.stripe.com/plink_t1",
  };
  tierLink("plink_t1", 0);
  r = await call("billing", { storeId: "b", kind: "lifetime" });
  expect(r.data.url).toBe(
    "https://buy.stripe.com/plink_t1?client_reference_id=b",
  );
  expect(stripeBody("/v1/prices").get("unit_amount")).toBe("10900");
  expect(
    await query("SELECT tier,amount,sold_out FROM lifetime_links ORDER BY tier"),
  ).toEqual([
    { tier: 0, amount: 9900, sold_out: 1 },
    { tier: 1, amount: 10900, sold_out: 0 },
  ]);
});
it("a paused tier link stops sales instead of skipping to a higher price", async () => {
  await query(
    "INSERT INTO lifetime_links(product_id,tier,amount,size,price_id,link_id,url,created_at) VALUES ('prod_ltd',0,9900,5,'price_t0','plink_t0','https://buy.stripe.com/plink_t0',1)",
  );
  stripeResponses["/v1/payment_links/plink_t0"] = {
    id: "plink_t0",
    active: false,
    url: "https://buy.stripe.com/plink_t0",
    restrictions: { completed_sessions: { count: 1, limit: 5 } },
  };
  expect(
    (await call("billing", { storeId: "a", kind: "lifetime" })).status,
  ).not.toBe(200);
});
function linkSession(extra: Record<string, unknown> = {}) {
  return {
    id: "cs_pl",
    payment_status: "paid",
    payment_link: "plink_t0",
    customer: "cus_pl",
    payment_intent: "pi_pl",
    currency: "usd",
    amount_subtotal: 9900,
    customer_details: { email: "Buyer@Example.com" },
    client_reference_id: null,
    metadata: { sore_offer: "founding_lifetime", tier: "0" },
    ...extra,
  };
}
async function seedTierLink() {
  await query(
    "INSERT INTO lifetime_links(product_id,tier,amount,size,price_id,link_id,url,created_at) VALUES ('prod_ltd',0,9900,5,'price_t0','plink_t0','https://buy.stripe.com/plink_t0',1)",
  );
}
it("a payment link purchase is granted to the buyer's store by checkout email, even before the store exists", async () => {
  await seedTierLink();
  stripeSession = linkSession();
  expect(
    (await platformEvent("evt_pl", "checkout.session.completed", { id: "cs_pl" }))
      .status,
  ).toBe(200);
  const owner =
    "cf_" +
    createHash("sha256")
      .update(accessIssuer + "\nbuyer@example.com")
      .digest("hex");
  const [purchase] = await query("SELECT * FROM lifetime_purchases");
  expect(purchase.owner_id).toBe(owner);
  expect(purchase.store_id).toBeNull();
  // The buyer signs up afterwards with the same email and creates a store.
  await query(
    "INSERT INTO stores(id,owner_id,slug,name,created_at) VALUES ('ltd','" +
      owner +
      "','ltd-store','LTD',1)",
  );
  expect((await call("claim-lifetime", { storeId: "ltd" })).data.claimed).toBe(
    true,
  );
  const e = (await query("SELECT * FROM entitlements WHERE store_id='ltd'"))[0];
  expect(e.kind).toBe("lifetime");
  expect(e.status).toBe("active");
  expect(e.payment_intent).toBe("pi_pl");
  // Another store can't claim the same purchase.
  expect((await call("claim-lifetime", { storeId: "b" })).data.claimed).toBe(
    false,
  );
});
it("a signed-in buyer's payment link purchase activates their store immediately and refunds revoke it", async () => {
  await seedTierLink();
  stripeSession = linkSession({ client_reference_id: "a" });
  await platformEvent("evt_pl", "checkout.session.completed", { id: "cs_pl" });
  expect(
    (await query("SELECT kind,status FROM entitlements WHERE store_id='a'"))[0],
  ).toEqual({ kind: "lifetime", status: "active" });
  stripeResponses["/v1/charges/ch_pl"] = {
    id: "ch_pl",
    refunded: true,
    payment_intent: "pi_pl",
  };
  await platformEvent("evt_refund", "charge.refunded", { id: "ch_pl" });
  expect(
    (await query("SELECT status FROM entitlements WHERE store_id='a'"))[0]
      .status,
  ).toBe("refunded");
  expect((await call("claim-lifetime", { storeId: "a" })).data.claimed).toBe(
    false,
  );
});
it("a payment link checkout that doesn't match its tier price grants nothing", async () => {
  await seedTierLink();
  stripeSession = linkSession({ client_reference_id: "a", amount_subtotal: 100 });
  expect(
    (await platformEvent("evt_pl", "checkout.session.completed", { id: "cs_pl" }))
      .status,
  ).not.toBe(200);
  expect(await query("SELECT * FROM lifetime_purchases")).toEqual([]);
});
it("lifetime activation rejects a payment that doesn't match the reserved tier", async () => {
  await query(
    "INSERT INTO entitlements(store_id,customer_id,updated_at) VALUES ('a','cus_a',1)",
  );
  await query(
    "INSERT INTO billing_sessions(id,store_id,kind,session_id,expires_at,created_at,grant_json,amount) VALUES ('r','a','lifetime','cs_ltd',9999999999999,1,'{}',10900)",
  );
  stripeSession = {
    id: "cs_ltd",
    payment_status: "paid",
    customer: "cus_a",
    payment_intent: "pi_ltd",
    currency: "usd",
    amount_subtotal: 9900,
    metadata: {
      stream: "platform",
      store_id: "a",
      kind: "lifetime",
      reservation: "r",
    },
  };
  expect(
    (
      await platformEvent("evt_cheap", "checkout.session.completed", {
        id: "cs_ltd",
      })
    ).status,
  ).not.toBe(200);
  expect(
    (await query("SELECT kind FROM entitlements WHERE store_id='a'"))[0].kind,
  ).not.toBe("lifetime");
});

it("new Connect accounts declare the creator's country and let Stripe pick currency", async () => {
  await query("UPDATE stores SET stripe_account=NULL WHERE id='a'");
  expect((await call("connect", { storeId: "a" })).status).toBe(400);
  expect((await call("connect", { storeId: "a", country: "zz" })).status).toBe(
    400,
  );
  stripeResponses["/v2/core/accounts"] = {
    id: "acct_new",
    object: "v2.core.account",
  };
  stripeResponses["/v2/core/account_links"] = {
    url: "https://connect.stripe.com/setup/x",
  };
  const r = await call("connect", { storeId: "a", country: "gb" });
  expect(r.status).toBe(200);
  expect(r.data.url).toBe("https://connect.stripe.com/setup/x");
  const created = JSON.parse(
    stripeRequests.find((x) => x.path === "/v2/core/accounts")!.body,
  );
  expect(created.identity).toEqual({ country: "gb" });
  expect(created.defaults.currency).toBeUndefined();
  expect(
    (await query("SELECT stripe_account FROM stores WHERE id='a'"))[0]
      .stripe_account,
  ).toBe("acct_new");
});
it("Stripe account sessions only cover the creator's own connected account", async () => {
  stripeResponses["/v1/account_sessions"] = {
    object: "account_session",
    account: "acct_a",
    client_secret: "accs_secret_a",
  };
  const r = await call("account-session", { storeId: "a" });
  expect(r.status).toBe(200);
  expect(r.data).toEqual({
    clientSecret: "accs_secret_a",
    publishableKey: "pk_test_fixture",
  });
  const body = new URLSearchParams(
    stripeRequests.find((x) => x.path === "/v1/account_sessions")!.body,
  );
  expect(body.get("account")).toBe("acct_a");
  expect(body.get("components[account_management][enabled]")).toBe("true");
  expect(body.get("components[payouts][enabled]")).toBe("true");
  await query("UPDATE stores SET stripe_account=NULL WHERE id='b'");
  expect((await call("account-session", { storeId: "b" })).status).toBe(409);
});

describe("Guided setup and authorized draft writes", () => {
  async function draftTool(name: string, args: unknown, scope = true) {
    return call("mcp", {
      props,
      scopes: scope ? ["store:read", "products:draft:write"] : ["store:read"],
      message: {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
  }
  async function writer() {
    await query(
      "UPDATE connections SET scopes='store:read products:draft:write' WHERE id='connection_a'",
    );
  }
  const content = {
    title: "My supplied workbook",
    description: "Existing product copy.",
    audience: "Independent coaches",
    includedItems: ["A workbook", "Two templates"],
    faqs: [
      {
        question: "Can I edit it?",
        answer: "Yes, the templates are editable.",
      },
    ],
    buttonText: "Get the workbook",
  };
  it("read authorization cannot create drafts, even with a supplied write scope argument", async () => {
    const result = await draftTool(
      "create_product_draft",
      { requestId: crypto.randomUUID(), content },
      true,
    );
    expect(result.data.result.isError).toBe(true);
    expect(
      (await query("SELECT * FROM products WHERE draft_source='mcp'")).length,
    ).toBe(0);
    await writer();
    const read = await draftTool(
      "create_product_draft",
      { requestId: crypto.randomUUID(), content },
      false,
    );
    expect(read.data.result.isError).toBe(true);
  });
  it("authorized creates are retry-safe and return only saved copy and a private review link", async () => {
    await writer();
    const input = { requestId: crypto.randomUUID(), content };
    const results = await Promise.all([
      draftTool("create_product_draft", input),
      draftTool("create_product_draft", input),
    ]);
    const a = results[0].data.result.structuredContent,
      b = results[1].data.result.structuredContent;
    expect(a).toEqual(b);
    expect(a.state).toBe("draft");
    expect(a.content.audience).toBe(content.audience);
    expect(a.reviewUrl).toContain("/dashboard/products?draft=");
    expect(
      (await query("SELECT * FROM products WHERE draft_source='mcp'")).length,
    ).toBe(1);
    expect(JSON.stringify(a)).not.toContain("private.example");
    const altered = await draftTool("create_product_draft", {
      ...input,
      content: { ...content, title: "Different content" },
    });
    expect(altered.data.result.isError).toBe(true);
  });
  it("updates use versions, preserve unspecified content and remain idempotent", async () => {
    await writer();
    const draft = (
      await draftTool("create_product_draft", {
        requestId: crypto.randomUUID(),
        content,
      })
    ).data.result.structuredContent;
    const input = {
      requestId: crypto.randomUUID(),
      draftId: draft.draftId,
      expectedVersion: 1,
      content: { description: "A revised description." },
    };
    const updated = (await draftTool("update_product_draft", input)).data.result
      .structuredContent;
    expect(updated.version).toBe(2);
    expect(updated.content.title).toBe(content.title);
    expect(updated.content.audience).toBe(content.audience);
    expect(updated.content.includedItems).toEqual(content.includedItems);
    expect(
      (await draftTool("update_product_draft", input)).data.result
        .structuredContent,
    ).toEqual(updated);
    const stale = await draftTool("update_product_draft", {
      ...input,
      requestId: crypto.randomUUID(),
      content: { title: "Stale overwrite" },
    });
    expect(stale.data.result.isError).toBe(true);
    const audit = await query(
      "SELECT source,actor_id,version FROM draft_changes WHERE product_id=? ORDER BY version",
      [draft.draftId],
    );
    expect(audit.map((r: any) => r.version)).toEqual([1, 2]);
    expect(audit[1].source).toBe("mcp:connection_a");
    expect(audit[1].actor_id).toBe("owner_a");
  });
  it("cross-tenant updates and attempts to publish or change a live price through MCP fail", async () => {
    await writer();
    const foreign = await draftTool("update_product_draft", {
      requestId: crypto.randomUUID(),
      draftId: "other",
      expectedVersion: 1,
      content: { title: "Attempted takeover" },
    });
    expect(foreign.data.result.isError).toBe(true);
    const live = await draftTool("update_product_draft", {
      requestId: crypto.randomUUID(),
      draftId: "paid",
      expectedVersion: 1,
      content: { title: "Changed live" },
    });
    expect(live.data.result.isError).toBe(true);
    for (const extra of [
      { state: "published" },
      { price: 100 },
      { storeId: "b" },
      { publish: true },
    ]) {
      const bad = await draftTool("create_product_draft", {
        requestId: crypto.randomUUID(),
        content: { ...content, ...extra },
      });
      expect(!!bad.data.error || bad.data.result?.isError).toBe(true);
    }
    expect(
      (await query("SELECT title,price FROM products WHERE id='paid'"))[0],
    ).toMatchObject({ title: "Paid Resource", price: 2000 });
  });
  it("a published product gets a separate revision and only explicit dashboard review applies a price proposal", async () => {
    await writer();
    const r = await draftTool("create_product_draft", {
      requestId: crypto.randomUUID(),
      sourceProductId: "paid",
      content: { ...content, suggestedPrice: 3500 },
    });
    const draft = r.data.result.structuredContent;
    expect(draft.sourceProductId).toBe("paid");
    expect(
      (await query("SELECT title,price FROM products WHERE id='paid'"))[0],
    ).toMatchObject({ title: "Paid Resource", price: 2000 });
    const p = (
      await query("SELECT * FROM products WHERE id=?", [draft.draftId])
    )[0];
    const input = {
      title: p.title,
      description: p.description,
      image: p.image,
      price: 3500,
      buttonLabel: p.button_label,
      deliveryType: p.delivery_type,
      deliveryUrl: p.delivery_url,
      state: "published",
      expectedVersion: 1,
    };
    const blocked = await call("save", {
      storeId: "a",
      productId: draft.draftId,
      input,
    });
    expect(blocked.status).toBe(409);
    const saved = await call("save", {
      storeId: "a",
      productId: draft.draftId,
      input: { ...input, confirmSuggestedPrice: true },
    });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    expect(saved.data.id).toBe("paid");
    expect(
      (await query("SELECT title,price FROM products WHERE id='paid'"))[0],
    ).toMatchObject({ title: content.title, price: 3500 });
    expect(
      (await query("SELECT state FROM products WHERE id=?", [draft.draftId]))[0]
        .state,
    ).toBe("archived");
  });
  it("the dashboard cannot publish a stale revision over a newer live edit", async () => {
    await writer();
    const draft = (
      await draftTool("create_product_draft", {
        requestId: crypto.randomUUID(),
        sourceProductId: "paid",
        content,
      })
    ).data.result.structuredContent;
    await query(
      "UPDATE products SET version=version+1,title='New live edit' WHERE id='paid'",
    );
    const saved = await call("save", {
      storeId: "a",
      productId: draft.draftId,
      input: {
        title: content.title,
        description: "Proposed",
        price: 2000,
        state: "published",
        deliveryUrl: "https://private.example.test/a",
      },
    });
    expect(saved.status).toBe(409);
    expect(
      (await query("SELECT title FROM products WHERE id='paid'"))[0].title,
    ).toBe("New live edit");
  });
  it("setup progress persists per owner and rejects overwriting a newer session", async () => {
    const first = (await call("setup-load", { ownerId: "new_owner" })).data;
    const next = {
      ...first.content,
      creator: {
        ...first.content.creator,
        name: "My actual name",
        slug: "actual-coach",
        supportEmail: "coach@example.test",
        audience: "First-time founders",
        whatTheySell: "My existing worksheets",
      },
    };
    expect(
      (
        await call("setup-save", {
          ownerId: "new_owner",
          input: { expectedVersion: first.version, step: 1, content: next },
        })
      ).status,
    ).toBe(200);
    const resumed = (await call("setup-load", { ownerId: "new_owner" })).data;
    expect(resumed.content).toEqual(next);
    expect(
      (await call("setup-load", { ownerId: "owner_b" })).data.content.creator
        .name,
    ).toBe("Store B");
    expect(
      (
        await call("setup-save", {
          ownerId: "new_owner",
          input: { expectedVersion: first.version, step: 1, content: next },
        })
      ).status,
    ).toBe(409);
  });
  it("a coach completes all setup steps without MCP and a free product needs no payments", async () => {
    let s = (await call("setup-load", { ownerId: "new_owner" })).data;
    let c = {
      ...s.content,
      creator: {
        ...s.content.creator,
        name: "Actual Coach",
        slug: "actual-coach",
        bio: "My own bio",
        supportEmail: "coach@example.test",
        audience: "First-time founders",
        whatTheySell: "Worksheets",
      },
      product: {
        ...s.content.product,
        title: "My actual worksheet",
        description: "My pasted copy",
        deliveryUrl: "https://example.test/worksheet",
        isPaid: false,
        price: 0,
      },
      appearance: "editorial",
    };
    s = (
      await call("setup-save", {
        ownerId: "new_owner",
        input: { expectedVersion: s.version, step: 1, content: c },
      })
    ).data;
    for (const step of [1, 2, 3, 4, 5]) {
      const r = await call("setup-step", { ownerId: "new_owner", step });
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      s = r.data;
    }
    expect(s.completed).toBe(true);
    expect(s.store.stylePreset).toBe("editorial");
    expect(s.store.stripeAccount).toBeNull();
    expect(s.store.publicationState).toBe("published");
    expect(s.product.state).toBe("published");
    expect(s.product.description).toBe("My pasted copy");
  });
  it("paid publication requires enabled payments in production, while free publication does not", async () => {
    const paid = await call("save-production", {
      storeId: "a",
      input: {
        title: "Paid attempt",
        price: 1000,
        deliveryUrl: "https://example.test/paid",
        state: "published",
      },
    });
    expect(paid.status).toBe(409);
    const free = await call("save-production", {
      storeId: "a",
      input: {
        title: "Free guide",
        price: 0,
        deliveryUrl: "https://example.test/free",
        state: "published",
      },
    });
    expect(free.status, JSON.stringify(free.data)).toBe(200);
  });
  it("a protected paid file cannot be reused as a public sample", async () => {
    const r = await call("save", {
      storeId: "a",
      input: {
        title: "Sample attempt",
        price: 0,
        deliveryUrl: "https://example.test/resource",
        state: "draft",
        presentation: { sampleAssetId: "asset_a" },
      },
    });
    expect(r.status).toBe(404);
  });
  it("a delivery rehearsal preserves privacy and never inflates recorded sales or leads", async () => {
    const r = await call("rehearse", { storeId: "a", productId: "paid" });
    expect(r.status).toBe(200);
    expect(r.data.mode).toBe("delivery_rehearsal");
    const o = (await query("SELECT * FROM orders"))[0];
    expect(o.is_test).toBe(1);
    expect((await query("SELECT * FROM contacts"))[0].is_test).toBe(1);
    const report = (await call("report", { storeId: "a", range })).data;
    expect(report.paidOrders).toBe(0);
    expect(report.grossProductSales).toBe(0);
    expect(report.freeSignups).toBe(0);
    expect((await query("SELECT status FROM outbox"))[0].status).toBe(
      "development",
    );
  });
});

describe("Cloudflare email authentication", () => {
  it("verifies signed Access identity and rejects forged, expired, wrong-audience and service credentials", async () => {
    const good = await call("email-auth-verify", { assertion: accessJwt() });
    expect(good.status).toBe(200);
    expect(good.data.ownerId).toBe(
      "cf_" +
        createHash("sha256")
          .update(accessIssuer + "\ncoach-a@example.test")
          .digest("hex"),
    );
    expect(good.data.email).toBe("coach-a@example.test");
    expect(
      (
        await call("email-auth-verify", {
          assertion: accessJwt({ sub: "re-added-access-seat" }),
        })
      ).data.ownerId,
    ).toBe(good.data.ownerId);
    const now = Math.floor(Date.now() / 1000);
    for (const assertion of [
      "not-a-token",
      accessJwt().split(".").slice(0, 2).join(".") + ".forged",
      accessJwt({ aud: ["another-app"] }),
      accessJwt({ iss: "https://another-team.cloudflareaccess.com" }),
      accessJwt({ exp: now - 30 }),
      accessJwt({ nbf: now + 120 }),
      accessJwt({ iat: now + 120 }),
      accessJwt({ sub: "", email: undefined, common_name: "service-token" }),
      accessJwt({ type: "org" }),
    ])
      expect((await call("email-auth-verify", { assertion })).status).toBe(401);
  });

  it("binds login to the initiating browser, consumes its state once and stores only a session hash", async () => {
    const started = (
      await call("email-auth-start", { returnTo: "https://evil.example/" })
    ).data;
    expect(new URL(started.url).origin).toBe("https://app.example.test");
    const input = {
      stateCookie: started.state,
      nonce: started.nonce,
      assertion: accessJwt(),
    };
    expect(
      (
        await call("email-auth-complete", {
          ...input,
          stateCookie: "forged.value",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call("email-auth-complete", {
          ...input,
          nonce: "different-browser",
        })
      ).status,
    ).toBe(401);
    const complete = await call("email-auth-complete", input);
    expect(complete.status).toBe(200);
    expect(complete.data.returnTo).toBe("/onboarding");
    expect(
      (await call("email-auth-session", { session: complete.data.session }))
        .data.email,
    ).toBe("coach-a@example.test");
    const rows = await query(
      "SELECT token_hash,expires_at FROM creator_sessions",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(
      createHash("sha256").update(complete.data.session).digest("hex"),
    );
    expect(rows[0].token_hash).not.toBe(complete.data.session);
    expect(rows[0].expires_at).toBeLessThanOrEqual(Date.now() + 3600000);
    expect((await call("email-auth-complete", input)).status).toBe(401);
  });

  it("rejects concurrent login-state replay", async () => {
    const started = (await call("email-auth-start", {})).data;
    const input = {
      stateCookie: started.state,
      nonce: started.nonce,
      assertion: accessJwt(),
    };
    const results = await Promise.all([
      call("email-auth-complete", input),
      call("email-auth-complete", input),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await query("SELECT token_hash FROM creator_sessions")).toHaveLength(
      1,
    );
  });

  it("revokes sessions on logout and refuses expired sessions", async () => {
    async function login() {
      const s = (await call("email-auth-start", {})).data;
      return (
        await call("email-auth-complete", {
          stateCookie: s.state,
          nonce: s.nonce,
          assertion: accessJwt(),
        })
      ).data.session;
    }
    const session = await login();
    expect((await call("email-auth-revoke", { session })).status).toBe(200);
    expect((await call("email-auth-session", { session })).status).toBe(401);
    const expired = await login();
    await query("UPDATE creator_sessions SET expires_at=0");
    expect(
      (await call("email-auth-session", { session: expired })).status,
    ).toBe(401);
  });
});
describe("Stan storefront import", () => {
  it("previews a Stan store without writing anything", async () => {
    const r = await call("stan-preview", {
      storeId: "a",
      url: "https://stan.store/coachjo?utm_source=ig",
    });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({
      handle: "coachjo",
      name: "Coach Jo",
      bio: "Helping new coaches find clients",
      supportEmail: "jo@example.test",
      currency: "usd",
      socials: {
        instagram: "https://www.instagram.com/coachjo",
        youtube: "https://www.youtube.com/@coachjo",
      },
      imported: [],
    });
    expect(
      r.data.products.map((p: any) => [
        p.title,
        p.kind,
        p.deliveryType,
        p.price,
      ]),
    ).toEqual([
      ["Client Finder Workbook", "resource", "file", 2750],
      ["Work with me", "link", "url", 0],
      ["Strategy call", "resource", "url", 15000],
    ]);
    const workbook = r.data.products[0];
    expect(workbook.description).toBe(
      "Find clients & keep them.\n• 12 pages\n• Templates",
    );
    expect(workbook.buttonLabel).toBe("Get My Workbook");
    expect(r.data.products[1].image).toBe("");
    expect(
      await query("SELECT id FROM products WHERE store_id='a'"),
    ).toHaveLength(2);
  });
  it("rejects non-Stan addresses and missing stores", async () => {
    expect(
      (await call("stan-preview", { url: "https://evil.example.test/coachjo" }))
        .status,
    ).toBe(400);
    expect(
      (await call("stan-preview", { url: "stan.store/nobody" })).status,
    ).toBe(404);
  });
  it("imports selected products as private drafts and skips re-imports", async () => {
    const input = {
      url: "@coachjo",
      productIds: ["10", "11", "12"],
      profile: true,
    };
    const r = await call("stan-import", { storeId: "a", input });
    expect(r.status).toBe(200);
    expect(r.data.created).toHaveLength(3);
    expect(r.data.profileUpdated).toBe(true);
    const rows = await query(
      "SELECT title,state,price,kind,delivery_type,delivery_url,image,draft_source FROM products WHERE store_id='a' AND draft_source='stan' ORDER BY position",
    );
    expect(rows.map((p: any) => [p.title, p.state, p.price, p.kind])).toEqual([
      ["Client Finder Workbook", "draft", 2750, "resource"],
      ["Work with me", "draft", 0, "link"],
      ["Strategy call", "draft", 15000, "resource"],
    ]);
    expect(rows[0].image).toMatch(/^\/api\/media\//);
    expect(rows[1].delivery_url).toBe("https://coachjo.example.test/apply");
    const assetRows = await query(
      "SELECT purpose,ready,type FROM assets WHERE store_id='a' AND purpose='image'",
    );
    expect(assetRows).toHaveLength(2);
    expect(
      assetRows.every((a: any) => a.ready === 1 && a.type === "image/png"),
    ).toBe(true);
    const store = (
      await query("SELECT bio,photo,socials FROM stores WHERE id='a'")
    )[0];
    expect(store.bio).toBe("Helping new coaches find clients");
    expect(store.photo).toMatch(/^\/api\/media\//);
    expect(JSON.parse(store.socials).instagram).toBe(
      "https://www.instagram.com/coachjo",
    );
    const again = await call("stan-import", { storeId: "a", input });
    expect(again.data.created).toHaveLength(0);
    expect(again.data.skipped.map((s: any) => s.reason)).toEqual([
      "Already imported",
      "Already imported",
      "Already imported",
    ]);
    expect(
      (await call("stan-preview", { storeId: "a", url: "coachjo" })).data
        .imported,
    ).toHaveLength(3);
    // Another tenant importing the same Stan store is unaffected.
    const other = await call("stan-import", {
      storeId: "b",
      input: { url: "coachjo", productIds: ["11"] },
    });
    expect(other.data.created).toHaveLength(1);
  });
  it("never overwrites profile fields the creator already filled in", async () => {
    await query(
      "UPDATE stores SET bio='My own bio', socials='{\"instagram\":\"https://www.instagram.com/mine\"}' WHERE id='a'",
    );
    await call("stan-import", {
      storeId: "a",
      input: { url: "coachjo", productIds: [], profile: true },
    });
    const store = (
      await query("SELECT bio,socials FROM stores WHERE id='a'")
    )[0];
    expect(store.bio).toBe("My own bio");
    expect(JSON.parse(store.socials)).toEqual({
      instagram: "https://www.instagram.com/mine",
      youtube: "https://www.youtube.com/@coachjo",
    });
  });
  it("onboarding copies Stan-hosted images into the creator's own storage", async () => {
    let s = (await call("setup-load", { ownerId: "stan_owner" })).data;
    const photo =
      "https://assets.stanwith.me/live/user_profile/jo.png/webp/433x0/85/jo.webp";
    const c = {
      ...s.content,
      creator: {
        ...s.content.creator,
        name: "Coach Jo",
        slug: "coach-jo",
        supportEmail: "jo@example.test",
        photo,
      },
      product: {
        ...s.content.product,
        title: "Client Finder Workbook",
        image:
          "https://assets.stanwith.me/live/msc/1/cover.png/webp/1200x0/100/cover.webp",
        deliveryUrl: "https://example.test/workbook",
      },
    };
    s = (
      await call("setup-save", {
        ownerId: "stan_owner",
        input: { expectedVersion: s.version, step: 1, content: c },
      })
    ).data;
    s = (await call("setup-step", { ownerId: "stan_owner", step: 1 })).data;
    // The store did not exist before step 1, so the photo is copied on the next step.
    expect(s.store.photo).toBe(photo);
    s = (await call("setup-step", { ownerId: "stan_owner", step: 2 })).data;
    expect(s.content.creator.photo).toMatch(/^\/api\/media\//);
    expect(s.store.photo).toBe(s.content.creator.photo);
    expect(s.product.image).toMatch(/^\/api\/media\//);
    expect(
      await query(
        "SELECT id FROM assets WHERE store_id=? AND purpose='image' AND ready=1",
        [s.store.id],
      ),
    ).toHaveLength(2);
  });
});

describe("Storefront AI editor", () => {
  const toolReply = (input: unknown, text = "Updated your draft.") => ({
    id: "msg_fixture",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    stop_reason: "tool_use",
    content: [
      { type: "text", text },
      { type: "tool_use", id: "toolu_1", name: "update_storefront", input },
    ],
    usage: { input_tokens: 900, output_tokens: 120 },
  });
  async function chat(
    aiResponse: unknown,
    expectedVersion: number | null = null,
    message = "Make it calm with a sage background",
    extra: Record<string, unknown> = {},
  ) {
    return call("storefront-chat", {
      storeId: "a",
      input: { message, expectedVersion },
      aiResponse,
      ...extra,
    });
  }
  const view = async () =>
    (await call("storefront-view", { storeId: "a" })).data;
  const site = {
    html: '<main id="content">A custom site</main>',
    css: "body{background:#eef4ed}",
    js: 'document.body.dataset.ready="yes";',
  };
  it("supplies only this merchant's ready public images to the model", async () => {
    await query(
      "INSERT INTO assets(id,store_id,key,name,type,size,ready,created_at,purpose) VALUES ('own-image','a','a/image','own.png','image/png',16,1,1,'image'),('other-image','b','b/image','other.png','image/png',16,1,1,'image'),('pending-image','a','a/pending','pending.png','image/png',16,0,1,'image')",
    );
    await query("UPDATE stores SET photo='/api/media/own-image' WHERE id='a'");
    await query(
      "UPDATE products SET image='/api/media/own-image' WHERE id='paid'",
    );
    const result = await chat(
      toolReply({ reply: "Which image would you like to use?" }),
    );
    const content = result.data.calls[0].input.messages.at(-1).content;
    expect(content).toContain(
      '"availableImages":[{"id":"own-image","name":"own.png","url":"https://app.example.test/media/own-image"}]',
    );
    expect(content).toContain(
      '"photo":"https://app.example.test/media/own-image"',
    );
    expect(content).toContain(
      '"image":"https://app.example.test/media/own-image"',
    );
    expect(content).not.toContain("other-image");
    expect(content).not.toContain("pending-image");
    expect((await view()).draft).toBeNull();
  });
  it("sends Haiku through the binding with real products and current files, saving only a draft", async () => {
    const r = await chat(
      toolReply({ reply: "Built your custom storefront.", files: site }),
    );
    expect(r.status).toBe(200);
    const sent = r.data.calls[0];
    expect(sent.model).toBe("anthropic/claude-haiku-5.5");
    expect(sent.options).toEqual({ gateway: { id: "default" } });
    expect(sent.input.max_tokens).toBe(16384);
    expect(sent.input.tools[0].name).toBe("update_storefront");
    const context = sent.input.messages.at(-1).content;
    expect(context).toContain('"id":"paid"');
    expect(context).toContain('"price":2000');
    expect(context).toContain('"formattedPrice":"$20.00"');
    expect(context).toContain("Sore.products");
    expect(context).not.toContain("private.example.test");
    expect(context).not.toContain('"id":"other"');
    expect(r.data.result.draftVersion).toBe(1);
    expect(r.data.result.reply).toBe("Built your custom storefront.");
    expect(r.data.result.gatewayLogId).toBe("log_fixture");
    expect(r.data.result.changes).toEqual(["Custom site files"]);
    const v = await view();
    expect(v.effective.customSite).toEqual(site);
    expect(v.live.customSite).toBeNull();
    expect(v.messages.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect(
      (await query("SELECT price FROM products WHERE id='paid'"))[0].price,
    ).toBe(2000);
  });
  it("applies targeted find/replace edits and rejects edits that don't match exactly once", async () => {
    await chat(toolReply({ reply: "Built it", files: site }));
    const ok = await chat(
      toolReply({
        reply: "Changed the heading",
        edits: [
          { file: "html", find: "A custom site", replace: "Hello there" },
          { file: "css", find: "#eef4ed", replace: "#fff8e7" },
        ],
      }),
      1,
    );
    expect(ok.status).toBe(200);
    expect((await view()).effective.customSite).toEqual({
      ...site,
      html: '<main id="content">Hello there</main>',
      css: "body{background:#fff8e7}",
    });
    const miss = await chat(
      toolReply({
        reply: "Nope",
        edits: [{ file: "js", find: "not in the file", replace: "x" }],
      }),
      2,
    );
    expect(miss.status).toBe(422);
    expect((await view()).effective.customSite?.html).toContain("Hello there");
  });
  it("replaces only supplied files, includes history and refuses concurrent edits or stale publish/discard", async () => {
    await chat(toolReply({ reply: "Built it", files: site }));
    const second = await chat(
      toolReply({
        reply: "Updated the CSS",
        files: { css: "body{background:gold}" },
      }),
      1,
    );
    expect(second.status).toBe(200);
    expect(second.data.calls[0].input.messages).toHaveLength(3);
    expect(second.data.calls[0].input.messages.at(-1).content).toContain(
      "A custom site",
    );
    expect(second.data.result.draftVersion).toBe(2);
    expect((await view()).effective.customSite).toEqual({
      ...site,
      css: "body{background:gold}",
    });
    expect(
      (await chat(toolReply({ reply: "Stale", files: { html: "stale" } }), 1))
        .status,
    ).toBe(409);
    expect(
      (await call("storefront-publish", { storeId: "a", expectedVersion: 1 }))
        .status,
    ).toBe(409);
    expect(
      (await call("storefront-discard", { storeId: "a", expectedVersion: 1 }))
        .status,
    ).toBe(409);
    await query("UPDATE stores SET bio='Written by hand' WHERE id='a'");
    expect(
      (await call("storefront-publish", { storeId: "a", expectedVersion: 2 }))
        .status,
    ).toBe(200);
    const v = await view();
    expect(v.draft).toBeNull();
    expect(v.live.customSite.css).toContain("gold");
    expect(v.live.store.bio).toBe("Written by hand");
    const fresh = await chat(
      toolReply({ reply: "New draft", files: { css: "body{color:blue}" } }),
    );
    expect(fresh.data.calls[0].input.messages).toHaveLength(1);
    expect(fresh.data.result.draftVersion).toBeGreaterThan(2);
    // A stale token from an earlier session can never match a new draft.
    expect(
      (await call("storefront-publish", { storeId: "a", expectedVersion: 1 }))
        .status,
    ).toBe(409);
  });
  it("supports manual save, discard, reset and monotonic concurrency tokens", async () => {
    const save = (custom: unknown, expectedVersion: number | null) =>
      call("storefront-save", { storeId: "a", site: custom, expectedVersion });
    const first = await save(site, null);
    expect(first.status).toBe(200);
    expect((await save(site, null)).status).toBe(409);
    await call("storefront-publish", {
      storeId: "a",
      expectedVersion: first.data.version,
    });
    const reset = await chat(
      toolReply({
        reply: "Restored the template in draft",
        resetToTemplate: true,
      }),
    );
    expect(reset.status).toBe(200);
    expect((await view()).effective.customSite).toBeNull();
    expect((await view()).live.customSite).toEqual(site);
    const discarded = await call("storefront-discard", {
      storeId: "a",
      expectedVersion: reset.data.result.draftVersion,
    });
    expect(discarded.data.discarded).toBe(true);
    expect((await view()).live.customSite).toEqual(site);
    const resetAgain = await save(null, null);
    await call("storefront-publish", {
      storeId: "a",
      expectedVersion: resetAgain.data.version,
    });
    expect((await view()).live.customSite).toBeNull();
    expect(
      (
        await call("storefront-publish", {
          storeId: "a",
          expectedVersion: resetAgain.data.version,
        })
      ).status,
    ).toBe(409);
  });
  it("rejects oversized UTF-8 files, oversized total sites, unsupported tool keys and truncated output", async () => {
    for (const files of [
      { html: "x".repeat(49153) },
      { js: "😀".repeat(12289) },
      {
        html: "a".repeat(40000),
        css: "b".repeat(40000),
        js: "c".repeat(40000),
      },
    ]) {
      expect(
        (await chat(toolReply({ reply: "Too large", files }))).status,
      ).toBe(422);
    }
    expect(
      (
        await chat(
          toolReply({
            reply: "Change price",
            products: [{ id: "paid", price: 1 }],
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await chat({
          ...toolReply({ reply: "Truncated", files: site }),
          stop_reason: "max_tokens",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("storefront-save", {
          storeId: "a",
          expectedVersion: null,
          site: { ...site, html: "x".repeat(49153) },
        })
      ).status,
    ).toBe(400);
    expect((await view()).draft).toBeNull();
  });
  it("reports failures/refusals, missing bindings and daily limits without saving", async () => {
    expect((await chat(null, null, "hi", { aiFail: true })).status).toBe(502);
    expect((await chat({ stop_reason: "refusal", content: [] })).status).toBe(
      422,
    );
    expect((await chat(null, null, "hi", { noAi: true })).status).toBe(503);
    await query(
      "UPDATE rates SET count=150 WHERE key LIKE 'storefront-ai:a:%'",
    );
    expect(
      (await chat(toolReply({ reply: "Over limit", files: site }))).status,
    ).toBe(429);
    expect((await view()).messages).toEqual([]);
  });
  it.each([
    [
      "Add Google Analytics",
      "External scripts and analytics are blocked. I can add a static statistics section with your own supplied numbers.",
    ],
    [
      "Embed my YouTube video",
      "Video embeds are blocked. I can create a static video introduction section instead.",
    ],
    [
      "Add a newsletter signup form",
      "This site cannot collect or store email addresses. I can add a Sore product button instead.",
    ],
    [
      "Make the course $5",
      "Prices belong in the product editor. I can keep displaying the real price from Sore.",
    ],
  ])("returns guidance without saving for %s", async (message, reply) => {
    const result = await chat(toolReply({ reply }), null, message);
    expect(result.status).toBe(200);
    expect(result.data.result.reply).toBe(reply);
    expect(result.data.result.changes).toEqual([]);
    expect((await view()).draft).toBeNull();
    expect(result.data.calls[0].input.system).toContain(
      "WITHOUT files, edits or resetToTemplate",
    );
  });
  it("also saves no draft for a plain text clarification", async () => {
    const reply =
      "Would you prefer a warm editorial layout or a compact product grid?";
    const result = await chat(
      { content: [{ type: "text", text: reply }], stop_reason: "end_turn" },
      null,
      "Make it better",
    );
    expect(result.data.result.reply).toBe(reply);
    expect((await view()).draft).toBeNull();
  });
});

describe("Public website images", () => {
  it.each([
    ["png", "image/png", png],
    ["jpg", "image/jpeg", new Uint8Array([255, 216, 255, 0])],
    ["webp", "image/webp", new TextEncoder().encode("RIFF0000WEBP")],
    ["gif", "image/gif", new TextEncoder().encode("GIF89a000000")],
    [
      "avif",
      "image/avif",
      new Uint8Array([
        0, 0, 0, 20, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0, 97, 118,
        105, 102,
      ]),
    ],
  ])(
    "validates and serves public %s with restrictive headers",
    async (extension, type, bytes) => {
      const prepared = await call("prepare-upload", {
        storeId: "a",
        input: {
          name: `site.${extension}`,
          type,
          size: bytes.length,
          purpose: "image",
        },
      });
      expect(prepared.status).toBe(200);
      const assetId = prepared.data.assetId;
      const key = (
        await query("SELECT key FROM assets WHERE id=?", [assetId])
      )[0].key;
      await call("put-file", { key, bytes: Array.from(bytes) });
      expect((await call("upload", { storeId: "a", assetId })).status).toBe(
        200,
      );
      const response = await mf.dispatchFetch(
        "https://mcp.example.test/test/public-image",
        { method: "POST", body: JSON.stringify({ assetId }) },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(type);
      expect(response.headers.get("content-security-policy")).toBe(
        "default-src 'none'",
      );
      expect(response.headers.get("content-disposition")).toBe("inline");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    },
  );
  it("refuses SVG, private deliverables, samples and incomplete images", async () => {
    expect(
      (
        await call("prepare-upload", {
          storeId: "a",
          input: {
            name: "bad.svg",
            type: "image/svg+xml",
            size: 10,
            purpose: "image",
          },
        })
      ).status,
    ).toBe(400);
    for (const [assetId, purpose, type, ready] of [
      ["svg", "image", "image/svg+xml", 1],
      ["private", "deliverable", "image/png", 1],
      ["sample", "sample", "image/png", 1],
      ["pending", "image", "image/png", 0],
    ] as const) {
      await query(
        "INSERT INTO assets(id,store_id,key,name,type,size,ready,created_at,purpose) VALUES (?,'a',?,'file',?,16,?,1,?)",
        [assetId, assetId, type, ready, purpose],
      );
      expect((await call("public-image", { assetId })).status).toBe(404);
    }
    expect((await call("public-image", { assetId: "asset_a" })).status).toBe(
      404,
    );
    expect((await call("public-image", { assetId: "missing" })).status).toBe(
      404,
    );
  });
  it("rejects SVG bytes disguised as a raster upload", async () => {
    const bytes = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    const prepared = await call("prepare-upload", {
      storeId: "a",
      input: {
        name: "bad.png",
        type: "image/png",
        size: bytes.length,
        purpose: "image",
      },
    });
    const key = (
      await query("SELECT key FROM assets WHERE id=?", [prepared.data.assetId])
    )[0].key;
    await call("put-file", { key, bytes: Array.from(bytes) });
    expect(
      (await call("upload", { storeId: "a", assetId: prepared.data.assetId }))
        .status,
    ).toBe(400);
    expect(
      (await call("public-image", { assetId: prepared.data.assetId })).status,
    ).toBe(404);
  });
});

describe("Custom storefront trust boundary", () => {
  const data = {
    imageOrigin: "https://platform.test",
    store: {
      name: "</title><script>bad()</script>",
      slug: "store-a",
      bio: "",
      currency: "usd",
      supportEmail: "support@example.test",
      photo: "",
      socials: {},
    },
    products: [
      {
        id: "paid",
        title: "Real resource",
        description: "",
        price: 2000,
        formattedPrice: "$20.00",
        buttonLabel: "Buy",
        kind: "resource",
        image: "",
        deliveryType: "file",
        position: 0,
        checkoutUrl: "/store-a/p/paid",
      },
    ],
  };
  it("allows exactly the platform image path in CSP and exposes absolute image URLs", () => {
    expect(customSiteCsp("https://platform.test/path")).toBe(
      CUSTOM_SITE_CSP.replace(
        "img-src data: blob:",
        "img-src data: blob: https://platform.test/media/",
      ),
    );
    const store = { ...data.store, photo: "/api/media/store-photo" };
    const products = [
      { ...data.products[0], state: "published", image: "/api/media/cover" },
      {
        ...data.products[0],
        id: "remote",
        state: "published",
        image: "https://remote.test/photo.png",
      },
      {
        ...data.products[0],
        id: "svg",
        state: "published",
        image: "/art/cover.svg",
      },
    ] as Parameters<typeof commerceData>[1];
    const commerce = commerceData(store, products, "https://platform.test");
    expect(commerce.store.photo).toBe(
      "https://platform.test/media/store-photo",
    );
    expect(commerce.products.map((product) => product.image)).toEqual([
      "https://platform.test/media/cover",
      "",
      "",
    ]);
    expect(
      customSiteDocument({ html: "", css: "", js: "" }, commerce),
    ).toContain('"image":"https://platform.test/media/cover"');
  });
  it("accepts only checkout messages from the opaque-origin sandbox and known product ids", () => {
    const source = {} as MessageEventSource;
    const message = {
      origin: "null",
      source,
      data: {
        type: "sore:checkout",
        productId: "paid",
        url: "https://evil.test",
      },
    };
    expect(checkoutMessageUrl(message, source, data)).toBe("/store-a/p/paid");
    for (const invalid of [
      { ...message, origin: "https://platform.test" },
      { ...message, source: {} as MessageEventSource },
      { ...message, data: { type: "sore:checkout", productId: "other" } },
      { ...message, data: { type: "sore:checkout", productId: "__proto__" } },
      { ...message, data: null },
    ])
      expect(checkoutMessageUrl(invalid, source, data)).toBeNull();
    expect(checkoutMessageUrl(message, null, data)).toBeNull();
  });
  it("opens only the store's saved https profile links from the sandbox", () => {
    const linked = commerceData(
      {
        name: "Store A",
        slug: "store-a",
        bio: "",
        currency: "usd",
        supportEmail: "",
        socials: JSON.stringify({
          instagram: "https://instagram.com/storea",
          bad: "javascript:alert(1)",
          plain: "http://insecure.test",
        }),
      },
      [],
    );
    expect(linked.store.socials).toEqual({
      instagram: "https://instagram.com/storea",
    });
    const source = {} as MessageEventSource;
    const message = {
      origin: "null",
      source,
      data: { type: "sore:open-link", url: "https://instagram.com/storea" },
    };
    expect(linkMessageUrl(message, source, linked)).toBe(
      "https://instagram.com/storea",
    );
    for (const invalid of [
      { ...message, origin: "https://platform.test" },
      { ...message, source: {} as MessageEventSource },
      { ...message, data: { type: "sore:open-link", url: "https://evil.test" } },
      { ...message, data: { type: "sore:open-link", url: "http://insecure.test" } },
      { ...message, data: null },
    ])
      expect(linkMessageUrl(invalid, source, linked)).toBeNull();
    expect(customSiteDocument({ html: "", css: "", js: "" }, linked)).toContain(
      "openLink(url)",
    );
  });
  it("places restrictive CSP before merchant content and escapes injected data and code delimiters", () => {
    const doc = customSiteDocument(
      {
        html: '<main>merchant</main><meta http-equiv="Content-Security-Policy" content="default-src *">',
        css: "</style><script>cssEscape()</script>",
        js: "</script><script>jsEscape()</script>",
      },
      data,
    );
    expect(CUSTOM_SITE_SANDBOX).toBe("allow-scripts");
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(
      doc.indexOf("merchant"),
    );
    expect(doc).toContain(
      'name="viewport" content="width=device-width, initial-scale=1"',
    );
    expect(doc).not.toContain("<script>bad()");
    expect(doc).not.toContain("<script>cssEscape()");
    expect(doc).not.toContain("<script>jsEscape()");
    for (const directive of [
      "default-src 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "worker-src 'none'",
      "frame-src 'none'",
    ])
      expect(CUSTOM_SITE_CSP).toContain(directive);
  });
});
describe("storefront analytics", () => {
  const visitor = "5b4e0832-42d0-47e3-92fc-cce935111c65";
  const input = { visitor, productId: "paid", source: "Instagram" };
  const event = (extra: Record<string, unknown> = {}) =>
    call("analytics", {
      slug: "store-a",
      kind: "pageview",
      input,
      headers: { "cf-ipcountry": "CA", "user-agent": "Mobile Safari/600" },
      ...extra,
    });
  const patch = (input: unknown) => event({ action: "settings", input });

  it("collects published pages with coarse dimensions and a store-specific daily visitor hash", async () => {
    const result = await event();
    expect(result.data).toMatchObject({
      recorded: true,
      points: [
        {
          indexes: ["a"],
          blobs: [
            "paid",
            "Instagram",
            "CA",
            "Phone",
            "Safari",
            expect.stringMatching(/^[0-9a-f]{64}$/),
          ],
        },
      ],
    });
    const dailyId = result.data.points[0].blobs[5];
    const home = await event({
      input: { visitor, source: "Direct / unknown" },
    });
    expect(home.data.points[0].blobs).toEqual([
      "",
      "Direct / unknown",
      "CA",
      "Phone",
      "Safari",
      dailyId,
    ]);
    const otherStore = await event({
      slug: "store-b",
      input: { visitor, source: "Direct / unknown" },
    });
    expect(otherStore.data.points[0].blobs[5]).not.toEqual(dailyId);
    expect(
      (await event({ input: { ...input, productId: "other" } })).status,
    ).toBe(404);
    expect(
      (
        await event({
          input: { ...input, source: "https://example.com/?email=private" },
        })
      ).status,
    ).toBe(400);
    await query("UPDATE products SET state='draft' WHERE id='paid'");
    expect((await event()).status).toBe(404);
  });

  it("applies tracking, owner and browser privacy controls to both counters", async () => {
    for (const kind of ["view", "pageview"]) {
      for (const headers of [{ dnt: "1" }, { "sec-gpc": "1" }]) {
        expect((await event({ kind, headers })).data.recorded).toBe(false);
      }
      expect((await event({ kind, ownerId: "owner_a" })).data.recorded).toBe(
        false,
      );
    }
    await patch({ excludeOwnerVisits: false });
    expect((await event({ ownerId: "owner_a" })).data.recorded).toBe(true);
    await Promise.all([event({ kind: "view" }), event({ kind: "view" })]);
    expect(await query("SELECT COUNT(*) AS n FROM views")).toEqual([{ n: 1 }]);
    await patch({ trackingEnabled: false });
    for (const kind of ["view", "pageview"])
      expect((await event({ kind })).data.recorded).toBe(false);
    const other = await event({
      slug: "store-b",
      input: { visitor, source: "Other referral" },
    });
    expect(other.data.recorded).toBe(true);
    expect((await patch({ trackingEnabled: "false" })).status).toBe(400);
  });

  it("pins every provider query to the store and UTC range and preserves commerce when traffic is unavailable", async () => {
    analyticsQueries = [];
    const order = await checkout();
    await confirm(order);
    const report = await event({ action: "report", days: 7 });
    expect(report.data.status).toBe("ready");
    expect(report.data.traffic.trend).toHaveLength(7);
    expect(report.data.traffic.trend[6]).toMatchObject({
      visitors: 2,
      views: 8,
    });
    expect(report.data.traffic.trend[0].views).toBe(0);
    expect(report.data.traffic.productViews).toBe(3);
    expect(report.data.commerce).toEqual({ checkouts: 1, purchases: 1 });
    expect(analyticsQueries).toHaveLength(6);
    for (const sql of analyticsQueries) {
      expect(sql).toMatch(
        /FROM test_storefront WHERE index1 = 'a' AND timestamp >= toDateTime\(\d+\) AND timestamp < toDateTime\(\d+\)/,
      );
      expect(sql).toContain("SUM(_sample_interval)");
    }
    analyticsFailure = true;
    try {
      const other = await event({
        slug: "store-b",
        action: "report",
        days: 30,
      });
      expect(other.data).toMatchObject({
        status: "unavailable",
        traffic: null,
        commerce: { checkouts: 0, purchases: 0 },
      });
    } finally {
      analyticsFailure = false;
    }
  });
});
