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
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
