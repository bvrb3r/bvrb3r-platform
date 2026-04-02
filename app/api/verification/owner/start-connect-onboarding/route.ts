import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { FintechServiceError } from "@/lib/fintech/service";
import {
  startOwnerConnectVerificationOnboarding,
  VerificationFlowError
} from "@/lib/trust/verification-service";
import { VerificationProviderSyncError } from "@/lib/trust/provider-sync";

const shopPayloadSchema = z.object({
  shopId: z.string().trim().optional().nullable()
});

function toErrorResponse(error: unknown) {
  if (error instanceof VerificationFlowError || error instanceof VerificationProviderSyncError || error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to start Stripe Connect onboarding.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const parsed = shopPayloadSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Stripe Connect onboarding payload." }, { status: 400 });
    }

    const payload = await startOwnerConnectVerificationOnboarding(user, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
