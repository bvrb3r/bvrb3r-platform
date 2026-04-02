import { NextResponse } from "next/server";
import { getBarberDashboardPayload } from "@/lib/booking/platform-service";
import { getSessionUser, toBarberViewer } from "@/lib/booking/route-auth";

export async function GET() {
  const user = await getSessionUser();
  const viewer = toBarberViewer(user);
  if (!viewer) {
    return NextResponse.json({ error: "Only barbers can access the barber dashboard." }, { status: 403 });
  }

  const payload = await getBarberDashboardPayload(viewer);
  return NextResponse.json(payload);
}
