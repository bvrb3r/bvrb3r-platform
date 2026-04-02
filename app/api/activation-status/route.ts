import { NextResponse } from "next/server";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { getActivationStatusForUser } from "@/lib/onboarding/service";

export async function GET() {
  try {
    const user = await getOnboardingSessionUser();
    const payload = await getActivationStatusForUser(user);
    return NextResponse.json(payload);
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

