import { beforeAll, afterAll, it, expect } from "vitest";
import {
  Miniflare,
  convertV4MiniflareOptions,
  kCurrentWorker,
} from "miniflare";
import { readdirSync, readFileSync } from "node:fs";
import {
  accessIssuer,
  accessAudience,
  accessJwks,
  accessJwt,
} from "./access-fixture";
let mf: Miniflare;
let sessionCookie = "";
const origin = "http://app.example.test";
const scriptPath =
  process.env.COACHLANE_APP_BUNDLE || "artifacts/app/worker.js";
const workerSource = process.env.COACHLANE_APP_BUNDLE
  ? {
      modules: [
        scriptPath,
        scriptPath.replace(/worker\.js$/, "app.js"),
        scriptPath.replace(/worker\.js$/, "assets.js"),
      ].map((path) => ({ type: "ESModule" as const, path })),
    }
  : { modules: true as const, scriptPath };
async function request(
  path: string,
  body?: unknown,
  method = "POST",
  cookie = sessionCookie,
) {
  return mf.dispatchFetch(origin + path, {
    method: body === undefined ? "GET" : method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined
        ? { "Content-Type": "application/json", Origin: origin }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function json(path: string, body?: unknown, method = "POST") {
  const r = await request(path, body, method);
  const data = (await r.json()) as any;
  expect(r.status, JSON.stringify(data)).toBe(200);
  return data;
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "coachlane-dev",
      ...workerSource,
      compatibilityDate: "2026-11-19",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: { DB: "built-test" },
      r2Buckets: ["FILES"],
      ...(process.env.COACHLANE_APP_BUNDLE
        ? {}
        : {
            assets: {
              directory: ".open-next/assets",
              binding: "ASSETS",
              routerConfig: { has_user_worker: true },
            },
          }),
      serviceBindings: { WORKER_SELF_REFERENCE: kCurrentWorker },
      bindings: {
        APP_MODE: "development",
        APP_URL: origin,
        MCP_URL: "https://mcp.example.test",
        SESSION_SECRET: "built-session-secret-at-least-32-characters",
        DOWNLOAD_SECRET: "built-download-secret-at-least-32-characters",
        OAUTH_BRIDGE_SECRET: "built-oauth-secret-at-least-32-characters",
      },
    }),
  );
  const db = await mf.getD1Database("DB");
  await db.exec(
    readdirSync("migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync("migrations/" + name, "utf8"))
      .join("\n"),
  );
  await db.exec(readFileSync("fixtures/demo.sql", "utf8"));
  const r = await request("/api/dev/session", { workspace: "demo" });
  if (r.status !== 200)
    console.log("Built login error", await r.clone().text());
  expect(r.status).toBe(200);
  sessionCookie = r.headers.get("set-cookie")!.split(";")[0];
}, 60000);
afterAll(async () => {
  await mf?.dispose();
});
it("hosted mode disables demo login and accurately explains missing creator authentication", async () => {
  const hosted = new Miniflare(
    convertV4MiniflareOptions({
      name: "coachlane-staging",
      ...workerSource,
      compatibilityDate: "2026-11-19",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: { DB: "hosted-test" },
      r2Buckets: ["FILES"],
      ...(process.env.COACHLANE_APP_BUNDLE
        ? {}
        : {
            assets: {
              directory: ".open-next/assets",
              binding: "ASSETS",
              routerConfig: { has_user_worker: true },
            },
          }),
      serviceBindings: { WORKER_SELF_REFERENCE: kCurrentWorker },
      bindings: {
        APP_MODE: "production",
        APP_URL: origin,
        MCP_URL: "https://mcp.example.test",
      },
    }),
  );
  try {
    const login = await hosted.dispatchFetch(origin + "/sign-in");
    expect(login.status).toBe(200);
    const html = await login.text();
    expect(html).toContain("Creator sign-in is being configured.");
    expect(html).not.toContain("Explore demo workspace");
    expect(html).not.toContain("Local development mode");
    const demo = await hosted.dispatchFetch(origin + "/api/dev/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ workspace: "demo" }),
    });
    expect(demo.status).toBe(404);
    const home = await hosted.dispatchFetch(origin + "/");
    expect(home.status).toBe(200);
    const homeHtml = await home.text();
    expect(homeHtml).toContain('data-pricing-state="unavailable"');
    expect(homeHtml).toContain("Live pricing is temporarily unavailable.");
    expect(homeHtml).not.toContain("purchases remaining at");
    expect((await hosted.dispatchFetch(origin + "/api/workspace")).status).toBe(
      503,
    );
  } finally {
    await hosted.dispose();
  }
});
it("quotes founding prices from completed real purchases and excludes demo and pending sessions", async () => {
  const db = await mf.getD1Database("DB");
  await db
    .prepare(
      "INSERT INTO stores(id,owner_id,slug,name,demo,created_at) VALUES ('offer-test','offer-owner','offer-test','Offer test',0,0)",
    )
    .run();
  const page = async () => (await request("/", undefined, "GET", "")).text();
  const check = async (price: number, remaining: number, next: number) => {
    const html = await page();
    expect(html).toContain(`data-current-price="${price}"`);
    expect(html).toContain(`data-price-remaining="${remaining}"`);
    expect(html).toContain(`data-next-price="${next}"`);
  };
  try {
    await db
      .prepare(
        "INSERT INTO billing_sessions(id,store_id,kind,status,session_id,expires_at,created_at) VALUES ('offer-pending','offer-test','lifetime','pending','cs_pending',0,0),('offer-failed','offer-test','lifetime','failed','cs_failed',0,0),('offer-demo','demo-store','lifetime','paid','cs_demo',0,0),('offer-sub','offer-test','subscription','paid','cs_sub',0,0)",
      )
      .run();
    await check(99, 5, 109);
    for (let i = 0; i < 10; i++) {
      await db
        .prepare(
          "INSERT INTO billing_sessions(id,store_id,kind,status,session_id,expires_at,created_at) VALUES (?,'offer-test','lifetime','paid',?,0,0)",
        )
        .bind(`offer-paid-${i}`, `cs_paid_${i}`)
        .run();
      if (i === 3) await check(99, 1, 109);
      if (i === 4) await check(109, 5, 119);
      if (i === 9) await check(119, 5, 129);
    }
  } finally {
    await db
      .prepare("DELETE FROM billing_sessions WHERE id LIKE 'offer-%'")
      .run();
    await db.prepare("DELETE FROM stores WHERE id='offer-test'").run();
  }
});
it("serves the actual OpenNext build and its static assets in workerd", async () => {
  const home = await request("/", undefined, "GET", "");
  expect(home.status).toBe(200);
  const homeHtml = await home.text();
  expect(homeHtml).toContain("into your next sale.");
  expect(homeHtml).toContain("ILLUSTRATIVE DEMO");
  expect(homeHtml).toContain("Checkout is not open yet.");
  const script = homeHtml.match(/src="([^\"]+\.js[^\"]*)"/);
  expect(script).toBeTruthy();
  const clientAsset = await request(script![1]);
  expect(clientAsset.status).toBe(200);
  expect(clientAsset.headers.get("content-type")).toContain("javascript");
  const art = await request("/art/business-reset.svg");
  expect(art.status).toBe(200);
  expect(art.headers.get("content-type")).toContain("image/svg+xml");
  const store = await request("/jamie-lane?preview=1");
  expect(store.status).toBe(200);
  const html = await store.text();
  expect(html).toContain("The Business Reset");
  expect(html).not.toContain("demo-store/demo-reset");
  const dashboard = await request("/dashboard");
  expect(dashboard.status).toBe(200);
  expect(await dashboard.text()).toContain("Sore");
});
it("protects creator APIs and returns truthful demo metrics without private public payloads", async () => {
  const unauth = await request("/api/workspace", undefined, "GET", "");
  expect(unauth.status).toBe(401);
  const w = await json("/api/workspace?days=7&visits=1");
  expect(w.visits).toMatchObject({ total: 0, previous: 0, products: [] });
  expect(w.visits.days).toHaveLength(7);
  expect(w.summary.grossProductSales).toBe(0);
  expect(w.products).toHaveLength(3);
  const pub = await json("/api/public/jamie-lane");
  const raw = JSON.stringify(pub);
  expect(raw).not.toContain("assetId");
  expect(raw).not.toContain("deliveryUrl");
  expect(raw).not.toContain("ownerId");
  expect(raw).not.toContain("stripeAccount");
});
it("publishes a product, completes development purchase and delivers a validated private file", async () => {
  const pdf = "%PDF-1.4\nA minimal local test fixture.";
  const prepared = await json("/api/uploads", {
    name: "flow.pdf",
    size: Buffer.byteLength(pdf),
    type: "application/pdf",
  });
  const upload = await mf.dispatchFetch(prepared.url, {
    method: "PUT",
    headers: {
      Cookie: sessionCookie,
      Origin: origin,
      "Content-Type": "application/pdf",
      "Content-Length": String(Buffer.byteLength(pdf)),
    },
    body: pdf,
  });
  expect(upload.status, await upload.clone().text()).toBe(200);
  await json("/api/uploads/complete", { assetId: prepared.assetId });
  const p = await json("/api/products", {
    title: "Runtime Flow Resource",
    description: "Published by the built app.",
    price: 2500,
    deliveryType: "file",
    assetId: prepared.assetId,
    state: "published",
  });
  const checked = await json("/api/public/jamie-lane/checkout", {
    productId: p.id,
    name: "Local Buyer",
    email: "local@example.test",
    marketing: false,
  });
  const token = new URL(checked.url).searchParams.get("token");
  let access = await json(`/api/access/${checked.orderId}?token=${token}`);
  expect(access.status).toBe("pending");
  const locked = await request(
    `/api/access/${checked.orderId}/download?token=${token}`,
  );
  expect(locked.status).toBe(403);
  await json("/api/dev/payment", {
    orderId: checked.orderId,
    token,
    outcome: "success",
  });
  access = await json(`/api/access/${checked.orderId}?token=${token}`);
  expect(access.status).toBe("paid");
  const link = await json(
    `/api/access/${checked.orderId}/download?token=${token}`,
  );
  const file = await mf.dispatchFetch(link.url);
  expect(file.status).toBe(200);
  expect(file.headers.get("content-disposition")).toContain("attachment");
  expect(await file.text()).toBe(pdf);
  const w = await json("/api/workspace");
  expect(w.summary.grossProductSales).toBe(2500);
  expect(w.summary.paidOrders).toBe(1);
  await json("/api/orders/resend", { orderId: checked.orderId });
  const customer = (await json("/api/customers")).items[0];
  expect(customer.marketing).toBe(0);
  const csv = await request("/api/orders?csv=1");
  expect(csv.headers.get("content-type")).toContain("text/csv");
  expect(await csv.text()).toContain("Runtime Flow Resource");
  await json("/api/dev/payment", {
    orderId: checked.orderId,
    token,
    outcome: "refund",
  });
  const revoked = await mf.dispatchFetch(link.url);
  expect(revoked.status).toBe(403);
});
it("a new development creator starts empty and cannot modify another tenant", async () => {
  const r = await request("/api/dev/session", { workspace: "new" });
  const otherCookie = r.headers.get("set-cookie")!.split(";")[0];
  const created = await request(
    "/api/store",
    { slug: "new-owner", name: "New Owner", supportEmail: "new@example.test" },
    "POST",
    otherCookie,
  );
  expect(created.status).toBe(200);
  const w = await request("/api/workspace", undefined, "GET", otherCookie);
  expect(((await w.json()) as any).products).toHaveLength(0);
  const denied = await request(
    "/api/products/business-reset",
    { title: "Tampered", price: 1, state: "draft" },
    "PATCH",
    otherCookie,
  );
  expect(denied.status).toBe(404);
});

it("guided onboarding resumes, previews actual inputs privately and publishes a free resource without MCP or Stripe", async () => {
  const signIn = await request("/api/dev/session", { workspace: "new" });
  const cookie = signIn.headers.get("set-cookie")!.split(";")[0];
  async function asCreator(path: string, body?: unknown) {
    const response = await request(path, body, "POST", cookie);
    const value = (await response.json()) as any;
    expect(response.status, JSON.stringify(value)).toBe(200);
    return value;
  }
  let setup = await asCreator("/api/setup");
  const content = {
    ...setup.content,
    creator: {
      ...setup.content.creator,
      name: "My Real Coach Name",
      slug: "real-input-coach",
      bio: "My own short bio",
      supportEmail: "coach@example.test",
      audience: "Freelance consultants",
      whatTheySell: "Existing workbooks",
    },
    product: {
      ...setup.content.product,
      title: "My Existing Workbook",
      description: "Pasted existing description with real content.",
      deliveryUrl: "https://example.test/private-delivery",
      isPaid: false,
      price: 0,
    },
    appearance: "botanical",
  };
  setup = await asCreator("/api/setup", {
    expectedVersion: setup.version,
    step: 1,
    content,
  });
  const resumed = await asCreator("/api/setup");
  expect(resumed.content).toEqual(content);
  setup = await asCreator("/api/setup/step", { step: 1 });
  setup = await asCreator("/api/setup/step", { step: 2 });
  setup = await asCreator("/api/setup/step", { step: 3 });
  expect(setup.store.publicationState).toBe("draft");
  expect(setup.product.state).toBe("draft");
  const anonymous = await request("/real-input-coach", undefined, "GET", "");
  expect(anonymous.status).toBe(404);
  const draftPublic = await request(
    "/real-input-coach/p/" + setup.product.id,
    undefined,
    "GET",
    "",
  );
  expect(draftPublic.status).toBe(404);
  const apiPublic = await request(
    "/api/public/real-input-coach",
    undefined,
    "GET",
    "",
  );
  expect(apiPublic.status).toBe(404);
  const preview = await request(
    "/dashboard/preview?product=" + setup.product.id,
    undefined,
    "GET",
    cookie,
  );
  expect(preview.status).toBe(200);
  const html = await preview.text();
  expect(html).toContain("My Real Coach Name");
  expect(html).toContain("My Existing Workbook");
  expect(html).toContain("Pasted existing description with real content.");
  expect(html).toContain("preset-botanical");
  expect(html).not.toContain("https://example.test/private-delivery");
  const noLoginPreview = await request(
    "/dashboard/preview?product=" + setup.product.id,
    undefined,
    "GET",
    "",
  );
  expect(noLoginPreview.status).toBe(200);
  expect(await noLoginPreview.text()).not.toContain(
    "Pasted existing description with real content.",
  );
  const rehearsal = await asCreator("/api/setup/rehearse", {
    productId: setup.product.id,
  });
  expect(rehearsal.mode).toBe("delivery_rehearsal");
  let workspace = await asCreator("/api/workspace");
  expect(workspace.summary.paidOrders).toBe(0);
  expect((await asCreator("/api/customers")).items).toHaveLength(0);
  expect((await asCreator("/api/orders")).items).toHaveLength(0);
  setup = await asCreator("/api/setup/step", { step: 4 });
  setup = await asCreator("/api/setup/step", { step: 5 });
  expect(setup.completed).toBe(true);
  expect(setup.store.stripeAccount).toBeNull();
  const live = await request(
    "/real-input-coach/p/" + setup.product.id,
    undefined,
    "GET",
    "",
  );
  expect(live.status).toBe(200);
  expect(await live.text()).toContain("My Existing Workbook");
  const free = await request(
    "/api/public/real-input-coach/checkout",
    {
      productId: setup.product.id,
      name: "Actual Lead",
      email: "lead@example.test",
      marketing: false,
    },
    "POST",
    "",
  );
  expect(free.status).toBe(200);
  const access = (await free.json()) as any;
  expect(access.url).toContain("/access/");
  workspace = await asCreator("/api/workspace");
  expect(workspace.summary.freeSignups).toBe(1);
  expect(workspace.summary.paidOrders).toBe(0);
  expect((await asCreator("/api/customers")).items).toHaveLength(1);
});

it("optional product sections render in their chosen order and public samples stay separate from paid files", async () => {
  const pdf = "%PDF-1.4\nPublic sample only.";
  const sample = await json("/api/uploads", {
    name: "sample.pdf",
    size: Buffer.byteLength(pdf),
    type: "application/pdf",
    purpose: "sample",
  });
  const uploaded = await mf.dispatchFetch(sample.url, {
    method: "PUT",
    headers: {
      Cookie: sessionCookie,
      Origin: origin,
      "Content-Type": "application/pdf",
      "Content-Length": String(Buffer.byteLength(pdf)),
    },
    body: pdf,
  });
  expect(uploaded.status).toBe(200);
  await json("/api/uploads/complete", { assetId: sample.assetId });
  const before = await request(
    "/api/media/" + sample.assetId,
    undefined,
    "GET",
    "",
  );
  expect(before.status).toBe(404);
  const p = await json("/api/products", {
    title: "Detailed Resource",
    description: "An existing product.",
    price: 1000,
    deliveryUrl: "https://example.test/protected-paid",
    state: "published",
    presentation: {
      audience: "For independent coaches.",
      includedItems: ["A worksheet", "Editable files"],
      faqs: [
        {
          question: "Is this editable?",
          answer: "Yes, the included files are editable.",
        },
      ],
      testimonials: [],
      sampleAssetId: sample.assetId,
      sectionOrder: [
        "faqs",
        "included",
        "audience",
        "previews",
        "testimonials",
      ],
      hiddenSections: ["audience"],
    },
  });
  const page = await request("/jamie-lane/p/" + p.id, undefined, "GET", "");
  const html = await page.text();
  expect(html).toContain("Is this editable?");
  expect(html).toContain("A worksheet");
  expect(html.indexOf("A few things you might")).toBeLessThan(
    html.indexOf("What you’ll receive"),
  );
  expect(html).not.toContain("For independent coaches.");
  expect(html).not.toContain("In their words");
  expect(html).not.toContain("https://example.test/protected-paid");
  const publicSample = await request(
    "/api/media/" + sample.assetId,
    undefined,
    "GET",
    "",
  );
  expect(publicSample.status).toBe(200);
  expect(await publicSample.text()).toBe(pdf);
  const asset = (await mf.getD1Database("DB")).prepare(
    "SELECT asset_id FROM products WHERE title='Runtime Flow Resource'",
  );
  const privateId = ((await asset.first()) as any).asset_id;
  const paidFile = await request(
    "/api/media/" + privateId,
    undefined,
    "GET",
    "",
  );
  expect(paidFile.status).toBe(404);
});

it("public website images are anonymous, raster-only and isolated from paid downloads", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRz8AAAAASUVORK5CYII=",
    "base64",
  );
  const upload = await json("/api/uploads", {
    name: "website.png",
    size: png.length,
    type: "image/png",
    purpose: "image",
  });
  expect(
    (
      await mf.dispatchFetch(upload.url, {
        method: "PUT",
        headers: {
          Cookie: sessionCookie,
          Origin: origin,
          "Content-Type": "image/png",
          "Content-Length": String(png.length),
        },
        body: png,
      })
    ).status,
  ).toBe(200);
  await json("/api/uploads/complete", { assetId: upload.assetId });
  const response = await request(
    "/media/" + upload.assetId,
    undefined,
    "GET",
    "",
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("content-security-policy")).toBe(
    "default-src 'none'",
  );
  expect(response.headers.get("content-disposition")).toBe("inline");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toContain("immutable");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  expect(
    (await request("/media/demo-reset", undefined, "GET", "")).status,
  ).toBe(404);
  expect((await request("/media/missing", undefined, "GET", "")).status).toBe(
    404,
  );
  expect(
    (
      await request("/api/uploads", {
        name: "bad.svg",
        size: 12,
        type: "image/svg+xml",
        purpose: "image",
      })
    ).status,
  ).toBe(400);
  const state = (await (
    await mf.dispatchFetch(origin + "/api/storefront/ai", {
      headers: { Cookie: sessionCookie, Origin: origin },
    })
  ).json()) as { images: { id: string; name: string; url: string }[] };
  expect(state.images).toContainEqual({
    id: upload.assetId,
    name: "website.png",
    url: `${origin}/media/${upload.assetId}`,
  });
});

it("custom storefront drafts publish/discard/reset with concurrency and opaque sandbox on public and private previews", async () => {
  const ai = await json("/api/storefront/ai");
  expect(ai.draft).toBeNull();
  expect(ai.model).toBe("anthropic/claude-haiku-5.5");
  expect(ai.connected).toBe(false);
  expect(
    (
      await request("/api/storefront/ai/chat", {
        message: "Build a website",
        expectedVersion: null,
      })
    ).status,
  ).toBe(503);
  for (const path of ["/dashboard/storefront", "/dashboard/storefront/manual"])
    expect((await request(path, undefined, "GET")).status).toBe(200);
  expect(ai.starter.js).toContain("Sore.products");
  expect(ai.commerce.products.length).toBeGreaterThan(0);
  expect(JSON.stringify(ai.commerce)).not.toContain("deliveryUrl");
  const store = (await json("/api/workspace")).store;
  const site = {
    html: "<main>Custom draft content<script>window.__MERCHANT_EXECUTED__=true</script></main>",
    css: "body{color:purple}",
    js: "console.log(Sore.products)",
  };
  const first = await json("/api/storefront/site", {
    site,
    expectedVersion: null,
  });
  expect(first.draftVersion).toBeGreaterThan(0);
  expect(
    (await request("/api/storefront/site", { site, expectedVersion: null }))
      .status,
  ).toBe(409);
  expect(
    (
      await request("/api/storefront/site", {
        site: { ...site, html: "x".repeat(49153) },
        expectedVersion: first.draftVersion,
      })
    ).status,
  ).toBe(400);
  // Chunked / missing Content-Length requests still enforce the byte cap.
  expect(
    (
      await request("/api/storefront/site", {
        site: { ...site, html: "x".repeat(660000) },
        expectedVersion: first.draftVersion,
      })
    ).status,
  ).toBe(413);
  const beforeResponse = await request("/" + store.slug, undefined, "GET", "");
  // The host page stops the sandboxed frame from navigating to off-site pages.
  expect(beforeResponse.headers.get("content-security-policy")).toBe(
    "frame-src 'self'",
  );
  const before = await beforeResponse.text();
  expect(before).not.toContain("Custom draft content");
  const assertSandbox = (html: string) => {
    expect(html).toMatch(/<iframe[^>]*sandbox="allow-scripts"/);
    expect(html).not.toContain('sandbox="allow-scripts allow-same-origin"');
    expect(html).toContain('srcDoc="&lt;!doctype html&gt;');
    expect(html).toContain("Content-Security-Policy");
    for (const directive of [
      "connect-src",
      "form-action",
      "base-uri",
      "worker-src",
      "frame-src",
    ])
      expect(html).toContain(directive);
    expect(html).not.toContain("<script>window.__MERCHANT_EXECUTED__");
    expect(html).toContain("name=&quot;viewport&quot;");
    expect(html).not.toContain("Products &amp; verified prices");
    expect(html).not.toContain("Merchant-created website");
  };
  const draftPreview = await (
    await request("/dashboard/preview?source=ai", undefined, "GET")
  ).text();
  expect(draftPreview).toContain("Custom draft content");
  assertSandbox(draftPreview);
  for (const source of ["live", "manual"])
    expect(
      await (
        await request("/dashboard/preview?source=" + source, undefined, "GET")
      ).text(),
    ).not.toContain("Custom draft content");
  expect(
    (
      await request("/api/storefront/ai/publish", {
        expectedVersion: first.draftVersion + 10,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request("/api/storefront/ai/discard", {
        expectedVersion: first.draftVersion + 10,
      })
    ).status,
  ).toBe(409);
  await json("/api/storefront/ai/publish", {
    expectedVersion: first.draftVersion,
  });
  const live = await (
    await request("/" + store.slug, undefined, "GET", "")
  ).text();
  expect(live).toContain("Custom draft content");
  assertSandbox(live);
  expect(live).toContain("<title>" + store.name + "</title>");
  for (const source of ["live", "manual", "ai"])
    assertSandbox(
      await (
        await request("/dashboard/preview?source=" + source, undefined, "GET")
      ).text(),
    );
  const product = ai.commerce.products.find((p: any) => p.kind === "resource");
  expect(product).toBeDefined();
  expect(
    (await request(product.checkoutUrl, undefined, "GET", "")).status,
  ).toBe(200);
  // There is no raw HTML/code endpoint that can execute with platform authority.
  const raw = await request("/api/storefront/site", undefined, "GET", "");
  expect(raw.status).not.toBe(200);
  expect(raw.headers.get("content-type")).toContain("application/json");
  const reset = await json("/api/storefront/site", {
    site: null,
    expectedVersion: null,
  });
  expect(reset.draftVersion).toBeGreaterThan(first.draftVersion);
  expect(
    (
      await request("/api/storefront/ai/publish", {
        expectedVersion: first.draftVersion,
      })
    ).status,
  ).toBe(409);
  await json("/api/storefront/ai/discard", {
    expectedVersion: reset.draftVersion,
  });
  expect(
    await (await request("/" + store.slug, undefined, "GET", "")).text(),
  ).toContain("Custom draft content");
  const resetAgain = await json("/api/storefront/site", {
    site: null,
    expectedVersion: null,
  });
  await json("/api/storefront/ai/publish", {
    expectedVersion: resetAgain.draftVersion,
  });
  const fallback = await (
    await request("/" + store.slug, undefined, "GET", "")
  ).text();
  expect(fallback).not.toContain("Custom draft content");
  expect(fallback).not.toMatch(/<iframe[^>]*sandbox="allow-scripts"/);
  expect(
    (await json("/api/storefront/ai")).messages.map((m: any) => m.role),
  ).toEqual(["event", "event", "event"]);
});
it("authorizes analytics and tracking preferences from the session storefront", async () => {
  const db = await mf.getD1Database("DB");
  await db
    .prepare(
      "INSERT INTO stores(id,owner_id,slug,name,created_at) VALUES ('traffic-b','traffic-owner','traffic-b','Other storefront',0)",
    )
    .run();
  try {
    expect((await request("/api/analytics", undefined, "GET", "")).status).toBe(
      401,
    );
    expect(
      (
        await request(
          "/api/analytics/settings",
          { trackingEnabled: false },
          "PATCH",
          "",
        )
      ).status,
    ).toBe(401);
    expect((await request("/api/analytics?days=0")).status).toBe(400);
    expect((await json("/api/analytics?storeId=traffic-b")).status).toBe(
      "setup",
    );
    expect(
      (
        await request(
          "/api/analytics/settings",
          { storeId: "traffic-b", trackingEnabled: false },
          "PATCH",
        )
      ).status,
    ).toBe(400);
    await json(
      "/api/analytics/settings?storeId=traffic-b",
      { trackingEnabled: false },
      "PATCH",
    );
    expect((await json("/api/analytics")).settings.trackingEnabled).toBe(false);
    expect(
      await db
        .prepare("SELECT tracking_enabled FROM stores WHERE id='traffic-b'")
        .first("tracking_enabled"),
    ).toBe(1);
    const dropped = await request(
      "/api/public/jamie-lane/view",
      { visitor: crypto.randomUUID(), productId: "business-reset" },
      "POST",
      "",
    );
    expect(await dropped.json()).toEqual({ recorded: false });
  } finally {
    await json("/api/analytics/settings", { trackingEnabled: true }, "PATCH");
    await db.prepare("DELETE FROM stores WHERE id='traffic-b'").run();
  }
});
