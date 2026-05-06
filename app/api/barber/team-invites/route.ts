import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  ShopTeamInviteServiceError,
  listBarberTeamInvites,
  respondToBarberTeamInvite
} from "@/lib/operations/shop-team-invites";
import { publishBarberMarketplaceReadiness, publishShopMarketplaceReadiness } from "@/lib/marketplace/publishing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const responseSchema = z.object({
  inviteId: z.string().trim().min(1),
  status: z.enum(["accepted", "declined"])
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ShopTeamInviteServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await listBarberTeamInvites(user);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load shop invitations.");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = responseSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid shop invitation response." }, { status: 400 });
    }

    const payload = await respondToBarberTeamInvite(user, parsed.data);
    if (parsed.data.status === "accepted") {
      const supabase = createSupabaseAdminClient();
      if (supabase && payload.invite.barberId) {
        await publishBarberMarketplaceReadiness(supabase, payload.invite.barberId);
      }
      publishShopMarketplaceReadiness({ shopId: payload.invite.shopId });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to update the shop invitation.");
  }
}
