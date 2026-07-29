import { NextResponse } from "next/server";
import { isShopOwnerRole } from "@/lib/auth/roles";
import { getShopDashboardPayload } from "@/lib/booking/platform-service";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  buildOwnerOperationsPayload,
  findForbiddenOwnerOperationsKeys,
  resolveOwnerOperationsShopId
} from "@/lib/owner-operations/domain";
import {
  OwnerOperationsServiceError,
  readOwnerOperationsControlState
} from "@/lib/owner-operations/service";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!isShopOwnerRole(user.role)) {
    return NextResponse.json(
      { error: "Only a shop owner can access owner operations." },
      { status: 403 }
    );
  }

  const requestedShopId = new URL(request.url).searchParams.get("shopId");
  const shopId = resolveOwnerOperationsShopId(user, requestedShopId);
  if (!shopId) {
    return NextResponse.json(
      {
        error: requestedShopId
          ? "That shop is outside your owner scope."
          : "Choose one shop before opening owner operations."
      },
      { status: requestedShopId ? 403 : 400 }
    );
  }

  let dashboard;
  let controls;
  try {
    [dashboard, controls] = await Promise.all([
      getShopDashboardPayload({
        role: "owner",
        locationIds: [shopId],
        email: user.email
      }),
      readOwnerOperationsControlState(user, shopId)
    ]);
  } catch (error) {
    if (error instanceof OwnerOperationsServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
  const payload = buildOwnerOperationsPayload({ shopId, dashboard, controls });
  const forbidden = findForbiddenOwnerOperationsKeys(payload);
  if (forbidden.length > 0) {
    console.error("[owner-operations] privacy projection rejected", {
      shopId,
      paths: forbidden
    });
    return NextResponse.json(
      { error: "Owner operations is temporarily unavailable." },
      { status: 503 }
    );
  }

  return NextResponse.json(payload);
}
