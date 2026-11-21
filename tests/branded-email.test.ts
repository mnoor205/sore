import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
let mf: Miniflare;
const issuer = "https://test.cloudflareaccess.com";
async function call(path: string, body: unknown = {}) {
  const r = await mf.dispatchFetch("https://app.example.test/" + path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as any };
}
async function query(sql: string, args: unknown[] = []) {
  return (await call("query", { sql, args })).data.results;
}
async function request(email = "Coach@Example.test", returnTo = "/dashboard") {
  const r = await call("request", { email, returnTo });
  expect(r.status).toBe(200);
  const messages = (await call("messages")).data;
  const code = messages.at(-1).text.match(/sign-in code: (\d{6})/)[1];
  return { state: r.data.state, code };
}
beforeAll(async () => {
  await build({
    entryPoints: ["tests/branded-email-worker.ts"],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    outfile: "artifacts/branded-test.mjs",
    external: ["cloudflare:workers", "node:*"],
    conditions: ["workerd", "worker", "browser"],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "artifacts/branded-test.mjs",
      compatibilityDate: "2026-11-19",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "branded" },
      bindings: {
        APP_MODE: "production",
        AUTH_PROVIDER: "email",
        OTP_FROM: "login@getsore.me",
        ACCESS_ISSUER: issuer,
        ACCESS_AUDIENCE: "fixture",
        APP_URL: "https://app.example.test",
        SESSION_SECRET: "branded-email-test-secret-long-enough-for-hmac",
      },
    }),
  );
  const init = await call("init", {
    sql: readdirSync("migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort()
      .map((n) => readFileSync("migrations/" + n, "utf8"))
      .join("\n"),
  });
  expect(init.status).toBe(200);
}, 60000);
beforeEach(async () => {
  await call("reset");
});
afterAll(async () => {
  await mf?.dispose();
});
it("sends the branded multipart email, hashes codes, preserves creator identity, and revokes sessions", async () => {
  const s = await request();
  const message = (await call("messages")).data[0];
  expect(message.from).toEqual({
    email: "login@getsore.me",
    name: "Coachlane",
  });
  expect(message.html).toContain("#ec008c");
  expect(message.html).toContain(s.code);
  expect(message.text).toContain("10 minutes");
  const rows = await query("SELECT * FROM creator_email_codes");
  expect(rows[0].email).toBe("coach@example.test");
  expect(rows[0].code_hash).toHaveLength(64);
  expect(rows[0].code_hash).not.toContain(s.code);
  const signed = await call("verify", s);
  expect(signed.status).toBe(200);
  expect(signed.data.returnTo).toBe("/onboarding");
  expect(signed.data.expiresAt - Date.now()).toBeGreaterThan(
    30 * 86400000 - 10000,
  );
  expect(signed.data.expiresAt - Date.now()).toBeLessThanOrEqual(30 * 86400000);
  const user = (await call("session", signed.data)).data;
  expect(user.ownerId).toBe(
    "cf_" +
      createHash("sha256")
        .update(issuer + "\ncoach@example.test")
        .digest("hex"),
  );
  expect(await query("SELECT * FROM creator_email_codes")).toHaveLength(0);
  await call("revoke", signed.data);
  expect((await call("session", signed.data)).status).toBe(401);
});
it("rejects forged browser state, wrong codes and expired codes without creating sessions", async () => {
  const s = await request();
  expect((await call("verify", { ...s, state: "forged" })).status).toBe(401);
  expect((await call("verify", { ...s, code: "invalid" })).status).toBe(401);
  await query("UPDATE creator_email_codes SET expires_at=0");
  expect((await call("verify", s)).status).toBe(401);
  expect(await query("SELECT * FROM creator_sessions")).toHaveLength(0);
});
it("locks out a challenge after five guesses", async () => {
  const s = await request();
  const wrong = s.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    expect((await call("verify", { ...s, code: wrong })).status).toBe(401);
  expect((await call("verify", s)).status).toBe(401);
});
it("enforces resend cooldown and invalidates the previous browser/code on resend", async () => {
  const a = await request();
  expect((await call("request", { email: "coach@example.test" })).status).toBe(
    429,
  );
  await query("UPDATE creator_email_codes SET created_at=0");
  const b = await request();
  expect((await call("verify", a)).status).toBe(401);
  expect((await call("verify", b)).status).toBe(200);
});
it("allows exactly one concurrent redemption", async () => {
  const s = await request();
  const results = await Promise.all([call("verify", s), call("verify", s)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  expect(await query("SELECT * FROM creator_sessions")).toHaveLength(1);
});
it("removes challenges after delivery failure and never emits a browser state", async () => {
  const r = await call("request", { email: "coach@example.test", fail: true });
  expect(r.status).toBe(503);
  expect(r.data.state).toBeUndefined();
  expect(await query("SELECT * FROM creator_email_codes")).toHaveLength(0);
});
it("sanitizes redirect proposals and enforces IP send limits", async () => {
  await request("coach@example.test", "https://evil.example");
  const m = await call("request", { email: "bad" });
  expect(m.status).toBe(400);
  for (let i = 0; i < 4; i++)
    expect(
      (await call("request", { email: `other${i}@example.test` })).status,
    ).toBe(200);
  expect(
    (await call("request", { email: "blocked@example.test" })).status,
  ).toBe(429);
});
