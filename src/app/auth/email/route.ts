import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/security";
import {
  requestEmailCode,
  completeEmailCode,
  OTP_COOKIE,
} from "@/lib/branded-email-auth";
import { SESSION_COOKIE } from "@/lib/email-auth";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const env = await getEnv();
    if (req.headers.get("origin") !== new URL(env.APP_URL).origin)
      throw new AppError("Cross-origin request denied", 403);
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError("Use JSON", 415);
    const reader = req.body?.getReader();
    if (!reader) throw new AppError("Missing request", 400);
    let raw = "",
      size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new AppError("Request too large", 413);
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    const data = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("request"),
          email: z.string().max(320),
          returnTo: z.string().max(4096).optional(),
        }),
        z.object({ action: z.literal("verify"), code: z.string().max(100) }),
      ])
      .parse(JSON.parse(raw));
    const ip = req.headers.get("cf-connecting-ip") || "local";
    const options = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    };
    if (data.action === "request") {
      const result = await requestEmailCode(env, {
        email: data.email,
        returnTo: data.returnTo,
        ip,
      });
      const response = NextResponse.json(
        { sent: true },
        { headers: { "Cache-Control": "no-store" } },
      );
      response.cookies.set(OTP_COOKIE, result.state, {
        ...options,
        maxAge: 600,
      });
      return response;
    }
    const result = await completeEmailCode(
      env,
      req.cookies.get(OTP_COOKIE)?.value || "",
      data.code,
      ip,
    );
    const response = NextResponse.json(
      { url: new URL(result.returnTo, env.APP_URL).href },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE, result.session, {
      ...options,
      expires: new Date(result.expiresAt),
      maxAge: Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000)),
    });
    response.cookies.set(OTP_COOKIE, "", { ...options, maxAge: 0 });
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : e instanceof z.ZodError || e instanceof SyntaxError
              ? "Check your email address and try again."
              : "Unable to sign in. Please try again.",
      },
      {
        status:
          e instanceof AppError
            ? e.status
            : e instanceof z.ZodError || e instanceof SyntaxError
              ? 400
              : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
