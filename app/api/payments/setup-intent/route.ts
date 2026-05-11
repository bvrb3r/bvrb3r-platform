import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getPaymentProvider } from "@/lib/payments/provider";

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (user.role !== "client") {
      return NextResponse.json({ error: "Only clients can initialize saved payment method setup." }, { status: 403 });
    }

    await request.json().catch(() => null);
    const provider = await getPaymentProvider();
    const intent = await provider.createSavedPaymentMethodSetup({
      customerEmail: user.email,
      customerName: user.name
    });

    return NextResponse.json(intent);
  } catch (error) {
    console.error("[payments] stripe_setup_intent_create_failed", {
      reference: "stripe_setup_intent_create_failed",
      message: error instanceof Error ? error.message : "Unknown setup intent failure"
    });
    return NextResponse.json({
      error: "Secure card form failed to load. Check Stripe publishable key or SetupIntent."
    }, { status: 500 });
  }
}
