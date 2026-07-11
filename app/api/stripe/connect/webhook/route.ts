import { NextRequest, NextResponse } from "next/server";
import { FintechServiceError, processStripeConnectWebhook } from "@/lib/fintech/service";
import { processLiveStripeCertificationProbe } from "@/lib/fintech/webhook-certification";

export const runtime = "nodejs";

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to process the Stripe Connect webhook.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Stripe signature is required." }, { status: 400 });
    }

    const payload = await request.text();
    const certificationResult = await processLiveStripeCertificationProbe(payload, signature);
    const result = certificationResult ?? await processStripeConnectWebhook(payload, signature);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
