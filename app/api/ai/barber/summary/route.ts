import { NextResponse } from "next/server";
import { AiLayerServiceError, getBarberAiSummary } from "@/lib/ai/service";
import { getSessionUser } from "@/lib/booking/route-auth";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!(user.role === "commission_barber" || user.role === "booth_rent_barber") || !user.barberId) {
      return NextResponse.json({ error: "Only barbers can read barber AI summary." }, { status: 403 });
    }

    const payload = await getBarberAiSummary({ user });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AiLayerServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Unable to load barber AI summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
