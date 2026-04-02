import { NextRequest, NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { listClientPromotions, PromotionServiceError } from "@/lib/promotions/service";

function parseAddOnIds(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("addOnIds");
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function toErrorResponse(error: unknown) {
  if (error instanceof PromotionServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load client promotions.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const context = await getClientExperienceContext();
    const shopId = request.nextUrl.searchParams.get("shopId");
    const serviceId = request.nextUrl.searchParams.get("serviceId");

    if (!shopId || !serviceId) {
      return NextResponse.json({ error: "Shop and service are required for promotion discovery." }, { status: 400 });
    }

    const payload = await listClientPromotions({
      clientId: context.clientId || undefined,
      shopId,
      serviceId,
      addOnIds: parseAddOnIds(request),
      barberId: request.nextUrl.searchParams.get("barberId") ?? undefined
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
