import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const parts = (await params).section,
    section = parts?.[0] || "overview";
  // The Stripe account page became the main Payments page.
  if (section === "stripe") redirect("/dashboard/payments");
  return <Dashboard section={section} subsection={parts?.[1]} />;
}
