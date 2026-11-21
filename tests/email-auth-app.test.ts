import { beforeAll, afterAll, it, expect } from "vitest";
import {
  Miniflare,
  convertV4MiniflareOptions,
  kCurrentWorker,
} from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createHmac } from "node:crypto";
import {
  accessIssuer,
  accessAudience,
  accessJwks,
  accessJwt,
} from "./access-fixture";

let mf: Miniflare;
const origin = "https://auth-app.example.test";
const bridgeSecret = "built-email-auth-bridge-secret-at-least-32-characters";
const path = process.env.COACHLANE_APP_BUNDLE || "artifacts/app/worker.js";
const source = process.env.COACHLANE_APP_BUNDLE
  ? {
      modules: [
        path,
        path.replace(/worker\.js$/, "app.js"),
        path.replace(/worker\.js$/, "assets.js"),
      ].map((path) => ({ type: "ESModule" as const, path })),
    }
  : { modules: true as const, scriptPath: path };
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "email-auth-built",
      ...source,
      compatibilityDate: "2026-11-19",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: { DB: "email-auth-built" },
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
        ACCESS_ISSUER: accessIssuer,
        ACCESS_AUDIENCE: accessAudience,
        SESSION_SECRET:
          "built-email-auth-session-secret-at-least-32-characters",
        DOWNLOAD_SECRET:
          "built-email-auth-download-secret-at-least-32-characters",
        OAUTH_BRIDGE_SECRET: bridgeSecret,
      },
      outboundService: async (request) =>
        request.url === accessIssuer + "/cdn-cgi/access/certs"
          ? Response.json(accessJwks)
          : new Response("Unmocked provider request", { status: 503 }),
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

function request(
  path: string,
  cookie = "",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return mf.dispatchFetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "manual",
    headers: {
      ...headers,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined
        ? {}
        : { Origin: origin, "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(path: string, cookie: string, body?: unknown) {
  const result = await request(path, cookie, body);
  const value = (await result.json()) as any;
  expect(result.status, JSON.stringify(value)).toBe(200);
  return value;
}
function cookie(
  response: { headers: { getSetCookie(): string[] } },
  name: string,
) {
  const line = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(name + "="));
  expect(line).toBeTruthy();
  return line!.split(";")[0];
}
async function login(
  subject: string,
  email: string,
  next = "https://evil.example/",
) {
  const start = await request("/auth/start?next=" + encodeURIComponent(next));
  expect(start.status).toBe(307);
  expect(new URL(start.headers.get("location")!).pathname).toBe("/auth/verify");
  const stateCookie = cookie(start, "__Host-coachlane_login");
  expect(start.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  expect(start.headers.get("set-cookie")).toMatch(/Secure/i);
  const url = new URL(start.headers.get("location")!);
  expect(url.origin).toBe(origin);
  const result = await request(
    url.pathname + url.search,
    stateCookie,
    undefined,
    { "cf-access-jwt-assertion": accessJwt({ sub: subject, email }) },
  );
  expect(result.status, await result.clone().text()).toBe(307);
  expect(new URL(result.headers.get("location")!).origin).toBe(origin);
  if (next.startsWith(origin + "/api/oauth/bridge"))
    expect(result.headers.get("location")).toBe(next);
  expect(result.headers.get("cache-control")).toBe("no-store");
  const session = cookie(result, "__Host-coachlane_session");
  expect(
    (
      await request(url.pathname + url.search, stateCookie, undefined, {
        "cf-access-jwt-assertion": accessJwt({ sub: subject, email }),
      })
    ).status,
  ).toBe(401);
  return session;
}
async function createProfile(session: string, slug: string) {
  const setup = await json("/api/setup", session);
  const content = {
    ...setup.content,
    creator: {
      ...setup.content.creator,
      slug,
      name: slug,
      supportEmail: slug + "@example.test",
    },
  };
  await json("/api/setup", session, {
    expectedVersion: setup.version,
    step: 1,
    content,
  });
  return json("/api/setup/step", session, { step: 1 });
}

it("real built auth routes validate OTP assertions, isolate creators, preserve MCP login and revoke logout sessions", async () => {
  expect((await request("/")).status).toBe(200);
  expect(
    (await mf.dispatchFetch(origin + "/art/business-reset.svg")).status,
  ).toBe(200);
  const signIn = await request("/sign-in");
  const html = await signIn.text();
  expect(html).toContain("Continue with email");
  expect(html).not.toContain("Explore demo workspace");
  expect(
    (
      await request("/api/setup", "", undefined, {
        "Cf-Access-Authenticated-User-Email": "forged@example.test",
        "cf-access-jwt-assertion": accessJwt(),
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await request("/auth/verify?state=forged", "", undefined, {
        "cf-access-jwt-assertion": accessJwt(),
      })
    ).status,
  ).toBe(401);
  const alice = await login("creator-alice", "alice@example.test");
  const a = await createProfile(alice, "alice-coach");
  const product = await json("/api/products", alice, {
    title: "Alice private workbook",
    price: 0,
    deliveryUrl: "https://example.test/alice-private",
    state: "draft",
  });
  const bob = await login("creator-bob", "bob@example.test");
  const b = await createProfile(bob, "bob-coach");
  expect(a.ownerId).not.toBe(b.ownerId);
  const denied = await mf.dispatchFetch(
    origin + "/api/products/" + product.id,
    {
      method: "PATCH",
      headers: {
        Cookie: bob,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Tampered", price: 0, state: "draft" }),
    },
  );
  expect(denied.status).toBe(404);
  expect((await request("/alice-coach")).status).toBe(404);
  const saved = await json("/api/workspace", alice);
  expect(saved.store.id).toBe(a.store.id);
  const body = Buffer.from(
    JSON.stringify({
      nonce: "email-auth-bridge",
      aud: origin,
      exp: Math.floor(Date.now() / 1000) + 120,
    }),
  ).toString("base64url");
  const bridgeRequest =
    body +
    "." +
    createHmac("sha256", bridgeSecret).update(body).digest("base64url");
  const bridgePath = "/api/oauth/bridge?request=" + bridgeRequest;
  const unauthenticatedBridge = await request(bridgePath);
  expect(unauthenticatedBridge.status).toBe(307);
  const returnUrl = new URL(
    unauthenticatedBridge.headers.get("location")!,
  ).searchParams.get("redirect_url")!;
  expect(returnUrl).toBe(origin + bridgePath);
  const returnedAlice = await login(
    "creator-alice",
    "alice@example.test",
    returnUrl,
  );
  const bridge = await request(bridgePath, returnedAlice);
  expect(bridge.status).toBe(307);
  const callback = new URL(bridge.headers.get("location")!);
  expect(callback.origin).toBe("https://mcp.example.test");
  const ticket = JSON.parse(
    Buffer.from(
      callback.searchParams.get("ticket")!.split(".")[0],
      "base64url",
    ).toString(),
  );
  expect(ticket.subject).toBe(a.ownerId);
  expect(ticket.storeId).toBe(a.store.id);
  const signedOut = await request("/api/signout", returnedAlice, {});
  expect(signedOut.status).toBe(200);
  expect(((await signedOut.json()) as any).url).toBe(
    origin + "/cdn-cgi/access/logout",
  );
  expect((await request("/api/setup", returnedAlice)).status).toBe(401);
  expect((await request("/api/setup", bob)).status).toBe(200);
});
