import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./internal.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://getsore.me"),
  applicationName: "sore",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/sore-icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/brand/sore-icon-180.png", sizes: "180x180" }],
  },
  openGraph: {
    siteName: "sore",
    images: [
      { url: "/brand/sore-social.png", width: 1200, height: 630, alt: "sore" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [{ url: "/brand/sore-social.png", alt: "sore" }],
  },
  title: "sore — Your digital product store. Connected to your AI.",
  description:
    "Sell digital downloads from one link. Connect your products and sales reporting to your AI assistant, with a founding lifetime offer starting at $99.",
};
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
