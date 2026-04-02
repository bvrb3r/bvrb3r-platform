import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberToolsServiceError, getBarberEarningsPayload } from "@/lib/barber/service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await getBarberEarningsPayload(user);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof BarberToolsServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Unable to load barber earnings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
