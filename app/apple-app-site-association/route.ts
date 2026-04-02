import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/lib/mobile/association";

export async function GET() {
  return NextResponse.json(buildAppleAppSiteAssociation(), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
    }
  });
}
