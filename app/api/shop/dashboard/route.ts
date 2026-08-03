import { NextResponse } from "next/server";
import { isShopOwnerRole } from "@/lib/auth/roles";
import { getShopDashboardPayload } from "@/lib/booking/platform-service";
import { getSessionUser, toShopViewer } from "@/lib/booking/route-auth";

export async function GET() {
  const user = await getSessionUser();
  if (isShopOwnerRole(user.role)) {
    return NextResponse.json(
      {
        error: "The legacy owner dashboard is retired. Use the shop-scoped owner operations endpoint."
      },
      { status: 410 }
    );
  }

  const viewer = toShopViewer(user);
  if (!viewer) {
    return NextResponse.json(
      { error: "Only managers can access the legacy shop dashboard." },
      { status: 403 }
    );
  }

  const payload = await getShopDashboardPayload(viewer);
  return NextResponse.json(payload);
}
