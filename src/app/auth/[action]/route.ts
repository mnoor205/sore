import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { AppError, hash, rateLimit } from "@/lib/security";
import {
  beginEmailLogin,
  completeEmailLogin,
  LOGIN_COOKIE,
  SESSION_COOKIE,
} from "@/lib/email-auth";

export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  try {
    const env = await getEnv();
    const { action } = await context.params;
    if (!["start", "verify"].includes(action))
      throw new AppError("Not found", 404);
    const canonical = new URL(env.APP_URL).origin;
    if (env.AUTH_PROVIDER === "email") {
      if (action === "verify")
        throw new AppError("Please sign in with your email again.", 410);
      const target = new URL("/sign-in", canonical);
      const next = req.nextUrl.searchParams.get("next");
      if (next) target.searchParams.set("redirect_url", next);
      return NextResponse.redirect(target);
    }
    // The public hostname is configured by Workers routing (workers.dev is
    // disabled). OpenNext's internal Node URL/Host can be a loopback address;
    // use APP_URL for redirects and signed login state, never request headers.
    await rateLimit(
      env,
      "email-auth:" +
        (await hash(req.headers.get("cf-connecting-ip") || "local")),
      30,
    );
    if (action === "start") {
      const started = await beginEmailLogin(
        env,
        req.nextUrl.searchParams.get("next"),
      );
      const response = NextResponse.redirect(started.url);
      response.headers.set("Cache-Control", "no-store");
      response.cookies.set(LOGIN_COOKIE, started.state, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
      return response;
    }
    const finished = await completeEmailLogin(env, {
      stateCookie: req.cookies.get(LOGIN_COOKIE)?.value || "",
      nonce: req.nextUrl.searchParams.get("state") || "",
      assertion: req.headers.get("cf-access-jwt-assertion") || "",
    });
    const response = NextResponse.redirect(
      new URL(finished.returnTo, canonical),
    );
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(LOGIN_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(SESSION_COOKIE, finished.session, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(finished.expiresAt),
    });
    return response;
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Unable to complete sign-in. Please try again.";
    return NextResponse.json(
      { error: message, signIn: "/sign-in" },
      {
        status: error instanceof AppError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
