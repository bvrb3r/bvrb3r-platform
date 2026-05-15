import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { normalizeBarberSubtype } from "@/lib/auth/roles";
import { initializeSelectedUserLane, resolvePostAuthDestination } from "@/lib/onboarding/service";

const schema = z.object({
  barberSubtype: z.enum(["freelance", "commission", "booth_rent", "blueprint"]).transform(normalizeBarberSubtype)
});

export async function POST(request: NextRequest) {
  try {
    console.info("[onboarding-route] barber subtype route entry");
    const body = await request.json().catch(() => ({}));
    console.info("[onboarding-route] barber subtype request body", {
      body
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.info("[onboarding-route] barber subtype validation failed", {
        issues: parsed.error.issues
      });
      return NextResponse.json({
        error: "A barber subtype is required.",
        issues: parsed.error.issues
      }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    console.info("[onboarding-route] barber subtype authenticated user", {
      userId: user.id,
      runtimeRole: user.role,
      accountStatus: user.accountStatus ?? null,
      primaryOnboardingRole: user.primaryOnboardingRole ?? null,
      onboardingState: user.onboardingState ?? null,
      barberSubtype: parsed.data.barberSubtype
    });
    const result = await initializeSelectedUserLane(user, {
      role: "barber",
      barberSubtype: parsed.data.barberSubtype
    });
    const nextPath = await resolvePostAuthDestination(result.user);
    console.info("[onboarding-route] barber subtype response", {
      userId: user.id,
      lane: result.state,
      degraded: result.degraded,
      nextPath
    });

    return NextResponse.json({
      lane: result.state,
      degraded: result.degraded,
      nextPath
    }, { status: 201 });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}
