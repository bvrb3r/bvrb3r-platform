import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { FintechServiceError, refreshStripeConnectSubjectAccount } from "@/lib/fintech/service";
import { publishBarberMarketplaceReadiness, publishShopMarketplaceReadiness } from "@/lib/marketplace/publishing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const connectSubjectSchema = z.object({
  shopId: z.string().trim().optional().nullable()
});

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to refresh the Stripe readiness state.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const parsed = connectSubjectSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Stripe sync payload." }, { status: 400 });
    }

    const payload = await refreshStripeConnectSubjectAccount(user, parsed.data);
    const supabase = createSupabaseAdminClient();
    if (supabase && user.barberId) {
      await publishBarberMarketplaceReadiness(supabase, user.barberId);
    }
    if (parsed.data.shopId ?? user.ownedShopId) {
      publishShopMarketplaceReadiness({ shopId: parsed.data.shopId ?? user.ownedShopId });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
