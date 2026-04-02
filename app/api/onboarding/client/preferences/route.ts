import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";

const schema = z.object({
  preferredServices: z.string().trim().optional().default(""),
  bookingCadence: z.string().trim().optional().default(""),
  notifications: z.string().trim().optional().default("")
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Client preferences are required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "client", "client_preferences", parsed.data);
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: "/dashboard/client"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

