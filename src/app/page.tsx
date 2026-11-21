import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { signedInDestination } from "@/lib/auth";
import { getFoundingOffer } from "@/lib/founding-offer";
import MarketingPage from "@/components/marketing-page";
import "./marketing.css";
export const dynamic = "force-dynamic";
export default async function Home() {
  const env = await getEnv();
  const destination = await signedInDestination(env);
  if (destination) redirect(destination);
  return (
    <MarketingPage
      offer={await getFoundingOffer(env)}
      mcpUrl={`${env.MCP_URL.replace(/\/$/, "")}/mcp`}
    />
  );
}
