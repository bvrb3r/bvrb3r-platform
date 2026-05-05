import { describe, expect, it } from "vitest";
import { getStripePayoutReadinessLabel, isStripeConnectReadyForActivation } from "@/lib/fintech/payout-readiness";

function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acct-row-1",
    subjectType: "barber",
    provider: "stripe_connect",
    operationalStatus: "payout_ready",
    providerAccountId: "acct_test_123",
    onboardingStatus: "verified",
    payoutReadinessStatus: "ready",
    legalReadinessStatus: "accepted",
    taxReadinessStatus: "verified",
    chargesEnabled: true,
    payoutsEnabled: true,
    requirementsCurrentlyDue: [],
    requirementsEventuallyDue: [],
    requirementsPastDue: [],
    missingAgreements: [],
    outdatedAgreements: [],
    missingSteps: [],
    disabledReason: null,
    lastCheckedAt: "2026-05-05T12:00:00.000Z",
    onboardingStartedAt: "2026-05-05T11:00:00.000Z",
    onboardingCompletedAt: "2026-05-05T11:20:00.000Z",
    processorLastSyncedAt: "2026-05-05T12:00:00.000Z",
    processorLastEventId: "evt_1",
    processorLastEventType: "account.updated",
    dashboardLastAccessedAt: null,
    createdAt: "2026-05-05T10:00:00.000Z",
    updatedAt: "2026-05-05T12:00:00.000Z",
    ...overrides
  } as never;
}

const testEnvironment = {
  mode: "test",
  label: "Stripe test mode - not live payouts.",
  blocksLivePayouts: true
} as const;

const liveEnvironment = {
  mode: "live",
  label: "Stripe live mode.",
  blocksLivePayouts: false
} as const;

describe("Stripe payout activation readiness", () => {
  it("allows completed test-mode connected accounts to satisfy the test activation gate", () => {
    const ready = isStripeConnectReadyForActivation(buildAccount(), testEnvironment);

    expect(ready).toBe(true);
    expect(getStripePayoutReadinessLabel(ready, testEnvironment)).toBe("Stripe test mode connected - not live payouts.");
  });

  it("keeps payouts incomplete while Stripe still has current requirements due", () => {
    const ready = isStripeConnectReadyForActivation(buildAccount({
      requirementsCurrentlyDue: ["individual.ssn_last_4"]
    }), testEnvironment);

    expect(ready).toBe(false);
  });

  it("requires live Stripe environment for a live-ready activation label", () => {
    const ready = isStripeConnectReadyForActivation(buildAccount(), liveEnvironment);

    expect(ready).toBe(true);
    expect(getStripePayoutReadinessLabel(ready, liveEnvironment)).toBe("Payouts connected");
  });

  it("does not mark missing Stripe configuration ready", () => {
    expect(isStripeConnectReadyForActivation(buildAccount(), {
      mode: "missing",
      label: "Stripe live keys missing - payouts are not ready.",
      blocksLivePayouts: true
    })).toBe(false);
  });
});
