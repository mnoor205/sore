import { foundingOffer, ladderConfig } from "./billing";
import { limits, type AppEnv } from "./env";

export type FoundingOffer = {
  quote: {
    price: number;
    remaining: number;
    nextPrice: number;
    every: number;
    step: number;
  } | null;
  checkoutAvailable: boolean;
  sandbox: boolean;
  quotas: { products: number; uploadMB: number; storageMB: number };
};

export async function getFoundingOffer(env: AppEnv): Promise<FoundingOffer> {
  const quotas = limits(env);
  let quote: FoundingOffer["quote"] = null;
  let checkoutAvailable = false;
  try {
    const offer = await foundingOffer(env);
    const ladder = ladderConfig(env);
    if (offer.remaining > 0)
      quote = {
        price: offer.price / 100,
        remaining: offer.leftAtPrice,
        nextPrice: offer.nextPrice / 100,
        every: ladder.every,
        step: ladder.step / 100,
      };
    checkoutAvailable = offer.available;
  } catch {
    // An unavailable database must never become a fictional zero-purchase offer.
  }
  return {
    quote,
    checkoutAvailable,
    sandbox: /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || ""),
    quotas: {
      products: quotas.products,
      uploadMB: quotas.upload / 1024 / 1024,
      storageMB: quotas.storage / 1024 / 1024,
    },
  };
}
