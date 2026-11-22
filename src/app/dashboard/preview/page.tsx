import { notFound, redirect } from "next/navigation";
import { asc, eq, and } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { creator } from "@/lib/auth";
import { database } from "@/lib/db";
import { products } from "@/lib/schema";
import { publicProduct } from "@/lib/catalog";
import { presentation } from "@/lib/presentation";
import { theme } from "@/lib/storefront-theme";
import { draftView } from "@/lib/storefront-draft";
import Storefront from "@/components/storefront";
import PreviewBridge from "@/components/preview-bridge";
export const dynamic = "force-dynamic";
// Private creator preview of the real storefront renderer.
// source=live (default): what buyers see now.
// source=ai: live content with the unpublished AI draft applied on top.
// source=manual: live content; the manual editor streams unsaved form values in
// over postMessage, so it never shows the AI draft.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; source?: string }>;
}) {
  const env = await getEnv();
  let store;
  try {
    store = await creator(env);
  } catch {
    redirect("/sign-in");
  }
  const params = await searchParams,
    selected = params.product,
    source =
      params.source === "ai" || params.source === "manual"
        ? params.source
        : "live";
  const rows = await database(env)
    .select(publicProduct)
    .from(products)
    .where(
      and(
        eq(products.storeId, store.id),
        selected ? eq(products.id, selected) : undefined,
      ),
    )
    .orderBy(asc(products.position));
  let list = selected ? rows : rows.filter((p) => p.state !== "archived");
  if (selected && !list.length) notFound();
  let profile = {
    name: store.name,
    bio: store.bio,
    accent: store.accent,
    stylePreset: store.stylePreset,
    theme: theme(store.themeJson),
  };
  if (source === "ai") {
    const { effective } = await draftView(env, store);
    profile = { ...effective.store };
    list = list
      .map((p) => {
        const d = effective.products[p.id];
        if (!d) return p;
        return {
          ...p,
          title: d.title,
          description: d.description,
          buttonLabel: d.buttonLabel,
          position: d.position,
          presentationJson: JSON.stringify({
            ...presentation(p.presentationJson),
            audience: d.audience,
            includedItems: d.includedItems,
            faqs: d.faqs,
            sectionOrder: d.sectionOrder,
            hiddenSections: d.hiddenSections,
          }),
        };
      })
      .sort((a, b) => a.position - b.position);
  }
  const props = {
    store: {
      ...profile,
      slug: store.slug,
      photo: store.photo,
      currency: store.currency,
      supportEmail: store.supportEmail,
      socials: JSON.parse(store.socials),
      demo: !!store.demo,
    },
    products: list,
    selectedId: selected,
    preview: true,
    privatePreview: true,
    previewSource: source,
  } as const;
  return source === "manual" ? (
    <PreviewBridge {...props} />
  ) : (
    <Storefront {...props} />
  );
}
