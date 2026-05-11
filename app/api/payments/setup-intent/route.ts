import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getPaymentProvider } from "@/lib/payments/provider";
import { ensureClientPaymentProfileForUser, syncClientPaymentSetupCustomer } from "@/lib/payments/service";

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (user.role !== "client") {
      return NextResponse.json({ error: "Only clients can initialize saved payment method setup." }, { status: 403 });
    }

    await request.json().catch(() => null);
    const paymentProfile = await ensureClientPaymentProfileForUser(user);
    const provider = await getPaymentProvider();
    const intent = await provider.createSavedPaymentMethodSetup({
      customerEmail: paymentProfile.profileEmail,
      customerName: paymentProfile.profileName
    });
    await syncClientPaymentSetupCustomer(paymentProfile, intent.customerId);

    return NextResponse.json(intent);
  } catch (error) {
    console.error("[payments] stripe_setup_intent_create_failed", {
      reference: "stripe_setup_intent_create_failed",
      message: error instanceof Error ? error.message : "Unknown setup intent failure"
    });
    return NextResponse.json({
      error: "Secure card form failed to load. Stripe setup is not ready."
    }, { status: 500 });
  }
}
