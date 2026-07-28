import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  ShopTeamInviteServiceError,
  createOwnerTeamInvite,
  listOwnerTeamInviteDirectory,
  respondToOwnerJoinRequest
} from "@/lib/operations/shop-team-invites";

const createInviteSchema = z.object({
  barberId: z.string().trim().min(1),
  shopId: z.string().trim().min(1).optional(),
  message: z.string().trim().max(500).optional(),
  // Full Booth Rent and AutoBooth Rent are the only proposable shop-barber
  // financial models. Both require real rent terms; AutoBooth additionally
  // carries the owner-approved portion applied toward outstanding rent.
  proposal: z.union([
    z.object({
      routingModel: z.literal("booth_rent"),
      boothRentAmount: z.number().positive(),
      boothRentFrequency: z.enum(["daily", "weekly", "monthly"])
    }),
    z.object({
      routingModel: z.literal("autobooth_rent"),
      boothRentAmount: z.number().positive(),
      boothRentFrequency: z.enum(["daily", "weekly", "monthly"]),
      autoBoothPercent: z.number().gt(0).max(1)
    })
  ]).optional()
});

const ownerResponseSchema = z.object({
  inviteId: z.string().trim().min(1),
  status: z.enum(["accepted", "rejected"])
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ShopTeamInviteServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const payload = await listOwnerTeamInviteDirectory(
      user,
      request.nextUrl.searchParams.get("q") ?? undefined
    );
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load barber invite directory.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = createInviteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid barber invite payload." }, { status: 400 });
    }

    const invite = await createOwnerTeamInvite(user, parsed.data);
    return NextResponse.json({ invite });
  } catch (error) {
    return toErrorResponse(error, "Unable to create the barber invitation.");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = ownerResponseSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid shop join request response." }, { status: 400 });
    }

    const payload = await respondToOwnerJoinRequest(user, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to update the shop join request.");
  }
}
