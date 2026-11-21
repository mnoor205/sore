import { eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { stores } from "./schema";
import { saveProduct } from "./catalog";
import { storeLimits, type AppEnv } from "./env";
import { AppError, id, now, safeUrl } from "./security";

// Stan storefronts are Next.js pages. The store and its products are embedded in the
// React Server Components payload (`self.__next_f.push([1, "..."])`) under `storeData`.

export type StanProduct = {
  sourceId: string;
  sourceType: string;
  title: string;
  description: string;
  image: string;
  price: number;
  kind: "resource" | "link";
  deliveryType: "url" | "file";
  deliveryUrl: string;
  buttonLabel: string;
  note: string;
};
export type StanStore = {
  handle: string;
  url: string;
  name: string;
  bio: string;
  photo: string;
  currency: string;
  currencySupported: boolean;
  supportEmail: string;
  socials: Record<string, string>;
  products: StanProduct[];
};

const supportedCurrencies = ["usd", "cad", "gbp", "eur", "aud"];
const handlePattern = /^[A-Za-z0-9_.-]{1,60}$/;

export function stanHandle(input: string) {
  let value = input.trim().replace(/^@/, "");
  if (/stan\.store/i.test(value)) {
    try {
      const u = new URL(
        /^https?:\/\//i.test(value) ? value : "https://" + value,
      );
      if (!/(^|\.)stan\.store$/i.test(u.hostname)) throw new Error();
      value = u.pathname.split("/").filter(Boolean)[0] || "";
    } catch {
      value = "";
    }
  }
  if (!handlePattern.test(value))
    throw new AppError("Enter your Stan store link, like stan.store/yourname");
  return value;
}

function flight(html: string) {
  let out = "";
  for (const m of html.matchAll(
    /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g,
  )) {
    try {
      const chunk = JSON.parse(m[1]);
      if (typeof chunk[1] === "string") out += chunk[1];
    } catch {
      // Ignore chunks that are not plain JSON arrays.
    }
  }
  return out;
}

/** Parses the JSON object that starts at the first `{` after `from`. */
function objectAt(text: string, from: number): unknown {
  const start = text.indexOf("{", from);
  if (start < 0) return undefined;
  let depth = 0,
    inString = false,
    escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

type Json = Record<string, any>;
const record = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
// RSC encodes references and `undefined` as strings starting with "$"; "$$" escapes a literal "$".
const text = (v: unknown) =>
  typeof v !== "string"
    ? ""
    : v.startsWith("$$")
      ? v.slice(1)
      : v.startsWith("$")
        ? ""
        : v;

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
export function plainText(html: string) {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n =
          e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1);
        return Number.isFinite(n) && n > 0 && n < 0x110000
          ? String.fromCodePoint(n)
          : "";
      }
      return entities[e.toLowerCase()] ?? m;
    })
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const https = (v: unknown) => {
  const value = text(v).trim();
  return safeUrl.safeParse(value).success ? value : "";
};
// Stan's stock artwork (e.g. graphics/device/link.png, no_user.png) is not the creator's own.
const ownImage = (v: unknown) => {
  const url = https(v);
  return url && !/\/graphics\/device\/|no_user\./i.test(url) ? url : "";
};

const socialBases: Record<string, (h: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  twitter: (h) => `https://x.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  threads: (h) => `https://www.threads.net/@${h}`,
  pinterest: (h) => `https://www.pinterest.com/${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
};
function socials(value: unknown) {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record(value))) {
    if (typeof raw !== "string" || !raw.trim() || key === "mail_to") continue;
    const v = raw.trim(),
      name = key.toLowerCase().slice(0, 50);
    const url = /^https?:\/\//i.test(v)
      ? v.replace(/^http:/i, "https:")
      : socialBases[name] && /^@?[\w.-]{1,100}$/.test(v)
        ? socialBases[name](v.replace(/^@/, ""))
        : "";
    if (url && safeUrl.safeParse(url).success) out[name] = url;
  }
  return out;
}

function mapProduct(page: Json, handle: string): StanProduct | null {
  const data = record(page.data),
    p = record(data.product);
  const title = text(p.title).trim().slice(0, 140);
  if (title.length < 2) return null;
  const type = text(p.type) || text(page.type) || "product";
  const amount = Number(record(p.price).amount);
  const price =
    Number.isFinite(amount) && amount > 0
      ? Math.min(Math.round(amount * 100), 10000000)
      : 0;
  const link = https(record(p.link).url);
  const label = (
    text(data.submit_title) || text(record(data.button).button_text)
  )
    .trim()
    .slice(0, 50);
  const base = {
    sourceId: String(p.id ?? page.page_id ?? title).slice(0, 40),
    sourceType: type,
    title,
    description: plainText(text(p.description)).slice(0, 5000),
    image: ownImage(p.image),
    price,
  };
  if (type === "link") {
    if (!link)
      return {
        ...base,
        kind: "resource",
        deliveryType: "url",
        deliveryUrl: "",
        buttonLabel: label || "Open",
        note: "Stan's link wasn't a public HTTPS address. Add the destination before publishing.",
      };
    const selfLink = /(^|\.)stan\.store$/i.test(new URL(link).hostname);
    return {
      ...base,
      price: 0,
      kind: "link",
      deliveryType: "url",
      deliveryUrl: link,
      buttonLabel: label || "Open",
      note: selfLink
        ? `This link points back to stan.store/${handle}. Update it before you cancel Stan.`
        : "",
    };
  }
  if (type === "digital-download")
    return {
      ...base,
      kind: "resource",
      deliveryType: "file",
      deliveryUrl: "",
      buttonLabel: label || "Get the resource",
      note: "Upload the file buyers receive. Stan doesn't make purchased files public.",
    };
  return {
    ...base,
    kind: "resource",
    deliveryType: "url",
    deliveryUrl: "",
    buttonLabel: label || "Get access",
    note:
      type === "meeting"
        ? "Coachlane doesn't schedule calls. Add your booking link (for example, Calendly) as the delivery URL."
        : `Stan "${type}" products don't map directly. Add the link where buyers get access.`,
  };
}

export function parseStanStore(html: string, handle: string): StanStore {
  const payload = flight(html),
    at = payload.indexOf('"storeData":');
  const storeData = at < 0 ? {} : record(objectAt(payload, at + 12));
  const store = record(storeData.store);
  if (!Array.isArray(store.pages))
    throw new AppError(
      "We couldn't read a Stan store at that address. Check the link and try again.",
      404,
    );
  let user = record(storeData.user);
  if (!user.username) {
    const u = payload.indexOf('"user":{"username"');
    if (u >= 0) user = record(objectAt(payload, u + 7));
  }
  const userData = record(user.data),
    currency = text(userData.currency).toLowerCase() || "usd";
  const mail = text(record(userData.socials).mail_to).trim();
  return {
    handle,
    url: `https://stan.store/${handle}`,
    name: text(user.full_name).trim().slice(0, 100) || handle,
    bio: text(user.bio).replace(/\s+/g, " ").trim().slice(0, 350),
    photo: ownImage(user.user_image),
    currency: supportedCurrencies.includes(currency) ? currency : "usd",
    currencySupported: supportedCurrencies.includes(currency),
    supportEmail: z.string().email().max(254).safeParse(mail).success
      ? mail
      : "",
    socials: socials(userData.socials),
    products: (store.pages as Json[])
      .filter(
        (page) => page && (page.status === undefined || page.status === 2),
      )
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((page) => mapProduct(page, handle))
      .filter((p): p is StanProduct => !!p)
      .slice(0, 100),
  };
}

export async function fetchStanStore(input: string) {
  const handle = stanHandle(input);
  let response: Response;
  try {
    response = await fetch(`https://stan.store/${encodeURIComponent(handle)}`, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; CoachlaneImporter/1.0)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new AppError("Stan didn't respond. Please try again shortly.", 502);
  }
  if (response.status === 404)
    throw new AppError(`There's no Stan store at stan.store/${handle}.`, 404);
  if (!response.ok)
    throw new AppError("Stan didn't respond. Please try again shortly.", 502);
  const html = await response.text();
  if (html.length > 5_000_000)
    throw new AppError("That Stan page is too large to import", 413);
  return parseStanStore(html, handle);
}

export async function importedSourceIds(env: AppEnv, storeId: string) {
  const rows = await env.DB.prepare(
    "SELECT i.source_id FROM import_sources i JOIN products p ON p.id=i.product_id AND p.store_id=i.store_id WHERE i.store_id=? AND i.source='stan' AND p.state!='archived'",
  )
    .bind(storeId)
    .all<{ source_id: string }>();
  return rows.results.map((r) => r.source_id);
}

const imageTypes: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71,
  "image/jpeg": (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  "image/webp": (b) =>
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};
const imageExtensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const stanHost = /(^|\.)(stanwith\.me|stan\.store)$/i;
async function download(url: string, limit: number) {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok || !stanHost.test(new URL(r.url || url).hostname)) return null;
    if (Number(r.headers.get("content-length") || 0) > limit) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    return bytes.length && bytes.length <= limit ? bytes : null;
  } catch {
    return null;
  }
}

/** Copies a Stan-hosted image into the store's own storage. Returns "" when it can't. */
export async function copyStanImage(env: AppEnv, storeId: string, url: string) {
  if (!url) return "";
  try {
    const source = new URL(url);
    if (!stanHost.test(source.hostname)) return "";
    const limit = Math.min(
      (await storeLimits(env, storeId)).upload,
      5 * 1024 * 1024,
    );
    // Stan stores full-size originals (often 8 MB+) and serves resized copies at fixed presets.
    const base = source.pathname
      .split("/")
      .at(-1)!
      .replace(/\.[^.]*$/, "");
    const candidates = /\/webp\//.test(source.pathname)
      ? [url]
      : [
          `${url}/webp/1200x0/100/${base}.webp`,
          `${url}/webp/433x0/85/${base}.webp`,
          url,
        ];
    let bytes: Uint8Array | null = null;
    for (const candidate of candidates)
      if ((bytes = await download(candidate, limit))) break;
    if (!bytes) return "";
    const type = Object.keys(imageTypes).find((t) => imageTypes[t](bytes));
    if (!type) return "";
    const assetId = id(),
      name = `stan-image.${imageExtensions[type]}`,
      key = `${storeId}/image/${assetId}/${name}`,
      storage = (await storeLimits(env, storeId)).storage;
    const reserved = await env.DB.prepare(
      "INSERT INTO assets (id,store_id,key,name,type,size,ready,purpose,created_at) SELECT ?,?,?,?,?,?,0,'image',? WHERE (SELECT COALESCE(SUM(size),0) FROM assets WHERE store_id=?) + ? <= ?",
    )
      .bind(
        assetId,
        storeId,
        key,
        name,
        type,
        bytes.length,
        now(),
        storeId,
        bytes.length,
        storage,
      )
      .run();
    if (!reserved.meta.changes) return "";
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: type } });
    await env.DB.prepare("UPDATE assets SET ready=1 WHERE id=? AND store_id=?")
      .bind(assetId, storeId)
      .run();
    return "/api/media/" + assetId;
  } catch {
    return "";
  }
}

const importInput = z
  .object({
    url: z.string().min(1).max(300),
    productIds: z.array(z.string().max(40)).max(100).default([]),
    profile: z.boolean().default(false),
  })
  .strict();

export async function importStanStore(
  env: AppEnv,
  storeId: string,
  input: unknown,
) {
  const data = importInput.parse(input),
    source = await fetchStanStore(data.url),
    db = database(env),
    wanted = new Set(data.productIds),
    already = new Set(await importedSourceIds(env, storeId)),
    created: { id: string; title: string; note: string }[] = [],
    skipped: { title: string; reason: string }[] = [];
  for (const p of source.products) {
    if (!wanted.has(p.sourceId)) continue;
    if (already.has(p.sourceId)) {
      skipped.push({ title: p.title, reason: "Already imported" });
      continue;
    }
    let productId: string;
    try {
      productId = await saveProduct(env, storeId, {
        title: p.title,
        description: p.description,
        image: await copyStanImage(env, storeId, p.image),
        buttonLabel: p.buttonLabel,
        price: p.price,
        kind: p.kind,
        deliveryType: p.deliveryType,
        deliveryUrl: p.deliveryUrl,
        state: "draft",
      });
    } catch (e) {
      skipped.push({
        title: p.title,
        reason:
          e instanceof AppError ? e.message : "Couldn't import this product",
      });
      if (e instanceof AppError && /product limit/.test(e.message)) break;
      continue;
    }
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE products SET draft_source='stan' WHERE id=? AND store_id=?",
      ).bind(productId, storeId),
      env.DB.prepare(
        "INSERT OR REPLACE INTO import_sources(store_id,source,source_id,product_id,created_at) VALUES (?,'stan',?,?,?)",
      ).bind(storeId, p.sourceId, productId, now()),
    ]);
    created.push({ id: productId, title: p.title, note: p.note });
  }
  let profileUpdated = false;
  if (data.profile) {
    // Only fills empty fields: an import never overwrites what the creator already wrote.
    const store = await db
      .select()
      .from(stores)
      .where(eq(stores.id, storeId))
      .get();
    if (store) {
      const current = JSON.parse(store.socials || "{}") as Record<
        string,
        string
      >;
      const patch: Partial<typeof stores.$inferInsert> = {};
      if (!store.bio && source.bio) patch.bio = source.bio;
      if (!store.photo && source.photo) {
        const photo = await copyStanImage(env, storeId, source.photo);
        if (photo) patch.photo = photo;
      }
      const merged = { ...source.socials, ...current };
      if (Object.keys(merged).length !== Object.keys(current).length)
        patch.socials = JSON.stringify(merged);
      if (Object.keys(patch).length) {
        await db.update(stores).set(patch).where(eq(stores.id, storeId));
        profileUpdated = true;
      }
    }
  }
  return { created, skipped, profileUpdated, currency: source.currency };
}

export async function previewStanStore(
  env: AppEnv,
  storeId: string | null,
  url: string,
) {
  const source = await fetchStanStore(url);
  return {
    ...source,
    imported: storeId ? await importedSourceIds(env, storeId) : [],
  };
}
