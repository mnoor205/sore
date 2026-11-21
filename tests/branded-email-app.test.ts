import { beforeAll, afterAll, it, expect } from "vitest";
import {
  Miniflare,
  convertV4MiniflareOptions,
  kCurrentWorker,
} from "miniflare";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { randomBytes, createHash } from "node:crypto";
let mf: Miniflare;
let messages: any[] = [];
const origin = "https://branded.example.test";
const bundle = resolve(
  process.env.COACHLANE_APP_BUNDLE || "artifacts/app/worker.js",
);
async function request(
  path: string,
  body?: unknown,
  cookie = "",
  originHeader = origin,
) {
  return mf.dispatchFetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "manual",
    headers: {
      ...(body === undefined
        ? {}
        : { Origin: originHeader, "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeAll(async () => {
  const shim = resolve(dirname(bundle), "branded-test-shim.mjs");
  writeFileSync(
    shim,
    `import app from './${basename(bundle)}';export * from './${basename(bundle)}';export default {...app,fetch(req,env,ctx){return app.fetch(req,{...env,LOGIN_EMAIL:{send:async message=>{await env.CAPTURE.fetch('https://capture.test',{method:'POST',body:JSON.stringify(message)});return {messageId:'fixture'};}}},ctx);}};`,
  );
  const paths = process.env.COACHLANE_APP_BUNDLE
    ? [
        shim,
        bundle,
        bundle.replace(/worker\.js$/, "app.js"),
        bundle.replace(/worker\.js$/, "assets.js"),
      ]
    : [shim, bundle];
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "branded-built",
      modules: paths.map((path) => ({ path, type: "ESModule" as const })),
      compatibilityDate: "2026-11-19",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "branded-built" },
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
      serviceBindings: {
        WORKER_SELF_REFERENCE: kCurrentWorker,
        CAPTURE: async (req: Request) => {
          messages.push(await req.json());
          return new Response("ok");
        },
      },
      outboundService: async (req) => {
        if (req.url === "https://api.stripe.com/v1/customers")
          return Response.json({ id: "cus_homepage" });
        if (req.url === "https://api.stripe.com/v1/checkout/sessions") {
          const params = new URLSearchParams(await req.text());
          if (
            params.get("line_items[0][price_data][unit_amount]") === "9900" &&
            params.get("line_items[0][price_data][product]") ===
              "prod_lifetime" &&
            params.get("customer") === "cus_homepage" &&
            params.get("metadata[reservation]")
          )
            return Response.json({
              id: "cs_homepage",
              url: "https://checkout.stripe.com/fixture",
            });
        }
        return new Response("Unexpected request", { status: 400 });
      },
      bindings: {
        STRIPE_SECRET_KEY: "sk_test_fixture",
        STRIPE_LTD_PRODUCT_ID: "prod_lifetime",
        STRIPE_BILLING_WEBHOOK_SECRET: "whsec_fixture",
        APP_MODE: "production",
        APP_URL: origin,
        MCP_URL: "https://mcp.example.test",
        AUTH_PROVIDER: "email",
        OTP_FROM: "login@getsore.me",
        ACCESS_ISSUER: "https://test.cloudflareaccess.com",
        ACCESS_AUDIENCE: "fixture",
        SESSION_SECRET: "branded-built-session-secret-at-least-32-chars",
        OAUTH_BRIDGE_SECRET: "branded-built-oauth-secret-at-least-32-chars",
      },
    }),
  );
  await (
    await mf.getD1Database("DB")
  ).exec(
    readdirSync("migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort()
      .map((n) => readFileSync("migrations/" + n, "utf8"))
      .join("\n"),
  );
}, 60000);
afterAll(async () => {
  await mf?.dispose();
});
it("branded HTTP routes enforce origin, verify the mailed code and revoke the resulting session", async () => {
  const page = await request("/sign-in");
  expect(await page.text()).toContain("Send sign-in code");
  const payload = {
    action: "request",
    email: "coach@example.test",
    returnTo: "https://evil.example/",
  };
  expect(
    (await request("/auth/email", payload, "", "https://evil.example")).status,
  ).toBe(403);
  expect(
    (await request("/auth/email", { ...payload, email: "invalid" })).status,
  ).toBe(400);
  expect(
    (await request("/auth/email", { ...payload, extra: "x".repeat(5000) }))
      .status,
  ).toBe(413);
  const sent = await request("/auth/email", payload);
  expect(sent.status).toBe(200);
  expect(await sent.json()).toEqual({ sent: true });
  const state = sent.headers
    .getSetCookie()
    .find((v) => v.startsWith("__Host-coachlane_otp="))!;
  expect(state).toContain("Secure");
  expect(state).toContain("HttpOnly");
  const cookie = state.split(";")[0];
  const code = messages[0].text.match(/sign-in code: (\d{6})/)[1];
  expect(
    (await request("/auth/email", { action: "verify", code })).status,
  ).toBe(401);
  const login = await request(
    "/auth/email",
    { action: "verify", code },
    cookie,
  );
  expect(login.status, await login.clone().text()).toBe(200);
  expect(await login.json()).toEqual({ url: origin + "/onboarding" });
  const sessionHeader = login.headers
    .getSetCookie()
    .find((v) => v.startsWith("__Host-coachlane_session="))!;
  const maxAge = Number(sessionHeader.match(/Max-Age=(\d+)/i)?.[1]);
  expect(maxAge).toBeGreaterThan(30 * 86400 - 10);
  expect(maxAge).toBeLessThanOrEqual(30 * 86400);
  expect(sessionHeader).toContain("Expires=");
  const session = login.headers
    .getSetCookie()
    .find((v) => v.startsWith("__Host-coachlane_session="))!
    .split(";")[0];
  expect((await request("/api/setup", undefined, session)).status).toBe(200);
  expect(
    (await request("/auth/email", { action: "verify", code }, cookie)).status,
  ).toBe(401);
  const logout = await request("/api/signout", {}, session);
  expect(logout.status).toBe(200);
  expect(await logout.json()).toEqual({ url: "/sign-in" });
  expect((await request("/api/setup", undefined, session)).status).toBe(401);
  expect((await request("/auth/verify?state=invalid")).status).toBe(410);
});

async function persistedSession(
  owner: string,
  expiresAt: number,
  createdAt: number,
) {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  await (
    await mf.getD1Database("DB")
  )
    .prepare(
      "INSERT INTO creator_sessions(token_hash,owner_id,email,expires_at,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(hash, owner, owner + "@example.test", expiresAt, createdAt)
    .run();
  return "__Host-coachlane_session=" + token;
}
it("recognizes returning creators on home/sign-in/sign-up after an overnight absence", async () => {
  const created = Date.now() - 9 * 3600000;
  const cookie = await persistedSession(
    "returning-creator",
    created + 30 * 86400000,
    created,
  );
  await (
    await mf.getD1Database("DB")
  )
    .prepare(
      "INSERT INTO stores(id,owner_id,slug,name,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(
      "returning-store",
      "returning-creator",
      "returning-store",
      "Returning Coach",
      created,
    )
    .run();
  for (const path of ["/", "/sign-in", "/sign-up"]) {
    const r = await request(path, undefined, cookie);
    expect(r.status).toBe(307);
    expect(new URL(r.headers.get("location")!, origin).pathname).toBe(
      "/dashboard",
    );
    expect(r.headers.get("cache-control")).not.toContain("public");
  }
  const draft = "/dashboard/products?draft=private-draft";
  const target = await request(
    "/sign-in?redirect_url=" + encodeURIComponent(draft),
    undefined,
    cookie,
  );
  expect(
    new URL(target.headers.get("location")!, origin).pathname +
      new URL(target.headers.get("location")!, origin).search,
  ).toBe(draft);
  const external = await request(
    "/sign-in?redirect_url=" + encodeURIComponent("https://evil.example/"),
    undefined,
    cookie,
  );
  expect(new URL(external.headers.get("location")!, origin).pathname).toBe(
    "/dashboard",
  );
  const guest = await request("/");
  expect(guest.status).toBe(200);
  expect(await guest.text()).toContain("into your next sale.");
  const logout = await request("/api/signout", {}, cookie);
  expect(logout.status).toBe(200);
  expect((await request("/sign-in", undefined, cookie)).status).toBe(200);
});
it("resumes unfinished setup without asking an authenticated creator for another code", async () => {
  const created = Date.now() - 9 * 3600000;
  const cookie = await persistedSession(
    "unfinished-creator",
    created + 30 * 86400000,
    created,
  );
  const before = messages.length;
  for (const path of ["/", "/sign-in", "/sign-up"]) {
    const r = await request(path, undefined, cookie);
    expect(r.status).toBe(307);
    expect(new URL(r.headers.get("location")!, origin).pathname).toBe(
      "/onboarding",
    );
  }
  expect(messages).toHaveLength(before);
});
it("does not treat expired or fabricated cookies as authenticated visits", async () => {
  const expired = await persistedSession(
    "expired-creator",
    Date.now() - 1000,
    Date.now() - 31 * 86400000,
  );
  for (const cookie of [
    expired,
    "__Host-coachlane_session=" + "f".repeat(64),
  ]) {
    expect((await request("/", undefined, cookie)).status).toBe(200);
    const signin = await request("/sign-in", undefined, cookie);
    expect(signin.status).toBe(200);
    expect(await signin.text()).toContain("Send sign-in code");
    expect((await request("/api/setup", undefined, cookie)).status).toBe(401);
  }
});

it("continues a homepage lifetime purchase through email verification, profile creation and hosted checkout", async () => {
  const buy = "/onboarding?checkout=lifetime";
  const page = await (await request("/")).text();
  expect(page.split('href="' + buy + '"')).toHaveLength(4);
  const guest = await request(buy);
  expect(guest.status).toBe(307);
  const signUp = new URL(guest.headers.get("location")!, origin);
  expect(signUp.pathname).toBe("/sign-up");
  const returnTo = signUp.searchParams.get("redirect_url");
  const sent = await request("/auth/email", {
    action: "request",
    email: "buyer@example.test",
    returnTo,
  });
  const otp = sent.headers.getSetCookie()[0].split(";")[0];
  const code = messages.at(-1).text.match(/sign-in code: (\d{6})/)[1];
  const verified = await request(
    "/auth/email",
    { action: "verify", code },
    otp,
  );
  expect(await verified.json()).toEqual({ url: origin + buy });
  const session = verified.headers
    .getSetCookie()
    .find((v) => v.startsWith("__Host-coachlane_session="))!
    .split(";")[0];
  const setup = (await (
    await request("/api/setup", undefined, session)
  ).json()) as any;
  const saved = await request(
    "/api/setup",
    {
      step: 1,
      expectedVersion: setup.version,
      content: {
        creator: {
          slug: "homepage-buyer",
          name: "Homepage Buyer",
          supportEmail: "buyer@example.test",
        },
      },
    },
    session,
  );
  expect(saved.status).toBe(200);
  expect((await request("/api/setup/step", { step: 1 }, session)).status).toBe(
    200,
  );
  expect(await (await request(buy, undefined, session)).text()).toContain(
    "Continue to Stripe Checkout",
  );
  const checkout = await request(
    "/api/billing/checkout",
    { kind: "lifetime" },
    session,
  );
  expect(await checkout.json()).toEqual({
    url: "https://checkout.stripe.com/fixture",
  });
});
