import { z } from "zod";
import { safeUrl } from "./security";
export const imageUrl = z.union([
  safeUrl,
  z.literal(""),
  z.string().regex(/^\/(?:art\/[a-z-]+\.svg|api\/media\/[a-zA-Z0-9-]+)$/),
]);
export const sectionIds = [
  "audience",
  "included",
  "previews",
  "faqs",
  "testimonials",
] as const;
export const presentationSchema = z
  .object({
    audience: z.string().trim().max(2000).default(""),
    includedItems: z
      .array(z.string().trim().min(1).max(500))
      .max(30)
      .default([]),
    previewImages: z
      .array(imageUrl.refine((v) => !!v))
      .max(8)
      .default([]),
    sampleAssetId: z.string().max(80).nullable().default(null),
    faqs: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(300),
            answer: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .max(15)
      .default([]),
    testimonials: z
      .array(
        z
          .object({
            quote: z.string().trim().min(1).max(2000),
            name: z.string().trim().min(1).max(100),
            detail: z.string().trim().max(200).default(""),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    sectionOrder: z
      .array(z.enum(sectionIds))
      .length(5)
      .refine(
        (v) => new Set(v).size === 5,
        "Include each predefined section exactly once",
      )
      .default([...sectionIds]),
    hiddenSections: z.array(z.enum(sectionIds)).max(5).default([]),
  })
  .strict();
export type Presentation = z.infer<typeof presentationSchema>;
export function presentation(
  value?: string | Presentation | null,
): Presentation {
  return presentationSchema.parse(
    typeof value === "string" ? JSON.parse(value) : value || {},
  );
}
export function forPublicProduct<T extends { presentationJson: string }>(
  product: T,
): T {
  const value = presentation(product.presentationJson);
  for (const hidden of value.hiddenSections) {
    if (hidden === "audience") value.audience = "";
    if (hidden === "included") value.includedItems = [];
    if (hidden === "previews") {
      value.previewImages = [];
      value.sampleAssetId = null;
    }
    if (hidden === "faqs") value.faqs = [];
    if (hidden === "testimonials") value.testimonials = [];
  }
  return { ...product, presentationJson: JSON.stringify(value) };
}
export const presets = {
  studio: {
    name: "Studio",
    description: "Clean typography, pink-to-coral accents and dark cards.",
    accent: "#ec008c",
  },
  editorial: {
    name: "Editorial",
    description: "Expressive serif headlines and warm ink.",
    accent: "#914d3f",
  },
  botanical: {
    name: "Botanical",
    description: "Calm green, spacious type and framed cards.",
    accent: "#28604b",
  },
} as const;
export type StylePreset = keyof typeof presets;
