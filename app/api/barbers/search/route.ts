import { NextRequest, NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { searchBarbersAndShopsPayload } from "@/lib/booking/platform-service";

export async function GET(request: NextRequest) {
  const context = await getClientExperienceContext();
  const payload = await searchBarbersAndShopsPayload({
    query: request.nextUrl.searchParams.get("q") ?? undefined,
    category: request.nextUrl.searchParams.get("category") ?? undefined,
    clientId: context.clientId || undefined
  });

  return NextResponse.json(payload);
}
