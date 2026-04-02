import { NextResponse } from "next/server";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";

export async function POST() {
  try {
    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "shop_owner", "owner_verification", {});
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: "/activation-status"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}
