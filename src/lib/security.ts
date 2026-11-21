import { z } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const now = () => Date.now();
export const id = () => crypto.randomUUID();
export const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export async function sign(
  data: Record<string, unknown>,
  secret: string,
  seconds = 300,
) {
  if (!secret || secret.length < 32)
    throw new AppError("Server signing secret is not configured", 503);
  const body = base64(
    new TextEncoder().encode(
      JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + seconds }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return (
    body +
    "." +
    base64(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
      ),
    )
  );
}
export async function verify<T>(value: string, secret: string): Promise<T> {
  try {
    if (!secret || secret.length < 32) throw new Error();
    const [body, sig, ...extra] = value.split(".");
    if (extra.length) throw new Error();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const bytes = Uint8Array.from(
      atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        key,
        bytes,
        new TextEncoder().encode(body),
      ))
    )
      throw new Error();
    const parsed = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(body.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        ),
      ),
    );
    if (parsed.exp <= Date.now() / 1000) throw new Error();
    return parsed;
  } catch {
    throw new AppError("Invalid or expired access", 401);
  }
}
export const safeUrl = z
  .string()
  .url()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Use a public HTTPS URL");
export const money = (amount: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount / 100,
  );
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  return [
    keys.map(cell).join(","),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
  ].join("\r\n");
}
export function checkOrigin(req: Request, appOrigin?: string) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin && origin !== appOrigin)
    throw new AppError("Cross-origin request denied", 403);
}
export async function rateLimit(
  env: { DB: D1Database },
  key: string,
  limit = 60,
) {
  const minute = Math.floor(Date.now() / 60000);
  const result = await env.DB.prepare(
    "INSERT INTO rates (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key + ":" + minute, Date.now() + 120000)
    .first<{ count: number }>();
  if ((result?.count || 0) > limit)
    throw new AppError("Too many requests. Please try again shortly.", 429);
}
