import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";

const schema = z.object({
  weeklySchedule: z.string().trim().min(2),
  acceptsSameDay: z.boolean().optional().default(true),
  serviceMode: z.string().trim().min(2)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Availability details are required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "barber", "barber_availability", parsed.data);
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: "/onboarding/barber/verification"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

