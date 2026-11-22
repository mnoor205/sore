import { forPublicProduct } from "@/lib/presentation";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { identity } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { database } from "@/lib/db";
import { products } from "@/lib/schema";
import { getStore, publicProduct } from "@/lib/catalog";
import Storefront from "@/components/storefront";
import { theme } from "@/lib/storefront-theme";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const env = await getEnv(),
    { slug } = await params;
  let store;
  try {
    store = await getStore(env, slug);
  } catch {
    notFound();
  }
  let ownPreview = false;
  if ((await searchParams).preview === "1") {
    try {
      ownPreview = (await identity(env)) === store.ownerId;
    } catch {}
  }
  if (store.publicationState !== "published" && !ownPreview) notFound();
  const list = await database(env)
    .select(publicProduct)
    .from(products)
    .where(and(eq(products.storeId, store.id), eq(products.state, "published")))
    .orderBy(asc(products.position));
  return (
    <Storefront
      store={{
        name: store.name,
        slug: store.slug,
        bio: store.bio,
        photo: store.photo,
        accent: store.accent,
        currency: store.currency,
        supportEmail: store.supportEmail,
        socials: JSON.parse(store.socials),
        demo: !!store.demo,
        stylePreset: store.stylePreset,
        theme: theme(store.themeJson),
      }}
      products={list.map(forPublicProduct)}
      preview={(await searchParams).preview === "1"}
    />
  );
}
