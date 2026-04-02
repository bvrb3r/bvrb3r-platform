import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";

const schema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  city: z.string().trim().min(2),
  professionalType: z.string().trim().min(2),
  yearsExperience: z.string().trim().min(1),
  bio: z.string().trim().min(8),
  compensationModel: z.enum(["commission", "booth_rent"]).default("booth_rent")
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Barber profile details are required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "barber", "barber_profile", parsed.data);
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: "/onboarding/barber/services"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

