import { NextResponse } from "next/server";
import { getShopDashboardPayload } from "@/lib/booking/platform-service";
import { getSessionUser, toShopViewer } from "@/lib/booking/route-auth";

export async function GET() {
  const user = await getSessionUser();
  const viewer = toShopViewer(user);
  if (!viewer) {
    return NextResponse.json({ error: "Only owners and managers can access the shop dashboard." }, { status: 403 });
  }

  const payload = await getShopDashboardPayload(viewer);
  return NextResponse.json(payload);
}
