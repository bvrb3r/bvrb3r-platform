import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { initializeSelectedUserLane, resolvePostAuthDestination } from "@/lib/onboarding/service";

const schema = z.object({
  barberSubtype: z.enum(["freelance", "commission", "blueprint"])
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "A barber subtype is required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await initializeSelectedUserLane(user, {
      role: "barber",
      barberSubtype: parsed.data.barberSubtype
    });
    const nextPath = await resolvePostAuthDestination(result.user);

    return NextResponse.json({
      lane: result.state,
      degraded: result.degraded,
      nextPath
    }, { status: 201 });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}
