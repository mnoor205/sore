export const PUBLIC_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export function siteImageUrl(
  value: string | undefined,
  origin: string,
): string {
  if (!value || !origin) return "";
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.search || url.hash)
      return "";
    const match = /^\/(?:api\/media|media)\/([a-zA-Z0-9-]+)$/.exec(
      url.pathname,
    );
    return match ? `${url.origin}/media/${match[1]}` : "";
  } catch {
    return "";
  }
}
