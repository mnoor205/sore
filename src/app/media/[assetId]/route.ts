import { getEnv } from "@/lib/env";
import { publicImageResponse } from "@/lib/media";
import { AppError } from "@/lib/security";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    return await publicImageResponse(await getEnv(), (await params).assetId);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return new Response("Image unavailable", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  }
}
