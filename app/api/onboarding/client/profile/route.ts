import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete, resolvePostAuthDestination } from "@/lib/onboarding/service";

const schema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  city: z.string().trim().min(2)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Client profile details are required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "client", "client_profile", parsed.data);
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: result.state.status === "completed" ? await resolvePostAuthDestination(user) : "/onboarding/client/preferences"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

