// Countries where Stripe supports merchant accounts with card payments. A new
// connected account must declare its country before requesting capabilities.
export const STRIPE_COUNTRIES = [
  "US",
  "CA",
  "GB",
  "IE",
  "AU",
  "NZ",
  "SG",
  "HK",
  "JP",
  "AE",
  "MX",
  "BR",
  "MY",
  "TH",
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GI",
  "GR",
  "HU",
  "IT",
  "LV",
  "LI",
  "LT",
  "LU",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
] as const;
export type StripeCountry = (typeof STRIPE_COUNTRIES)[number];
export function guessStripeCountry(): StripeCountry {
  if (typeof navigator === "undefined") return "US";
  for (const tag of navigator.languages || [navigator.language]) {
    const region = tag.split("-")[1]?.toUpperCase();
    if (region && (STRIPE_COUNTRIES as readonly string[]).includes(region))
      return region as StripeCountry;
  }
  return "US";
}
