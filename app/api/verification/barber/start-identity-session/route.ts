import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  startBarberIdentityVerificationSession,
  VerificationFlowError
} from "@/lib/trust/verification-service";
import { VerificationProviderSyncError } from "@/lib/trust/provider-sync";

function toErrorResponse(error: unknown) {
  if (error instanceof VerificationFlowError || error instanceof VerificationProviderSyncError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to start Stripe Identity verification.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST() {
  try {
    const user = await getSessionUser();
    const payload = await startBarberIdentityVerificationSession(user);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
