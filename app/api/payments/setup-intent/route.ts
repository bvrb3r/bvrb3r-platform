import { NextRequest, NextResponse } from "next/server";
import { getCanonicalAccountRole, isClientRole } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getPaymentProvider } from "@/lib/payments/provider";
import { ensureClientPaymentProfileForUser, syncClientPaymentSetupCustomer } from "@/lib/payments/service";

function getPublishableKeyPrefix(publishableKey?: string) {
  if (!publishableKey) {
    return "missing";
  }

  if (publishableKey.startsWith("pk_test_")) {
    return "pk_test";
  }

  if (publishableKey.startsWith("pk_live_")) {
    return "pk_live";
  }

  return "invalid";
}

function getClientSecretPrefix(clientSecret?: string) {
  if (!clientSecret) {
    return "missing";
  }

  if (clientSecret.startsWith("seti_")) {
    return "seti";
  }

  if (clientSecret.startsWith("pi_")) {
    return "pi";
  }

  return "invalid";
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const canonicalRole = getCanonicalAccountRole(user.role);
    if (!isClientRole(canonicalRole)) {
      return NextResponse.json({ error: "Only clients can initialize saved payment method setup." }, { status: 403 });
    }

    await request.json().catch(() => null);
    console.log("[payments] setup_intent_create_started", {
      reference: "setup_intent_create_started",
      userId: user.id
    });
    const paymentProfile = await ensureClientPaymentProfileForUser(user);
    const provider = await getPaymentProvider();
    const intent = await provider.createSavedPaymentMethodSetup({
      customerEmail: paymentProfile.profileEmail,
      customerName: paymentProfile.profileName
    });
    await syncClientPaymentSetupCustomer(paymentProfile, intent.customerId);
    console.log("[payments] setup_intent_create_success", {
      reference: "setup_intent_create_success",
      userId: user.id,
      clientId: paymentProfile.clientId,
      clientReference: paymentProfile.clientReference,
      stripeCustomerId: intent.customerId ? "present" : "missing",
      hasClientSecret: Boolean(intent.clientSecret),
      clientSecretPrefix: getClientSecretPrefix(intent.clientSecret),
      clientSecretStartsWithSeti: intent.clientSecret.startsWith("seti_"),
      hasPublishableKey: Boolean(intent.publishableKey),
      publishableKeyPrefix: getPublishableKeyPrefix(intent.publishableKey)
    });

    return NextResponse.json(intent);
  } catch (error) {
    console.error("[payments] stripe_setup_intent_create_failed", {
      reference: "stripe_setup_intent_create_failed",
      message: error instanceof Error ? error.message : "Unknown setup intent failure"
    });
    return NextResponse.json({
      error: "Secure card form failed to load."
    }, { status: 500 });
  }
}
