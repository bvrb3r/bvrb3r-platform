import { NextRequest, NextResponse } from "next/server";
import { getBarberAvailabilityPayload } from "@/lib/booking/platform-service";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await getBarberAvailabilityPayload(id, {
    serviceId: request.nextUrl.searchParams.get("serviceId") ?? undefined,
    locationId: request.nextUrl.searchParams.get("locationId") ?? undefined,
    days: request.nextUrl.searchParams.get("days") ? Number(request.nextUrl.searchParams.get("days")) : undefined,
    startDate: request.nextUrl.searchParams.get("startDate") ?? undefined
  });

  return NextResponse.json(payload);
}
