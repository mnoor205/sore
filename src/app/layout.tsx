import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sore — Your expertise, beautifully shared",
  description: "A simple storefront for your resources, templates and ideas.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
