import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const section = (await params).section?.[0] || "overview";
  // The Stripe account page became the main Payments page.
  if (section === "stripe") redirect("/dashboard/payments");
  return <Dashboard section={section} />;
}
