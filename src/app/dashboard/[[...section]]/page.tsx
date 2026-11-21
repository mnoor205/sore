import Dashboard from "@/components/dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  return <Dashboard section={(await params).section?.[0] || "overview"} />;
}
