import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";
import { publishBarberMarketplaceReadiness } from "@/lib/marketplace/publishing";
import { syncOnboardingBarberService } from "@/lib/marketplace/service-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  primaryServices: z.string().trim().min(2),
  startingPrice: z.string().trim().min(1),
  averageDuration: z.string().trim().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Service onboarding details are required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "barber", "barber_services", parsed.data);
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      const syncResult = await syncOnboardingBarberService(supabase, {
        userId: user.id,
        profileData: parsed.data
      });
      if ("barberReference" in syncResult && syncResult.barberReference) {
        await publishBarberMarketplaceReadiness(supabase, syncResult.barberReference);
      }
    }

    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: "/onboarding/barber/availability"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}
