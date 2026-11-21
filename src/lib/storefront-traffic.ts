// The beacon sends only one of these categories, never a referring URL.
export const sources = [
  "Direct / unknown",
  "Storefront",
  "Google",
  "Bing",
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Other referral",
] as const;
export function trafficSource(
  referrer: string,
  origin: string,
): (typeof sources)[number] {
  if (!referrer) return "Direct / unknown";
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return "Storefront";
    const host = url.hostname;
    if (/(^|\.)google\.(com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(host))
      return "Google";
    const platforms = [
      ["bing.com", "Bing"],
      ["instagram.com", "Instagram"],
      ["facebook.com", "Facebook"],
      ["tiktok.com", "TikTok"],
      ["youtube.com", "YouTube"],
      ["linkedin.com", "LinkedIn"],
    ] as const;
    return (
      platforms.find(
        ([domain]) => host === domain || host.endsWith("." + domain),
      )?.[1] || "Other referral"
    );
  } catch {
    return "Direct / unknown";
  }
}
