import { z } from "zod";
// Structured storefront design options. Both editors and the AI write only these
// predefined values; nothing here is executed as HTML, CSS or script.
export const themeOptions = {
  background: ["preset", "light", "cream", "blush", "sage", "sky", "midnight"],
  font: ["preset", "sans", "serif", "rounded", "mono"],
  corners: ["preset", "sharp", "soft", "round"],
  buttons: ["preset", "filled", "outline", "pill"],
  align: ["center", "left"],
  layout: ["list", "grid"],
} as const;
export const themeLabels: Record<string, string> = {
  preset: "Match style preset",
  light: "Light",
  cream: "Cream",
  blush: "Blush",
  sage: "Sage",
  sky: "Sky",
  midnight: "Midnight",
  sans: "Modern sans",
  serif: "Classic serif",
  rounded: "Friendly rounded",
  mono: "Typewriter mono",
  sharp: "Sharp",
  soft: "Soft",
  round: "Very round",
  filled: "Filled",
  outline: "Outline",
  pill: "Pill",
  center: "Centered",
  left: "Left aligned",
  list: "Single column",
  grid: "Grid on wide screens",
};
export const DEFAULT_SECTION_LABEL = "MADE WITH YOU IN MIND";
export const DEFAULT_FOOTER = "Resources for your independent mind.";
export const themeSchema = z
  .object({
    background: z.enum(themeOptions.background).default("preset"),
    font: z.enum(themeOptions.font).default("preset"),
    corners: z.enum(themeOptions.corners).default("preset"),
    buttons: z.enum(themeOptions.buttons).default("preset"),
    align: z.enum(themeOptions.align).default("center"),
    layout: z.enum(themeOptions.layout).default("list"),
    announcement: z.string().trim().max(140).default(""),
    sectionLabel: z.string().trim().max(60).default(DEFAULT_SECTION_LABEL),
    footerText: z.string().trim().max(120).default(DEFAULT_FOOTER),
  })
  .strict();
export type StoreTheme = z.infer<typeof themeSchema>;
/** A partial theme change. No defaults, so omitted fields stay untouched. */
export const themePatchSchema = z
  .object({
    background: z.enum(themeOptions.background).optional(),
    font: z.enum(themeOptions.font).optional(),
    corners: z.enum(themeOptions.corners).optional(),
    buttons: z.enum(themeOptions.buttons).optional(),
    align: z.enum(themeOptions.align).optional(),
    layout: z.enum(themeOptions.layout).optional(),
    announcement: z.string().trim().max(140).optional(),
    sectionLabel: z.string().trim().max(60).optional(),
    footerText: z.string().trim().max(120).optional(),
  })
  .strict();
export function theme(value?: string | Partial<StoreTheme> | null): StoreTheme {
  try {
    const raw = typeof value === "string" ? JSON.parse(value || "{}") : value;
    return themeSchema.parse(raw || {});
  } catch {
    return themeSchema.parse({});
  }
}
/** Class names applied to the public storefront root for a theme. */
export function themeClasses(t: StoreTheme) {
  return [
    t.background !== "preset" && "theme-bg-" + t.background,
    t.font !== "preset" && "theme-font-" + t.font,
    t.corners !== "preset" && "theme-corners-" + t.corners,
    t.buttons !== "preset" && "theme-buttons-" + t.buttons,
    t.align === "left" && "theme-align-left",
    t.layout === "grid" && "theme-layout-grid",
  ]
    .filter(Boolean)
    .join(" ");
}
