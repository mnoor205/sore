import { z } from "zod";
import { catalog } from "./catalog";
import { presentation, sectionIds } from "./presentation";
import {
  theme,
  themePatchSchema,
  themeSchema,
  type StoreTheme,
} from "./storefront-theme";
import type { AppEnv } from "./env";
import type { stores } from "./schema";
import { AppError, id, now } from "./security";
// A storefront "document" is the editable subset of the live store: profile copy,
// design options and product copy/sections. Prices, delivery, files, images,
// testimonials and publication state are deliberately not part of it.
type StoreRow = typeof stores.$inferSelect;
export type DocProduct = {
  title: string;
  description: string;
  buttonLabel: string;
  position: number;
  audience: string;
  includedItems: string[];
  faqs: { question: string; answer: string }[];
  sectionOrder: (typeof sectionIds)[number][];
  hiddenSections: (typeof sectionIds)[number][];
};
export type StorefrontDoc = {
  store: {
    name: string;
    bio: string;
    accent: string;
    stylePreset: "studio" | "editorial" | "botanical";
    theme: StoreTheme;
  };
  products: Record<string, DocProduct>;
};
const faq = z
  .object({
    question: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(2000),
  })
  .strict();
const section = z.enum(sectionIds);
export const storefrontPatchSchema = z
  .object({
    store: z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        bio: z.string().trim().max(350).optional(),
        accent: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a #RRGGBB color")
          .optional(),
        stylePreset: z.enum(["studio", "editorial", "botanical"]).optional(),
        theme: themePatchSchema.optional(),
      })
      .strict()
      .optional(),
    products: z
      .array(
        z
          .object({
            id: z.string().max(80),
            title: z.string().trim().min(2).max(140).optional(),
            description: z.string().trim().max(5000).optional(),
            buttonLabel: z.string().trim().min(1).max(50).optional(),
            position: z.number().int().min(0).max(1000).optional(),
            audience: z.string().trim().max(2000).optional(),
            includedItems: z
              .array(z.string().trim().min(1).max(500))
              .max(30)
              .optional(),
            faqs: z.array(faq).max(15).optional(),
            sectionOrder: z
              .array(section)
              .length(5)
              .refine((v) => new Set(v).size === 5, "Use each section once")
              .optional(),
            hiddenSections: z.array(section).max(5).optional(),
          })
          .strict(),
      )
      .max(60)
      .optional(),
  })
  .strict();
export type StorefrontPatch = z.infer<typeof storefrontPatchSchema>;
export async function liveDoc(
  env: AppEnv,
  store: StoreRow,
): Promise<StorefrontDoc> {
  const items = (await catalog(env, store.id)).filter(
    (p) => p.state !== "archived",
  );
  const products: Record<string, DocProduct> = {};
  for (const p of items) {
    const d = presentation(p.presentationJson);
    products[p.id] = {
      title: p.title,
      description: p.description,
      buttonLabel: p.buttonLabel,
      position: p.position,
      audience: d.audience,
      includedItems: d.includedItems,
      faqs: d.faqs,
      sectionOrder: d.sectionOrder,
      hiddenSections: d.hiddenSections,
    };
  }
  return {
    store: {
      name: store.name,
      bio: store.bio,
      accent: store.accent,
      stylePreset: (["studio", "editorial", "botanical"].includes(
        store.stylePreset,
      )
        ? store.stylePreset
        : "studio") as StorefrontDoc["store"]["stylePreset"],
      theme: theme(store.themeJson),
    },
    products,
  };
}
// Leaf paths are compared as JSON so arrays (FAQs, section order) count as one field.
function leaves(doc: StorefrontDoc) {
  const out = new Map<string, string>();
  const { theme: t, ...rest } = doc.store;
  for (const [k, v] of Object.entries(rest))
    out.set("store." + k, JSON.stringify(v));
  for (const [k, v] of Object.entries(t))
    out.set("store.theme." + k, JSON.stringify(v));
  for (const [pid, p] of Object.entries(doc.products))
    for (const [k, v] of Object.entries(p))
      out.set(`products.${pid}.${k}`, JSON.stringify(v));
  return out;
}
function setLeaf(doc: StorefrontDoc, path: string, json: string) {
  const parts = path.split("."),
    value = JSON.parse(json);
  if (parts[0] === "store" && parts[1] === "theme")
    (doc.store.theme as Record<string, unknown>)[parts[2]] = value;
  else if (parts[0] === "store")
    (doc.store as Record<string, unknown>)[parts[1]] = value;
  else if (doc.products[parts[1]])
    (doc.products[parts[1]] as Record<string, unknown>)[parts[2]] = value;
}
/** Paths the draft changed relative to the snapshot it was started from. */
export function changedPaths(base: StorefrontDoc, draft: StorefrontDoc) {
  const b = leaves(base);
  return [...leaves(draft)]
    .filter(([path, v]) => b.has(path) && b.get(path) !== v)
    .map(([path]) => path);
}
/**
 * Apply only the fields the AI draft changed onto the current live storefront.
 * Manual edits made after the draft started therefore survive, except where the
 * draft deliberately changed the same field.
 */
export function overlay(
  live: StorefrontDoc,
  base: StorefrontDoc,
  draft: StorefrontDoc,
): StorefrontDoc {
  const result = structuredClone(live),
    d = leaves(draft),
    l = leaves(live);
  for (const path of changedPaths(base, draft))
    if (l.has(path)) setLeaf(result, path, d.get(path)!);
  return result;
}
export function applyPatch(doc: StorefrontDoc, input: unknown) {
  const patch = storefrontPatchSchema.parse(input),
    next = structuredClone(doc);
  if (patch.store) {
    const { theme: t, ...rest } = patch.store;
    Object.assign(next.store, rest);
    if (t) next.store.theme = themeSchema.parse({ ...next.store.theme, ...t });
  }
  const unknown: string[] = [];
  for (const { id: pid, ...fields } of patch.products || []) {
    if (!next.products[pid]) {
      unknown.push(pid);
      continue;
    }
    Object.assign(next.products[pid], fields);
    const p = next.products[pid];
    p.hiddenSections = [...new Set(p.hiddenSections)];
  }
  return { doc: next, unknown };
}
const labels: Record<string, string> = {
  name: "Display name",
  bio: "Bio",
  accent: "Accent color",
  stylePreset: "Style preset",
  background: "Background",
  font: "Font",
  corners: "Corners",
  buttons: "Button style",
  align: "Alignment",
  layout: "Layout",
  announcement: "Announcement bar",
  sectionLabel: "Section heading",
  footerText: "Footer text",
  title: "title",
  description: "description",
  buttonLabel: "button text",
  position: "order",
  audience: "“Who this is for”",
  includedItems: "included items",
  faqs: "FAQs",
  sectionOrder: "section order",
  hiddenSections: "visible sections",
};
export function describe(path: string, doc: StorefrontDoc) {
  const parts = path.split(".");
  if (parts[0] === "store") return labels[parts.at(-1)!] || parts.at(-1)!;
  const title = doc.products[parts[1]]?.title || "Product";
  return `${title}: ${labels[parts[2]] || parts[2]}`;
}
type DraftRow = {
  base_json: string;
  draft_json: string;
  version: number;
  updated_at: number;
};
export async function loadDraft(env: AppEnv, storeId: string) {
  const row = await env.DB.prepare(
    "SELECT base_json,draft_json,version,updated_at FROM storefront_drafts WHERE store_id=?",
  )
    .bind(storeId)
    .first<DraftRow>();
  return row
    ? {
        base: JSON.parse(row.base_json) as StorefrontDoc,
        draft: JSON.parse(row.draft_json) as StorefrontDoc,
        version: row.version,
        updatedAt: row.updated_at,
      }
    : null;
}
/** The storefront the AI editor shows: live content with the AI draft on top. */
export async function draftView(env: AppEnv, store: StoreRow) {
  const live = await liveDoc(env, store),
    saved = await loadDraft(env, store.id);
  if (!saved) return { live, effective: live, draft: null };
  const effective = overlay(live, saved.base, saved.draft),
    changes = changedPaths(live, effective);
  return {
    live,
    effective,
    draft: {
      version: saved.version,
      updatedAt: saved.updatedAt,
      changes: changes.map((p) => describe(p, effective)),
    },
  };
}
/**
 * Save a new draft state. The live snapshot becomes the base so later overlays
 * only re-apply what differs from live at the time of this edit.
 */
export async function saveDraft(
  env: AppEnv,
  storeId: string,
  live: StorefrontDoc,
  next: StorefrontDoc,
  expectedVersion: number | null,
) {
  const time = now();
  const result =
    expectedVersion === null
      ? await env.DB.prepare(
          "INSERT OR IGNORE INTO storefront_drafts (store_id,base_json,draft_json,version,created_at,updated_at) VALUES (?,?,?,1,?,?)",
        )
          .bind(storeId, JSON.stringify(live), JSON.stringify(next), time, time)
          .run()
      : await env.DB.prepare(
          "UPDATE storefront_drafts SET base_json=?,draft_json=?,version=version+1,updated_at=? WHERE store_id=? AND version=?",
        )
          .bind(
            JSON.stringify(live),
            JSON.stringify(next),
            time,
            storeId,
            expectedVersion,
          )
          .run();
  if (!result.meta.changes)
    throw new AppError(
      "Your AI draft changed in another tab. Refresh and try again.",
      409,
    );
  return expectedVersion === null ? 1 : expectedVersion + 1;
}
export async function recordMessage(
  env: AppEnv,
  storeId: string,
  role: "user" | "assistant" | "event",
  content: string,
  changes: string[] = [],
  draftVersion: number | null = null,
) {
  await env.DB.prepare(
    "INSERT INTO storefront_ai_messages (id,store_id,role,content,changes_json,draft_version,created_at) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(
      id(),
      storeId,
      role,
      content,
      JSON.stringify(changes),
      draftVersion,
      now(),
    )
    .run();
}
export async function messages(env: AppEnv, storeId: string, limit = 40) {
  const rows = await env.DB.prepare(
    "SELECT id,role,content,changes_json,draft_version,created_at FROM storefront_ai_messages WHERE store_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?",
  )
    .bind(storeId, limit)
    .all<{
      id: string;
      role: string;
      content: string;
      changes_json: string;
      draft_version: number | null;
      created_at: number;
    }>();
  return rows.results.reverse().map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    changes: JSON.parse(r.changes_json) as string[],
    draftVersion: r.draft_version,
    createdAt: r.created_at,
  }));
}
export async function publishDraft(
  env: AppEnv,
  store: StoreRow,
  expectedVersion: number,
) {
  const saved = await loadDraft(env, store.id);
  if (!saved || saved.version !== expectedVersion)
    throw new AppError(
      "Your AI draft changed. Review the latest preview before publishing.",
      409,
    );
  const live = await liveDoc(env, store),
    effective = overlay(live, saved.base, saved.draft),
    paths = changedPaths(live, effective),
    time = now(),
    guard =
      " AND EXISTS(SELECT 1 FROM storefront_drafts WHERE store_id=? AND version=?)";
  const statements: D1PreparedStatement[] = [];
  if (paths.some((p) => p.startsWith("store.")))
    statements.push(
      env.DB.prepare(
        "UPDATE stores SET name=?,bio=?,accent=?,style_preset=?,theme_json=? WHERE id=?" +
          guard,
      ).bind(
        effective.store.name,
        effective.store.bio,
        effective.store.accent,
        effective.store.stylePreset,
        JSON.stringify(effective.store.theme),
        store.id,
        store.id,
        expectedVersion,
      ),
    );
  const changedProducts = new Set(
    paths.filter((p) => p.startsWith("products.")).map((p) => p.split(".")[1]),
  );
  for (const p of await catalog(env, store.id)) {
    if (!changedProducts.has(p.id)) continue;
    const doc = effective.products[p.id],
      details = {
        ...presentation(p.presentationJson),
        audience: doc.audience,
        includedItems: doc.includedItems,
        faqs: doc.faqs,
        sectionOrder: doc.sectionOrder,
        hiddenSections: doc.hiddenSections,
      };
    statements.push(
      env.DB.prepare(
        "UPDATE products SET title=?,description=?,button_label=?,position=?,presentation_json=?,version=version+1,updated_at=? WHERE id=? AND store_id=? AND state!='archived' AND version=?" +
          guard,
      ).bind(
        doc.title,
        doc.description,
        doc.buttonLabel,
        doc.position,
        JSON.stringify(presentation(details)),
        time,
        p.id,
        store.id,
        p.version,
        store.id,
        expectedVersion,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      "DELETE FROM storefront_drafts WHERE store_id=? AND version=?",
    ).bind(store.id, expectedVersion),
  );
  const results = await env.DB.batch(statements);
  if (!results.at(-1)?.meta.changes)
    throw new AppError(
      "Your AI draft changed. Review the latest preview before publishing.",
      409,
    );
  const summary = paths.map((p) => describe(p, effective));
  await recordMessage(
    env,
    store.id,
    "event",
    paths.length
      ? `Published ${paths.length} change${paths.length === 1 ? "" : "s"} to your live storefront.`
      : "Published. Your live storefront already matched the draft.",
    summary,
  );
  return { published: true, changes: summary };
}
export async function discardDraft(env: AppEnv, storeId: string) {
  const result = await env.DB.prepare(
    "DELETE FROM storefront_drafts WHERE store_id=?",
  )
    .bind(storeId)
    .run();
  if (result.meta.changes)
    await recordMessage(
      env,
      storeId,
      "event",
      "Discarded the AI draft. Your live storefront was not changed.",
    );
  return { discarded: !!result.meta.changes };
}
