import { notFound, redirect } from "next/navigation";
import { asc, eq, and } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { creator } from "@/lib/auth";
import { database } from "@/lib/db";
import { products } from "@/lib/schema";
import { publicProduct } from "@/lib/catalog";
import Storefront from "@/components/storefront";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const env = await getEnv();
  let store;
  try {
    store = await creator(env);
  } catch {
    redirect("/sign-in");
  }
  const selected = (await searchParams).product;
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
  const list = selected ? rows : rows.filter((p) => p.state !== "archived");
  if (selected && !list.length) notFound();
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
      }}
      products={list}
      selectedId={selected}
      preview
      privatePreview
    />
  );
}
