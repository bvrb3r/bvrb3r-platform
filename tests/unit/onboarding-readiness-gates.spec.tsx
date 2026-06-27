import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OnboardingReadinessSummary } from "@/components/onboarding/onboarding-readiness-summary";
import { buildOnboardingReadiness } from "@/lib/onboarding/readiness";

const clientAccount = {
  authenticated: true,
  authMethodConnected: true,
  role: "client_user",
  name: "Jordan Ellis",
  username: "jordan",
  email: "jordan@example.com",
  phone: "8135550101",
  termsAccepted: true,
  trustRulesAccepted: true
};

describe("onboarding readiness UI gates", () => {
  it("renders shared readiness summary with human copy and no backend labels", () => {
    const result = buildOnboardingReadiness({ authenticated: true, role: "client_user" });
    const { container } = render(<OnboardingReadinessSummary result={result} />);

    expect(screen.getByTestId("onboarding-readiness-summary")).toBeInTheDocument();
    expect(screen.getByText("Readiness")).toBeInTheDocument();
    expect(screen.getByText("Next best action")).toBeInTheDocument();
    expect(screen.getByText("Add your name")).toBeInTheDocument();
    expect(screen.getByText("Setup needed before dashboard")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/profiles\.role|client_user|barber_user|shop_owner_user|guest_user/);
    expect(container.textContent).not.toMatch(/payment_intent|payment_routing_records|payout_readiness_status|stripe_account_id/);
    expect(container.textContent).not.toMatch(/shop_barber_relationships|relationship_type|booth_rent_barber|commission_barber|freelance_barber/);
  });

  it("keeps serious booking actions gated until booking readiness passes", () => {
    const incomplete = buildOnboardingReadiness({
      ...clientAccount,
      booking: {
        selectedProviderId: "barber-wave",
        selectedServiceId: "srv-cut",
        selectedTime: "2026-08-01T15:00:00.000Z",
        paymentRequired: true,
        policyAccepted: true,
        serverProofConnected: true
      }
    });

    expect(incomplete.readiness.booking.status).toBe("needs_setup");
    expect(incomplete.readiness.booking.missingRequirements.map((requirement) => requirement.label)).toContain("Add a payment method");
    expect(incomplete.canPerformSeriousActions).toBe(false);

    const ready = buildOnboardingReadiness({
      ...clientAccount,
      booking: {
        selectedProviderId: "barber-wave",
        selectedServiceId: "srv-cut",
        selectedTime: "2026-08-01T15:00:00.000Z",
        paymentRequired: true,
        paymentMethodReference: "provider-payment-method-reference",
        policyAccepted: true,
        serverProofConnected: true
      }
    });

    expect(ready.readiness.booking.status).toBe("pass");
    expect(ready.canPerformSeriousActions).toBe(true);
  });

  it("does not make payout, shop, or kiosk readiness pass from UI state alone", () => {
    const barber = buildOnboardingReadiness({
      authenticated: true,
      authMethodConnected: true,
      role: "barber_user",
      name: "Wave Carter",
      username: "wave",
      email: "wave@example.com",
      termsAccepted: true,
      trustRulesAccepted: true,
      payout: {
        paymentLaneSelected: true,
        provider: "stripe",
        providerTruthConnected: false,
        frontendOnly: true,
        identityVerified: true,
        providerPayoutStatus: "ready",
        termsAccepted: true
      }
    });

    expect(barber.readiness.payout.status).toBe("needs_review");
    expect(barber.readiness.payout.statusLabel).toBe("Needs review");

    const owner = buildOnboardingReadiness({
      authenticated: true,
      authMethodConnected: true,
      role: "shop_owner_user",
      name: "Avery Owner",
      username: "averyshop",
      email: "owner@example.com",
      termsAccepted: true,
      trustRulesAccepted: true,
      shop: {
        ownerAuthority: true,
        shopRecordId: "shop-ybor",
        shopName: "BVRB3R Ybor",
        shopUsername: "bvrb3r-ybor",
        chairCount: 4,
        operatingModel: "mixed",
        bookingMode: "scheduled",
        paymentModel: "platform_payments",
        verificationPosture: "pending"
      },
      kiosk: {
        shopActive: true,
        chairsActive: true,
        teamEligible: true,
        bookingModeSet: true,
        walkInModeSet: true,
        sessionRules: true,
        rotationMode: true,
        notificationSetup: true
      }
    });

    expect(owner.readiness.shop.status).toBe("needs_setup");
    expect(owner.readiness.kiosk.status).toBe("blocked");
  });

  it("shows status labels instead of backend readiness enum values", () => {
    const result = buildOnboardingReadiness({
      ...clientAccount,
      booking: {
        selectedProviderId: "barber-wave",
        selectedServiceId: "srv-cut",
        selectedTime: "2026-08-01T15:00:00.000Z",
        paymentRequired: false,
        policyAccepted: true,
        serverProofConnected: true
      }
    });
    const { container } = render(<OnboardingReadinessSummary result={result} />);

    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/public_guest_ready|browse_ready|account_ready|booking_ready|culture_ready/);
    expect(container.textContent).not.toMatch(/barber_business_ready|payout_ready|shop_ready|kiosk_ready/);
    expect(container.textContent).not.toMatch(/needs_setup|needs_review|not_applicable/);
  });
});
