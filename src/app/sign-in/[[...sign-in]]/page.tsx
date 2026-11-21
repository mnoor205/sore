import AuthScreen from "@/components/auth-screen";
import { development, getEnv } from "@/lib/env";
import { accessConfigured } from "@/lib/email-auth";
import { brandedEmailConfigured } from "@/lib/branded-email-auth";
import { redirect } from "next/navigation";
import { signedInDestination } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const env = await getEnv();
  const query = await searchParams;
  const destination = await signedInDestination(
    env,
    typeof query.redirect_url === "string" ? query.redirect_url : undefined,
  );
  if (destination) redirect(destination);
  return (
    <AuthScreen
      developmentMode={development(env)}
      accessReady={
        env.AUTH_PROVIDER === "email"
          ? brandedEmailConfigured(env)
          : accessConfigured(env)
      }
      brandedEmail={env.AUTH_PROVIDER === "email"}
      loginUrl={env.APP_URL + "/auth/start?next=%2Fdashboard"}
    />
  );
}
