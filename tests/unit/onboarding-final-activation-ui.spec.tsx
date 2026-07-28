import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinalActivationWorkspace } from "@/components/onboarding/final-activation-workspace";
import { buildFinalActivationFromContext } from "@/lib/onboarding/final-activation";

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

const completeBarber = {
  authenticated: true,
  authMethodConnected: true,
  role: "barber_user",
  name: "Wave Carter",
  username: "wave",
  email: "wave@example.com",
  phone: "8135550102",
  termsAccepted: true,
  trustRulesAccepted: true,
  barberBusiness: {
    barberRecordId: "barber-wave",
    displayName: "Wave Carter",
    username: "wave",
    safeProfilePlaceholderAllowed: true,
    activeServiceCount: 1,
    hasPrice: true,
    hasDuration: true,
    hasSchedule: true,
    bookingMode: "instant"
  }
};

describe("onboarding final activation UI", () => {
  it("renders approved progress copy and no backend labels", () => {
    const result = buildFinalActivationFromContext("client", clientAccount, { firstBookingExists: true });
    const { container } = render(<FinalActivationWorkspace result={result} />);

    expect(screen.getByTestId("onboarding-final-activation")).toBeInTheDocument();
    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.getByText("You're ready.")).toBeInTheDocument();
    expect(screen.getByText("Enter Client Home")).toHaveAttribute("href", "/dashboard/client");
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/client_user|barber_user|shop_owner_user|guest_user/);
    expect(container.textContent).not.toMatch(/profiles\.role|auth\.uid|username_normalized|owner_profile_id|shop_id/);
    expect(container.textContent).not.toMatch(/payment_intent|stripe_customer_id|provider_payment_method_id|payout_readiness_status|payment_routing_records/);
    expect(container.textContent).not.toMatch(/relationship_type|booth_rent_barber|commission_barber|freelance_barber/);  // doctrine-allow
  });

  it("shows blocked and retry states with safe next actions", () => {
    const result = buildFinalActivationFromContext("barber", clientAccount, {
      retry: {
        retryKey: "profile-save",
        failed: true,
        reason: "Profile save failed. Try again.",
        href: "/onboarding/barber?step=identity"
      }
    });
    render(<FinalActivationWorkspace result={result} />);

    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    const blocked = screen.getByLabelText("Blocked states");
    expect(within(blocked).getByText(/setup needs the matching account access/i)).toBeInTheDocument();
    expect(within(blocked).getByText("Continue where you left off")).toHaveAttribute("href", "/onboarding/barber?step=identity");

    const retry = screen.getByLabelText("Retry states");
    expect(within(retry).getByText("Profile save failed. Try again.")).toBeInTheDocument();
    expect(within(retry).getAllByText("Try again").at(-1)).toHaveAttribute("href", "/onboarding/barber?step=identity");
  });

  it("shows payout next action without blocking basic Barber Home when business readiness passes", () => {
    const result = buildFinalActivationFromContext("barber", completeBarber, {
      inviteSkipped: true
    });
    render(<FinalActivationWorkspace result={result} />);

    expect(screen.getByText("Enter Barber Home")).toHaveAttribute("href", "/dashboard/barber");
    expect(screen.getByText("Invite First Client")).toHaveAttribute("href", "/onboarding/barber?step=invite_first_client");
    expect(screen.getAllByText("Finish payout setup")[0]).toHaveAttribute("href", "/dashboard/barber/payouts");
    expect(screen.getByTestId("onboarding-final-qa-matrix")).toHaveTextContent("Needs review");
  });
});
