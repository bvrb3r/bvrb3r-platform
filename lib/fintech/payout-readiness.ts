import type { ConnectedAccountReadinessView } from "@/lib/fintech/service";
import type { StripeConnectEnvironmentView } from "@/lib/stripe/connect";

export function isStripeConnectReadyForActivation(
  account: ConnectedAccountReadinessView | null | undefined,
  environment: StripeConnectEnvironmentView | null | undefined
) {
  if (!account || !environment || environment.mode === "missing") {
    return false;
  }

  const onboardingComplete =
    account.onboardingStatus === "verified"
    || account.onboardingStatus === "submitted"
    || account.payoutReadinessStatus === "ready"
    || account.operationalStatus === "payout_ready";

  return Boolean(
    account.chargesEnabled
    && account.payoutsEnabled
    && onboardingComplete
    && !account.disabledReason
    && account.requirementsCurrentlyDue.length === 0
    && account.requirementsPastDue.length === 0
  );
}

export function getStripePayoutReadinessLabel(
  ready: boolean,
  environment: StripeConnectEnvironmentView | null | undefined
) {
  if (!ready) {
    return environment?.mode === "test"
      ? "Stripe test mode - not live payouts."
      : "Finish Stripe payouts to accept paid bookings.";
  }

  return environment?.mode === "test"
    ? "Stripe test mode connected - not live payouts."
    : "Payouts connected";
}
