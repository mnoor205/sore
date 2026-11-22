import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
// The AI binding only runs remotely. Keep `next dev`/`next build` offline unless a
// developer opts in with SORE_REMOTE_AI=1 after `wrangler login`.
initOpenNextCloudflareForDev({
  remoteBindings: process.env.SORE_REMOTE_AI === "1",
});
const config: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  async redirects() {
    return ["www.getsore.me", "coachlane.getsore.me"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://getsore.me/:path*",
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Custom storefront code runs in a sandboxed srcdoc iframe. The sandbox
          // and the document's own CSP can't stop that frame from navigating
          // itself, so the embedding page forbids loading any off-site page into
          // a frame. Otherwise a merchant site could swap in an external phishing
          // page, or send what a buyer typed out in the URL.
          { key: "Content-Security-Policy", value: "frame-src 'self'" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/media/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'" },
        ],
      },
    ];
  },
};
export default config;
