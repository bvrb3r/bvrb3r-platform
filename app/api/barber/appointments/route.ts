import { NextResponse } from "next/server";
import { getBarberAppointmentsPayload } from "@/lib/booking/platform-service";
import { getSessionUser, toBarberViewer } from "@/lib/booking/route-auth";

export async function GET() {
  const user = await getSessionUser();
  const viewer = toBarberViewer(user);
  if (!viewer) {
    return NextResponse.json({ error: "Only barbers can access barber appointments." }, { status: 403 });
  }

  const payload = await getBarberAppointmentsPayload(viewer);
  return NextResponse.json(payload);
}
