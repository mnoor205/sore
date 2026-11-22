import { limits, type AppEnv } from "./env";

export function foundingPrice(completedPurchases: number) {
  if (!Number.isSafeInteger(completedPurchases) || completedPurchases < 0)
    throw new Error("Invalid completed lifetime purchase count");
  const tier = Math.floor(completedPurchases / 5);
  return {
    completedPurchases,
    price: 99 + 10 * tier,
    remaining: 5 - (completedPurchases % 5),
    nextPrice: 109 + 10 * tier,
  };
}
export type FoundingOffer = {
  quote: ReturnType<typeof foundingPrice> | null;
  quotas: { products: number; uploadMB: number; storageMB: number };
};

// Only verified paid billing sessions count. Pending/failed checkouts and demo
// stores do not create scarcity. Refunds do not rewind completed purchases.
export async function getFoundingOffer(env: AppEnv): Promise<FoundingOffer> {
  const quotas = limits(env);
  let quote: FoundingOffer["quote"] = null;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(DISTINCT b.session_id) AS completed FROM billing_sessions b JOIN stores s ON s.id=b.store_id WHERE b.kind='lifetime' AND b.status='paid' AND b.session_id IS NOT NULL AND s.demo=0",
    ).first<{ completed: number }>();
    if (row) quote = foundingPrice(Number(row.completed));
  } catch {
    // An unavailable database must never become a fictional zero-purchase offer.
  }
  return {
    quote,
    quotas: {
      products: quotas.products,
      uploadMB: quotas.upload / 1024 / 1024,
      storageMB: quotas.storage / 1024 / 1024,
    },
  };
}
