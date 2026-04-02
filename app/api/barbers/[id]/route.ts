import { NextResponse } from "next/server";
import { getBarberDetailsPayload } from "@/lib/booking/platform-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await getBarberDetailsPayload(id);

  if (!payload) {
    return NextResponse.json({ error: "Barber profile not found." }, { status: 404 });
  }

  return NextResponse.json(payload);
}
