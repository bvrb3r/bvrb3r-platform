import { NextResponse } from "next/server";
import { ensureBarberProfileForIdentifier } from "@/lib/barber/profile-repair";
import { getBarberDetailsPayload } from "@/lib/booking/platform-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repair = await ensureBarberProfileForIdentifier(id).catch((error) => {
    console.error("[barbers-api] canonical barber profile repair failed", {
      id,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  });
  const payload = await getBarberDetailsPayload(id);

  if (!payload) {
    return NextResponse.json({ error: "Barber profile not found." }, { status: 404 });
  }

  return NextResponse.json(repair?.repaired ? { ...payload, profileRepairNotice: repair.message } : payload);
}
