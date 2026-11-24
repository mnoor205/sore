import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { creator } from "@/lib/auth";
import { lifetimeCheckoutUrl } from "@/lib/lifetime-links";
export const dynamic = "force-dynamic";

// Homepage "Get lifetime access" buttons land here and are sent to the Stripe
// Payment Link for the current price tier. Resolving the tier at click time
// (instead of baking a link into the page) means nobody is sent to a tier that
// sold out while the page was open.
export async function GET() {
  const env = await getEnv();
  let storeId: string | undefined;
  try {
    storeId = (await creator(env)).id;
  } catch {
    // Signed-out buyers are matched to their account by checkout email.
  }
  try {
    return NextResponse.redirect(await lifetimeCheckoutUrl(env, storeId), 303);
  } catch (error) {
    console.error("Lifetime checkout unavailable", error);
    return NextResponse.redirect(`${env.APP_URL}/#lifetime`, 303);
  }
}
