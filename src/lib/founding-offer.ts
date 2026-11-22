import { limits, type AppEnv } from "./env";
import { lifetimeLadder } from "./lifetime-links";

export type FoundingOffer = {
  quote: {
    price: number;
    /** Purchases left before the price rises. */
    remaining: number;
    nextPrice: number | null;
    every: number;
    step: number;
  } | null;
  checkoutAvailable: boolean;
  quotas: { products: number; uploadMB: number; storageMB: number };
};

// The quote comes from Stripe's own completed-checkout count on the current
// tier's payment link: the same count that retires the link at its cap.
// Refunds do not rewind it.
export async function getFoundingOffer(env: AppEnv): Promise<FoundingOffer> {
  const quotas = limits(env);
  let quote: FoundingOffer["quote"] = null;
  let checkoutAvailable = false;
  try {
    const ladder = await lifetimeLadder(env);
    if (ladder.price !== null)
      quote = {
        price: ladder.price / 100,
        remaining: ladder.leftAtPrice,
        nextPrice: ladder.nextPrice === null ? null : ladder.nextPrice / 100,
        every: ladder.every,
        step: ladder.step / 100,
      };
    checkoutAvailable = ladder.available;
  } catch (error) {
    // An unreachable Stripe or database must never become a fictional offer.
    console.error("Founding offer unavailable", error);
  }
  return {
    quote,
    checkoutAvailable,
    quotas: {
      products: quotas.products,
      uploadMB: quotas.upload / 1024 / 1024,
      storageMB: quotas.storage / 1024 / 1024,
    },
  };
}
