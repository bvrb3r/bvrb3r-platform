import { NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { getClientBookingsPayload } from "@/lib/booking/platform-service";

export async function GET() {
  const context = await getClientExperienceContext();

  if (!context.clientId) {
    return NextResponse.json({ error: "No client context is available for client bookings." }, { status: 403 });
  }

  const payload = await getClientBookingsPayload(context.clientId);
  return NextResponse.json(payload);
}
