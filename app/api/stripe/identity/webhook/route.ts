import { NextRequest, NextResponse } from "next/server";
import {
  processStripeIdentityWebhook,
  VerificationFlowError
} from "@/lib/trust/verification-service";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  try {
    const payload = await request.text();
    const result = await processStripeIdentityWebhook(payload, signature);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VerificationFlowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[Stripe Identity Webhook] unexpected failure", error);
    return NextResponse.json({ error: "Unable to process the Stripe Identity webhook." }, { status: 500 });
  }
}
