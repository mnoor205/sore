import { z } from "zod";
import type { PublicProduct, PublicStore } from "@/components/storefront";
import { theme } from "./storefront-theme";
import { siteImageUrl } from "./site-images";

// Small, dependency-free files. HTML is a body fragment; extra pages can use hash
// routing. Code is NEVER exposed by an HTML route, only an iframe's srcDoc.
export const SITE_FILE_BYTES = 48 * 1024;
export const SITE_TOTAL_BYTES = 96 * 1024;
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const file = z
  .string()
  .refine((v) => bytes(v) <= SITE_FILE_BYTES, "File exceeds 48 KiB");
export const customSiteSchema = z
  .object({ html: file, css: file, js: file })
  .strict()
  .refine(
    (v) => bytes(v.html) + bytes(v.css) + bytes(v.js) <= SITE_TOTAL_BYTES,
    "Site exceeds 96 KiB",
  );
export const siteFilesPatchSchema = z
  .object({ html: file.optional(), css: file.optional(), js: file.optional() })
  .strict();
export type CustomSite = z.infer<typeof customSiteSchema>;
export const CUSTOM_SITE_SANDBOX = "allow-scripts";
// Only explicitly public raster images on the platform may make requests.
export const CUSTOM_SITE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'";
export function customSiteCsp(origin = "") {
  if (!origin) return CUSTOM_SITE_CSP;
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol)) return CUSTOM_SITE_CSP;
  return CUSTOM_SITE_CSP.replace(
    "img-src data: blob:",
    `img-src data: blob: ${url.origin}/media/`,
  );
}
export function parseCustomSite(json?: string | null): CustomSite | null {
  if (!json) return null;
  return customSiteSchema.parse(JSON.parse(json));
}
export function commerceData(
  store: Pick<
    PublicStore,
    "name" | "slug" | "bio" | "currency" | "supportEmail"
  > & { photo?: string; socials?: string | Record<string, unknown> },
  products: PublicProduct[],
  origin = "",
) {
  return {
    imageOrigin: origin,
    store: {
      name: store.name,
      slug: store.slug,
      bio: store.bio,
      currency: store.currency,
      supportEmail: store.supportEmail,
      photo: siteImageUrl(store.photo, origin),
      // The merchant's saved profile links: the only external URLs a custom
      // site can open (through the host, in a new tab).
      socials: socialLinks(store.socials),
    },
    products: products
      .filter((p) => p.state === "published")
      .map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        price: p.price,
        formattedPrice: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: store.currency,
        }).format(p.price / 100),
        buttonLabel: p.buttonLabel,
        kind: p.kind,
        image: siteImageUrl(p.image, origin),
        // Platform product page owns the buyer-details and checkout flow.
        checkoutUrl: `/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(p.id)}`,
      })),
  };
}
export type CommerceData = ReturnType<typeof commerceData>;
function socialLinks(value?: string | Record<string, unknown>) {
  let raw: unknown = value;
  try {
    if (typeof value === "string") raw = JSON.parse(value || "{}");
  } catch {
    raw = {};
  }
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [name, url] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof url !== "string" || name.length > 50) continue;
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && !u.username && !u.password)
        out[name] = u.href;
    } catch {}
  }
  return out;
}
/** A validated request from the custom site to open one of the store's saved links. */
export function linkMessageUrl(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  source: MessageEventSource | null,
  data: CommerceData,
): string | null {
  if (!source || event.source !== source || event.origin !== "null")
    return null;
  const message = event.data;
  if (message?.type !== "sore:open-link" || typeof message.url !== "string")
    return null;
  return (
    Object.values(data.store.socials).find((url) => url === message.url) ??
    null
  );
}
export function checkoutMessageUrl(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  source: MessageEventSource | null,
  data: CommerceData,
): string | null {
  if (!source || event.source !== source || event.origin !== "null")
    return null;
  const message = event.data;
  if (
    !message ||
    message.type !== "sore:checkout" ||
    typeof message.productId !== "string"
  )
    return null;
  return (
    data.products.find((p) => p.id === message.productId)?.checkoutUrl ?? null
  );
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function customSiteDocument(
  site: CustomSite,
  data: CommerceData,
): string {
  // CSP is first, before ALL merchant bytes. srcDoc is attribute-escaped by React.
  // CSS/JS are encoded as JSON so </style> / </script> cannot break the wrapper.
  const bootstrap = `(() => {
    const freeze = v => { if(v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
    const data = ${scriptJson(data)};
    Object.defineProperty(window, 'Sore', { value: Object.freeze({ ...freeze(data), checkout(productId) { if(data.products.some(p => p.id === productId)) parent.postMessage({ type:'sore:checkout', productId }, '*'); }, openLink(url) { if(Object.values(data.store.socials).includes(url)) parent.postMessage({ type:'sore:open-link', url }, '*'); } }), writable:false, configurable:false });
    const style = document.createElement('style'); style.textContent = ${scriptJson(site.css)}; document.head.append(style);
    addEventListener('DOMContentLoaded', () => { const script = document.createElement('script'); script.textContent = ${scriptJson(site.js)}; document.body.append(script); });
  })();`;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${escapeHtml(customSiteCsp(data.imageOrigin))}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"><title>${escapeHtml(data.store.name)}</title><script>${bootstrap}</script></head><body>${site.html}</body></html>`;
}
export function starterSite(
  store: Pick<PublicStore, "accent" | "stylePreset" | "theme">,
): CustomSite {
  const t = theme(store.theme);
  const background: Record<string, string> = {
    light: "#fff",
    cream: "#faf5eb",
    blush: "#fceef2",
    sage: "#eef4ed",
    sky: "#edf4fc",
    midnight: "#172033",
  };
  const accent =
    store.stylePreset === "botanical"
      ? "#51705a"
      : store.stylePreset === "editorial"
        ? "#4f46e5"
        : store.accent;
  return {
    html: `${t.announcement ? `<aside>${escapeHtml(t.announcement)}</aside>` : ""}<main><header><div class="avatar" aria-hidden="true">✦</div><h1 id="name"></h1><p id="bio"></p></header><h2>${escapeHtml(t.sectionLabel)}</h2><section id="products"></section><footer>${escapeHtml(t.footerText)}</footer></main>`,
    css: `*{box-sizing:border-box}body{margin:0;background:${background[t.background] || (store.stylePreset === "botanical" ? "#f1f5ee" : "#faf9f7")};color:${t.background === "midnight" ? "#fff" : "#252525"};font-family:${t.font === "serif" || store.stylePreset === "editorial" ? "Georgia,serif" : t.font === "mono" ? "monospace" : "system-ui,sans-serif"}}main{max-width:900px;margin:auto;padding:36px 20px}header{text-align:${t.align};max-width:560px;margin:0 auto 36px}h1{font-size:32px;margin:16px 0 8px}p{line-height:1.6;white-space:pre-line}.avatar{margin:auto;background:${accent};color:white;border-radius:50%;width:76px;height:76px;display:grid;place-items:center;font-size:36px}h2{font-size:12px;letter-spacing:.12em;margin:28px 0 16px}#products{display:grid;gap:16px}.product{border:1px solid #8884;border-radius:${t.corners === "sharp" ? "0" : "18px"};padding:24px;background:#ffffff0a}.product h3{margin:0;font-size:21px}.price{font-weight:bold}button{background:${accent};color:white;border:0;padding:14px 20px;border-radius:${t.buttons === "pill" ? "999px" : "9px"};font:inherit;cursor:pointer;width:100%}aside{text-align:center;padding:12px;background:${accent};color:white}footer{text-align:center;font-size:13px;opacity:.7;padding:36px 0}@media(min-width:700px){#products{grid-template-columns:${t.layout === "grid" ? "repeat(2,minmax(0,1fr))" : "1fr"}}}`,
    js: `document.getElementById('name').textContent = Sore.store.name;
document.getElementById('bio').textContent = Sore.store.bio;
for (const p of Sore.products) {
  const card = document.createElement('article'); card.className = 'product';
  for (const [tag, text, cls] of [['h3', p.title, ''], ['p', p.description, ''], ['p', p.formattedPrice, 'price']]) {
    const el = document.createElement(tag); el.textContent = text; el.className = cls; card.append(el);
  }
  const buy = document.createElement('button'); buy.textContent = p.buttonLabel; buy.onclick = () => Sore.checkout(p.id); card.append(buy);
  document.getElementById('products').append(card);
}`,
  };
}
