import { NextResponse } from "next/server";
import { buildAndroidAssetLinks } from "@/lib/mobile/association";

export async function GET() {
  return NextResponse.json(buildAndroidAssetLinks(), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
    }
  });
}
