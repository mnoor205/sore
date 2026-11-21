import { z } from "zod";
const creatorDraft = z.object({
  name: z.string().max(100).default(""),
  slug: z.string().max(40).default(""),
  bio: z.string().max(350).default(""),
  photo: z.string().max(2048).default(""),
  supportEmail: z.string().max(254).default(""),
  audience: z.string().max(1000).default(""),
  whatTheySell: z.string().max(1000).default(""),
  currency: z.enum(["usd", "cad", "gbp", "eur", "aud"]).default("usd"),
});
const productDraft = z.object({
  title: z.string().max(140).default(""),
  description: z.string().max(5000).default(""),
  image: z.string().max(2048).default(""),
  buttonLabel: z.string().max(50).default("Get the resource"),
  isPaid: z.boolean().default(false),
  price: z.number().int().min(0).max(10000000).default(0),
  deliveryType: z.enum(["file", "url"]).default("url"),
  deliveryUrl: z.string().max(2048).default(""),
  assetId: z.string().max(80).nullable().default(null),
});
export const setupContentSchema = z.object({
  creator: creatorDraft.default(() => creatorDraft.parse({})),
  product: productDraft.default(() => productDraft.parse({})),
  appearance: z.enum(["studio", "editorial", "botanical"]).default("studio"),
});
export type SetupContent = z.infer<typeof setupContentSchema>;
