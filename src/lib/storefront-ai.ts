import { ZodError } from "zod";
import type { AppEnv } from "./env";
import type { stores } from "./schema";
import { AppError, now } from "./security";
import { themeOptions } from "./storefront-theme";
import { sectionIds } from "./presentation";
import {
  applyPatch,
  changedPaths,
  describe,
  draftView,
  messages,
  recordMessage,
  saveDraft,
} from "./storefront-draft";
// Claude Haiku 5.5 (Anthropic model ID claude-haiku-5-5), addressed by its
// Cloudflare AI Gateway catalog name. Requests go through the Worker AI binding,
// so no provider key ever reaches the app or the browser.
export const STOREFRONT_MODEL = "anthropic/claude-haiku-5.5";
type StoreRow = typeof stores.$inferSelect;
type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: string; [key: string]: unknown };
type AnthropicMessage = {
  content?: AnthropicBlock[];
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};
const SYSTEM = `You are the storefront editor inside Sore, a platform where independent coaches sell digital resources from a mobile-first storefront. The merchant describes changes in plain language and you apply them by calling the update_storefront tool.

What you can change:
- Store profile: display name, bio (max 350 characters), accent color (#RRGGBB), style preset (studio, editorial, botanical).
- Store design (store.theme): background, font, corners, buttons, align, layout, announcement (a short banner, max 140 characters, empty string removes it), sectionLabel (the small uppercase heading above the products), footerText.
- Each product by id: title, description, buttonLabel, position (lower numbers appear first), audience ("Who this is for"), includedItems, faqs, sectionOrder, hiddenSections.

Rules:
- Only change what the merchant asked for, plus anything strictly needed for it to look right. Keep the merchant's voice and facts.
- Never invent testimonials, reviews, results, statistics, guarantees, credentials, prices, discounts, contact details or links. If copy needs facts you do not have, write it without them or ask.
- You cannot change prices, images, files, delivery, publication, checkout, or add custom code, CSS or new kinds of sections. Say so briefly and offer the closest supported change.
- Product ids must be copied exactly from the current storefront JSON.
- Everything you change is saved as a private draft. The merchant reviews it in the live preview and publishes it themselves, so never claim the change is live.
- Put your message to the merchant in the tool's "reply" field: one to three short, friendly sentences about what you changed (and anything you could not do). If nothing needs to change, answer in plain text without calling the tool.
- layout "grid" only applies on wide (desktop) screens; phones always show one column.
- The editorial and botanical presets use their own accent color. If the merchant wants a custom accent color to show, switch the style preset to studio.`;
const stringEnum = (values: readonly string[]) => ({
  type: "string",
  enum: values,
});
const TOOL = {
  name: "update_storefront",
  description:
    "Save changes to the merchant's private storefront draft. Include only the fields that change. Omitted fields stay as they are.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply"],
    properties: {
      reply: {
        type: "string",
        description:
          "One to three short sentences to the merchant about what changed.",
      },
      store: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          bio: { type: "string" },
          accent: { type: "string", description: "#RRGGBB" },
          stylePreset: stringEnum(["studio", "editorial", "botanical"]),
          theme: {
            type: "object",
            additionalProperties: false,
            properties: {
              background: stringEnum(themeOptions.background),
              font: stringEnum(themeOptions.font),
              corners: stringEnum(themeOptions.corners),
              buttons: stringEnum(themeOptions.buttons),
              align: stringEnum(themeOptions.align),
              layout: stringEnum(themeOptions.layout),
              announcement: { type: "string" },
              sectionLabel: { type: "string" },
              footerText: { type: "string" },
            },
          },
        },
      },
      products: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            buttonLabel: { type: "string" },
            position: { type: "integer" },
            audience: { type: "string" },
            includedItems: { type: "array", items: { type: "string" } },
            faqs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["question", "answer"],
                properties: {
                  question: { type: "string" },
                  answer: { type: "string" },
                },
              },
            },
            sectionOrder: {
              type: "array",
              items: stringEnum(sectionIds),
              description: "All five section ids, in display order",
            },
            hiddenSections: { type: "array", items: stringEnum(sectionIds) },
          },
        },
      },
    },
  },
};
async function dailyLimit(env: AppEnv, key: string, limit: number) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    "INSERT INTO rates (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(`${key}:${day}`, Date.now() + 2 * 86400000)
    .first<{ count: number }>();
  if ((row?.count || 0) > limit)
    throw new AppError(
      "You’ve reached today’s AI editing limit. Manual editing is still available.",
      429,
    );
}
function storefrontForModel(
  doc: Awaited<ReturnType<typeof draftView>>["effective"],
) {
  return {
    store: doc.store,
    products: Object.entries(doc.products)
      .sort(([, a], [, b]) => a.position - b.position)
      .map(([pid, p]) => ({ id: pid, ...p })),
  };
}
export async function storefrontChat(
  env: AppEnv,
  store: StoreRow,
  input: { message: string; expectedVersion: number | null },
) {
  if (!env.AI)
    throw new AppError(
      "The AI editor isn’t connected in this environment. Use the manual editor instead.",
      503,
    );
  await dailyLimit(
    env,
    `storefront-ai:${store.id}`,
    Number(env.STOREFRONT_AI_DAILY_LIMIT || 150),
  );
  await dailyLimit(
    env,
    "storefront-ai:all",
    Number(env.STOREFRONT_AI_GLOBAL_DAILY_LIMIT || 5000),
  );
  const view = await draftView(env, store),
    currentVersion = view.draft?.version ?? null;
  if (currentVersion !== input.expectedVersion)
    throw new AppError(
      "Your AI draft changed in another tab. Refresh to see the latest version.",
      409,
    );
  // Only the current draft session: a publish or discard event starts fresh, so
  // the model never "remembers" changes that are no longer in the draft.
  const recent = await messages(env, store.id, 12),
    lastEvent = recent.map((m) => m.role).lastIndexOf("event");
  const history = recent
    .slice(lastEvent + 1)
    .filter((m) => m.role === "user" || m.role === "assistant");
  const prior = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  // The API needs alternating turns that start with the user.
  while (prior.length && prior[0].role !== "user") prior.shift();
  const request = {
    max_tokens: 8000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "auto" },
    output_config: { effort: "low" },
    messages: [
      ...prior,
      {
        role: "user" as const,
        content: `Current storefront draft:\n\`\`\`json\n${JSON.stringify(storefrontForModel(view.effective))}\n\`\`\`\n\nMerchant request: ${input.message}`,
      },
    ],
  };
  let response: AnthropicMessage;
  try {
    response = (await env.AI.run(STOREFRONT_MODEL, request, {
      gateway: { id: env.AI_GATEWAY_ID || "default" },
    })) as AnthropicMessage;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "storefront_ai_failed",
        message: error instanceof Error ? error.message.slice(0, 300) : "",
      }),
    );
    throw new AppError(
      "The AI editor couldn’t reach the model just now. Please try again in a moment.",
      502,
    );
  }
  const logId = env.AI.aiGatewayLogId ?? null;
  if (response.stop_reason === "refusal")
    throw new AppError(
      "The AI editor can’t help with that request. Try describing a storefront change.",
      422,
    );
  const blocks = response.content || [];
  const text = blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const calls = blocks.filter(
    (b): b is { type: "tool_use"; id: string; name: string; input: unknown } =>
      b.type === "tool_use" && b.name === TOOL.name,
  );
  let next = view.effective,
    skipped: string[] = [],
    toolReply = "";
  try {
    for (const call of calls) {
      const { reply, ...patch } = (call.input || {}) as {
        reply?: unknown;
      } & Record<string, unknown>;
      if (typeof reply === "string") toolReply ||= reply.trim().slice(0, 1500);
      const applied = applyPatch(next, patch);
      next = applied.doc;
      skipped = skipped.concat(applied.unknown);
    }
  } catch (error) {
    if (error instanceof ZodError)
      throw new AppError(
        "The AI suggested a change Sore can’t apply (" +
          error.issues
            .slice(0, 2)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ") +
          "). Try rephrasing your request.",
        422,
      );
    throw error;
  }
  const changes = changedPaths(view.effective, next).map((p) =>
    describe(p, next),
  );
  let version = currentVersion;
  if (changes.length)
    version = await saveDraft(env, store.id, view.live, next, currentVersion);
  const reply =
    toolReply ||
    text ||
    (changes.length
      ? "Done. I updated your draft: " + changes.join(", ") + "."
      : "I didn’t change anything. Could you describe what you’d like to see?");
  await recordMessage(env, store.id, "user", input.message.trim());
  await recordMessage(
    env,
    store.id,
    "assistant",
    reply,
    changes,
    changes.length ? version : null,
  );
  console.log(
    JSON.stringify({
      event: "storefront_ai_edit",
      model: response.model,
      logId,
      changes: changes.length,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      at: now(),
    }),
  );
  return {
    reply,
    changes,
    skipped,
    draftVersion: version,
    model: response.model || STOREFRONT_MODEL,
    gatewayLogId: logId,
  };
}
