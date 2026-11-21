import { redirect } from "next/navigation";
import GuidedSetup from "@/components/guided-setup";
import { StartLifetimeCheckout } from "@/components/lifetime-checkout";
import { signedInDestination } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { lifetimeCheckoutPath } from "@/lib/lifetime-checkout";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  if ((await searchParams).checkout !== "lifetime") return <GuidedSetup />;
  const env = await getEnv();
  const destination = await signedInDestination(env);
  if (!destination)
    redirect(
      "/sign-up?redirect_url=" +
        encodeURIComponent(new URL(lifetimeCheckoutPath, env.APP_URL).href),
    );
  if (destination === "/onboarding") return <GuidedSetup lifetimeCheckout />;
  return <StartLifetimeCheckout />;
}
