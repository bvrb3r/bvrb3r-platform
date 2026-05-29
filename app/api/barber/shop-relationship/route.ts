import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  ShopTeamInviteServiceError,
  endBarberShopRelationship
} from "@/lib/operations/shop-team-invites";

const leaveSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ShopTeamInviteServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = leaveSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid shop relationship leave payload." }, { status: 400 });
    }

    const payload = await endBarberShopRelationship(user, {
      actor: "barber",
      reason: parsed.data.reason
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to leave the shop relationship.");
  }
}
