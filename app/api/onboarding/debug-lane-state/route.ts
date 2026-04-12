import { NextResponse } from "next/server";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { getLaneLaunchDebugState } from "@/lib/onboarding/service";

export async function GET() {
  try {
    console.info("[onboarding-route] debug lane state requested");
    const user = await getOnboardingSessionUser();
    const state = await getLaneLaunchDebugState(user);
    console.info("[onboarding-route] debug lane state resolved", state);

    return NextResponse.json(state, {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate"
      }
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}
