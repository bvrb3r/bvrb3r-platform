import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  diagnosticsHookMock,
  queueHookMock,
  validateHookMock,
  approveHookMock,
  releaseHookMock,
  validateMutateAsyncMock,
  approveMutateAsyncMock,
  releaseMutateAsyncMock
} = vi.hoisted(() => ({
  diagnosticsHookMock: vi.fn(),
  queueHookMock: vi.fn(),
  validateHookMock: vi.fn(),
  approveHookMock: vi.fn(),
  releaseHookMock: vi.fn(),
  validateMutateAsyncMock: vi.fn(),
  approveMutateAsyncMock: vi.fn(),
  releaseMutateAsyncMock: vi.fn()
}));

vi.mock("@/lib/fintech/client", () => ({
  useApproveFreelancePayoutReadinessMutation: approveHookMock,
  useArchitectFreelancePayoutQueueQuery: queueHookMock,
  useArchitectStripePlatformDiagnosticsQuery: diagnosticsHookMock,
  useValidateFreelancePayoutMutation: validateHookMock,
  useReleaseFreelancePayoutMutation: releaseHookMock
}));

import { ArchitectFreelancePayoutQueue } from "@/components/architect/payouts/architect-freelance-payout-queue";

const queuePayload = {
  summary: {
    readyCount: 1,
    readyAmount: 8.55,
    blockedCount: 0,
    releasedCount: 0
  },
  warnings: [],
  items: [{
    routingRecordId: "routing-9",
    paymentId: "payment-9",
    appointmentId: null,
    posSaleId: "sale-9",
    barberId: "barber-1",
    barberName: "Phillip mcgee",
    sourceLabel: "POS Card-on-File",
    providerGrossAmount: 9,
    platformFeeAmount: 0.45,
    barberPayoutAmount: 8.55,
    shopSplitAmount: 0,
    payoutReadinessStatus: "ready",
    moneyRoutingStatus: "pending",
    eligibleAt: "2026-05-26T12:00:00.000Z",
    releasedAt: null,
    stripeConnectAccountId: "acct_barber",
    stripePayoutReadiness: {
      barberId: "barber-1",
      stripeConnectAccountId: "acct_barber",
      hasAccount: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      currentlyDue: [],
      eventuallyDue: [],
      pastDue: [],
      disabledReason: null,
      canReceivePayouts: true,
      requiresOnboarding: false,
      displayStatus: "ready",
      displayMessage: "Payout account ready."
    },
    existingExecutionId: null,
    existingExecutionStatus: null,
    ineligibleReasons: [],
    warnings: [],
    canValidate: true,
    canRelease: true,
    canApprovePayoutSetup: false,
    releaseBlockedReason: null,
    releaseActionLabel: "Release payout"
  }]
};

describe("ArchitectFreelancePayoutQueue", () => {
  beforeEach(() => {
    diagnosticsHookMock.mockReset();
    queueHookMock.mockReset();
    validateHookMock.mockReset();
    releaseHookMock.mockReset();
    validateMutateAsyncMock.mockReset();
    approveMutateAsyncMock.mockReset();
    releaseMutateAsyncMock.mockReset();
    queueHookMock.mockReturnValue({
      data: queuePayload,
      isLoading: false,
      isError: false,
      error: null
    });
    diagnosticsHookMock.mockReturnValue({
      data: {
        ok: true,
        platformAccountId: "acct_1L0nesLDU3d4YToG",
        country: "US",
        defaultCurrency: "usd",
        chargesEnabled: true,
        payoutsEnabled: true,
        dashboardDisplayName: "BVRB3R Platform",
        livemode: false,
        availableBalances: [{ currency: "usd", amount: 100 }],
        pendingBalances: [{ currency: "usd", amount: 0 }],
        stripeKeyMode: "test",
        expectedPlatformAccountId: "acct_1L0nesLDU3d4YToG",
        accountMatchesExpected: true,
        mismatchWarning: null,
        warnings: [],
        checkedAt: "2026-05-26T15:00:00.000Z"
      },
      isLoading: false,
      isError: false,
      error: null
    });
    validateHookMock.mockReturnValue({
      mutateAsync: validateMutateAsyncMock
    });
    approveHookMock.mockReturnValue({
      mutateAsync: approveMutateAsyncMock
    });
    releaseHookMock.mockReturnValue({
      mutateAsync: releaseMutateAsyncMock
    });
  });

  it("renders the freelance payout queue and releases a ready item", async () => {
    releaseMutateAsyncMock.mockResolvedValue({
      ok: true,
      message: "Payout released to the barber payout account."
    });

    render(<ArchitectFreelancePayoutQueue />);

    const queue = screen.getByTestId("architect-freelance-payout-queue");
    expect(within(queue).getByText("Manual Phase 1 release queue")).toBeInTheDocument();
    expect(within(queue).getByText("Phillip mcgee")).toBeInTheDocument();
    expect(within(queue).getAllByText("$8.55").length).toBeGreaterThan(0);

    fireEvent.click(within(queue).getByRole("button", { name: "Release payout" }));

    await waitFor(() => {
      expect(releaseMutateAsyncMock).toHaveBeenCalledWith({ routingRecordId: "routing-9" });
    });
    expect(await screen.findByText("Payout released to the barber payout account.")).toBeInTheDocument();
  });

  it("renders Stripe platform diagnostics for the app server key", () => {
    render(<ArchitectFreelancePayoutQueue />);

    const diagnostics = screen.getByTestId("architect-stripe-platform-diagnostics");
    expect(within(diagnostics).getByText("Stripe platform used by app")).toBeInTheDocument();
    expect(within(diagnostics).getByText("acct_1L0nesLDU3d4YToG")).toBeInTheDocument();
    expect(within(diagnostics).getByText("$100.00 USD")).toBeInTheDocument();
    expect(within(diagnostics).getByText("Mode: test")).toBeInTheDocument();
  });

  it("shows Stripe account mismatch warnings in diagnostics", () => {
    diagnosticsHookMock.mockReturnValue({
      data: {
        ok: true,
        platformAccountId: "acct_actual",
        country: "US",
        defaultCurrency: "usd",
        chargesEnabled: true,
        payoutsEnabled: true,
        dashboardDisplayName: "Unexpected Platform",
        livemode: false,
        availableBalances: [{ currency: "usd", amount: 0 }],
        pendingBalances: [],
        stripeKeyMode: "test",
        expectedPlatformAccountId: "acct_expected",
        accountMatchesExpected: false,
        mismatchWarning: "Stripe account mismatch: the app is using acct_actual, but expected acct_expected.",
        warnings: ["Stripe account mismatch: the app is using acct_actual, but expected acct_expected."],
        checkedAt: "2026-05-26T15:00:00.000Z"
      },
      isLoading: false,
      isError: false,
      error: null
    });

    render(<ArchitectFreelancePayoutQueue />);

    expect(screen.getByText("Stripe account mismatch: the app is using acct_actual, but expected acct_expected.")).toBeInTheDocument();
  });

  it("surfaces validation reasons for blocked payouts", async () => {
    validateMutateAsyncMock.mockResolvedValue({
      eligible: false,
      reasons: ["Missing: external_account, business_profile.url."],
      releaseAmount: 8.55
    });

    render(<ArchitectFreelancePayoutQueue />);
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByText("Missing: external_account, business_profile.url.")).toBeInTheDocument();
  });

  it("shows specific Stripe readiness requirements on blocked queue rows", () => {
    queueHookMock.mockReturnValue({
      data: {
        ...queuePayload,
        items: [{
          ...queuePayload.items[0],
          canRelease: false,
          canApprovePayoutSetup: false,
          releaseBlockedReason: "Missing: external_account, business_profile.url.",
          releaseActionLabel: "Payout blocked",
          ineligibleReasons: ["Missing: external_account, business_profile.url."],
          stripePayoutReadiness: {
            ...queuePayload.items[0].stripePayoutReadiness,
            canReceivePayouts: false,
            requiresOnboarding: true,
            displayStatus: "incomplete",
            displayMessage: "Missing: external_account, business_profile.url.",
            currentlyDue: ["external_account", "business_profile.url"]
          }
        }]
      },
      isLoading: false,
      isError: false,
      error: null
    });

    render(<ArchitectFreelancePayoutQueue />);

    expect(screen.getByText("Stripe payout setup incomplete")).toBeInTheDocument();
    expect(screen.getAllByText("Missing: external_account, business_profile.url.").length).toBeGreaterThan(0);
    expect(screen.getByText("Missing: external_account, business_profile.url")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Payout blocked" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Validate" })).not.toBeDisabled();
  });

  it("does not trigger release for a Stripe-blocked row", () => {
    queueHookMock.mockReturnValue({
      data: {
        ...queuePayload,
        summary: {
          readyCount: 1,
          readyAmount: 8.55,
          blockedCount: 1,
          releasedCount: 0
        },
        items: [{
          ...queuePayload.items[0],
          canRelease: false,
          canApprovePayoutSetup: false,
          releaseBlockedReason: "Barber Stripe Connect account is not payout ready.",
          releaseActionLabel: "Payout blocked",
          ineligibleReasons: ["Barber Stripe Connect account is not payout ready."],
          stripePayoutReadiness: {
            ...queuePayload.items[0].stripePayoutReadiness,
            canReceivePayouts: false,
            requiresOnboarding: true,
            displayStatus: "payouts_disabled",
            displayMessage: "Barber Stripe Connect account is not payout ready."
          }
        }]
      },
      isLoading: false,
      isError: false,
      error: null
    });

    render(<ArchitectFreelancePayoutQueue />);

    fireEvent.click(screen.getByRole("button", { name: "Payout blocked" }));

    expect(releaseMutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("Barber Stripe Connect account is not payout ready.").length).toBeGreaterThan(0);
  });

  it("approves internal payout setup review without enabling the blocked release button first", async () => {
    approveMutateAsyncMock.mockResolvedValue({
      ok: true,
      message: "Payout setup approved. This barber can now receive BVRB3R payouts."
    });
    queueHookMock.mockReturnValue({
      data: {
        ...queuePayload,
        summary: {
          readyCount: 1,
          readyAmount: 8.55,
          blockedCount: 1,
          releasedCount: 0
        },
        items: [{
          ...queuePayload.items[0],
          canRelease: false,
          canApprovePayoutSetup: true,
          releaseBlockedReason: "Payout setup pending BVRB3R review.",
          releaseActionLabel: "Payout blocked",
          ineligibleReasons: ["Payout setup pending BVRB3R review."],
          stripePayoutReadiness: {
            ...queuePayload.items[0].stripePayoutReadiness,
            canReceivePayouts: false,
            requiresOnboarding: false,
            displayStatus: "internal_review",
            displayMessage: "Payout setup pending BVRB3R review."
          }
        }]
      },
      isLoading: false,
      isError: false,
      error: null
    });

    render(<ArchitectFreelancePayoutQueue />);

    expect(screen.getByRole("button", { name: "Payout blocked" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Approve payout setup" }));

    await waitFor(() => {
      expect(approveMutateAsyncMock).toHaveBeenCalledWith({ routingRecordId: "routing-9" });
    });
    expect(await screen.findByText("Payout setup approved. This barber can now receive BVRB3R payouts.")).toBeInTheDocument();
    expect(releaseMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows queue warnings without hiding visible ready rows", () => {
    queueHookMock.mockReturnValue({
      data: {
        ...queuePayload,
        warnings: ["Dispute hold inspection unavailable. Manual review required."]
      },
      isLoading: false,
      isError: false,
      error: null
    });

    render(<ArchitectFreelancePayoutQueue />);

    expect(screen.getByText("Dispute hold inspection unavailable. Manual review required.")).toBeInTheDocument();
    expect(screen.getByText("Phillip mcgee")).toBeInTheDocument();
    expect(screen.queryByText("No freelance payout releases are waiting right now.")).not.toBeInTheDocument();
  });

  it("shows failed release reasons and retries with the structured Stripe message", async () => {
    releaseMutateAsyncMock.mockResolvedValue({
      ok: false,
      message: "Release failed: insufficient available Stripe platform balance.",
      failedStep: "stripe_transfer",
      errorCode: "stripe_insufficient_funds",
      errorMessage: "Release failed: insufficient available Stripe platform balance.",
      payoutExecutionId: "execution-failed"
    });
    queueHookMock.mockReturnValue({
      data: {
        ...queuePayload,
        items: [{
          ...queuePayload.items[0],
          existingExecutionId: "execution-failed",
          existingExecutionStatus: "failed",
          lastFailedExecutionId: "execution-failed",
          lastFailedExecutionReason: "You have insufficient available funds in your Stripe account.",
          lastReleaseFailureMessage: "Release failed: insufficient available Stripe platform balance.",
          releaseActionLabel: "Retry release"
        }]
      },
      isLoading: false,
      isError: false,
      error: null
    });

    render(<ArchitectFreelancePayoutQueue />);

    expect(screen.getByText("Last release attempt failed")).toBeInTheDocument();
    expect(screen.getAllByText("Release failed: insufficient available Stripe platform balance.").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Retry release" }));

    await waitFor(() => {
      expect(releaseMutateAsyncMock).toHaveBeenCalledWith({ routingRecordId: "routing-9" });
    });
    expect((await screen.findAllByText("Release failed: insufficient available Stripe platform balance.")).length).toBeGreaterThanOrEqual(2);
  });
});
