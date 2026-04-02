import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { commitPointsRedemption, getPointsScopeForUser } from "@/lib/points/engine";

const redeemSchema = z.object({
  purpose: z.enum(["booking_discount", "subscription_credit", "campaign_credit"]),
  requestedPoints: z.number().int().positive(),
  orderTotal: z.number().min(0),
  sourceId: z.string().min(1),
  locationId: z.string().min(1).optional()
});

function isPurposeAllowed(role: "client" | "barber" | "owner", purpose: "booking_discount" | "subscription_credit" | "campaign_credit") {
  if (role === "client") {
    return purpose === "booking_discount";
  }

  if (role === "barber") {
    return purpose === "subscription_credit";
  }

  return purpose === "campaign_credit" || purpose === "subscription_credit";
}

export async function POST(request: Request) {
  const { user } = await getCurrentUserFromServer();
  const scope = getPointsScopeForUser(user);

  if (!scope) {
    return NextResponse.json({ error: "This account does not have BVR Points access." }, { status: 403 });
  }

  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid BVR Points redemption payload." }, { status: 400 });
  }

  if (!isPurposeAllowed(scope.role, parsed.data.purpose)) {
    return NextResponse.json({ error: "This role cannot redeem BVR Points for that purpose." }, { status: 403 });
  }

  try {
    const redemption = await commitPointsRedemption({
      userId: scope.userId,
      role: scope.role,
      purpose: parsed.data.purpose,
      requestedPoints: parsed.data.requestedPoints,
      orderTotal: parsed.data.orderTotal,
      sourceId: parsed.data.sourceId,
      locationId: parsed.data.locationId,
      metadata: {
        requestedBy: user.email
      }
    });
    return NextResponse.json({ redemption });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to redeem BVR Points.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
