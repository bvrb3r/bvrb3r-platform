import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete, resolvePostAuthDestination } from "@/lib/onboarding/service";

const schema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  city: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/),
  usernameAvailabilityConfirmed: z.literal(true),
  trustRulesAccepted: z.literal(true)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Client profile requires name, email, phone, city, an available BVRB3R name, and trust rules acceptance." }, { status: 400 });
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

