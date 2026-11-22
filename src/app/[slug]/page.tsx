import type { Metadata } from "next";
import CustomSiteHost from "@/components/custom-site-host";
import { commerceData, parseCustomSite } from "@/lib/custom-site";
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
import { requestOrigin } from "@/lib/request-origin";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const store = await getStore(await getEnv(), (await params).slug);
    if (store.publicationState !== "published")
      return { robots: { index: false, follow: false } };
    return {
      title: store.name,
      description: store.bio || `Digital resources from ${store.name}`,
      openGraph: { title: store.name, description: store.bio },
    };
  } catch {
    return {};
  }
}
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
  const site = parseCustomSite(store.customSiteJson);
  if (site)
    return (
      <CustomSiteHost
        site={site}
        data={commerceData(store, list, await requestOrigin(env))}
        preview={ownPreview}
      />
    );
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
      trackingEnabled={!!store.trackingEnabled}
      products={list.map(forPublicProduct)}
      preview={(await searchParams).preview === "1"}
    />
  );
}
