import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./internal.css";
export const metadata: Metadata = {
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
