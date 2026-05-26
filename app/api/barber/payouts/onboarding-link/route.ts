import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { createStripeConnectOnboardingSession, FintechServiceError } from "@/lib/fintech/service";

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to create the barber payout setup link.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST() {
  try {
    const user = await getSessionUser();
    const payload = await createStripeConnectOnboardingSession(user, { subjectType: "barber" });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
