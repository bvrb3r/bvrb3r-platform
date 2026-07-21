import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  ShopTeamInviteServiceError,
  endBarberShopRelationship,
  updateOwnerTeamRelationship
} from "@/lib/operations/shop-team-invites";

const releaseSchema = z.object({
  relationshipId: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional()
});

const updateSchema = z.object({
  relationshipId: z.string().trim().min(1),
  publicTeamVisible: z.boolean().optional(),
  publicTeamOrder: z.number().int().min(0).max(999).optional(),
  featuredOnShopProfile: z.boolean().optional()
}).strict();

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
    const parsed = releaseSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid shop relationship release payload." }, { status: 400 });
    }

    const payload = await endBarberShopRelationship(user, {
      actor: "owner",
      relationshipId: parsed.data.relationshipId,
      reason: parsed.data.reason
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to release the barber from the shop.");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid shop relationship update payload." }, { status: 400 });
    }

    const payload = await updateOwnerTeamRelationship(user, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to update the shop relationship.");
  }
}
