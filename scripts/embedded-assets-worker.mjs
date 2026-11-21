// Deployment adapter for connectors that cannot set the short-lived Assets
// upload JWT. Only build-time PUBLIC assets belong in assets.js. Purchased
// deliverables always remain in the separately bound private R2 bucket.
import app from "./app.js";
import assets from "./assets.js";
export * from "./app.js";

async function assetResponse(input, init) {
  const request = input instanceof Request ? input : new Request(input, init);
  const asset = assets[new URL(request.url).pathname];
  if (!asset) return new Response("Not found", { status: 404 });
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", { status: 405 });
  const headers = {
    "Content-Type": asset.type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": new URL(request.url).pathname.startsWith("/_next/static/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
    ETag: '"' + asset.hash + '"',
  };
  if (request.headers.get("if-none-match") === headers.ETag)
    return new Response(null, { status: 304, headers });
  return new Response(
    request.method === "HEAD"
      ? null
      : Uint8Array.from(atob(asset.data), (character) =>
          character.charCodeAt(0),
        ),
    { headers },
  );
}

export default {
  ...app,
  async fetch(request, env, ctx) {
    if (assets[new URL(request.url).pathname]) return assetResponse(request);
    return app.fetch(
      request,
      { ...env, ASSETS: { fetch: assetResponse } },
      ctx,
    );
  },
};
