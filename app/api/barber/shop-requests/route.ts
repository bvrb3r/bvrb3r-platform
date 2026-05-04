import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  ShopTeamInviteServiceError,
  createBarberShopJoinRequest,
  listBarberJoinableShops
} from "@/lib/operations/shop-team-invites";

const createRequestSchema = z.object({
  shopId: z.string().trim().min(1),
  message: z.string().trim().max(500).optional()
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
    const payload = await listBarberJoinableShops(user, request.nextUrl.searchParams.get("q") ?? undefined);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load shop directory.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = createRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid shop join request payload." }, { status: 400 });
    }

    const invite = await createBarberShopJoinRequest(user, parsed.data);
    return NextResponse.json({ invite });
  } catch (error) {
    return toErrorResponse(error, "Unable to send shop join request.");
  }
}
