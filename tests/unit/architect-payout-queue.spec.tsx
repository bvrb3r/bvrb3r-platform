import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  diagnosticsHookMock,
  queueHookMock,
  validateHookMock,
  approveHookMock,
  releaseHookMock,
  batchReleaseHookMock,
  validateMutateAsyncMock,
  approveMutateAsyncMock,
  releaseMutateAsyncMock,
  batchReleaseMutateAsyncMock
} = vi.hoisted(() => ({
  diagnosticsHookMock: vi.fn(),
  queueHookMock: vi.fn(),
  validateHookMock: vi.fn(),
  approveHookMock: vi.fn(),
  releaseHookMock: vi.fn(),
  batchReleaseHookMock: vi.fn(),
  validateMutateAsyncMock: vi.fn(),
  approveMutateAsyncMock: vi.fn(),
  releaseMutateAsyncMock: vi.fn(),
  batchReleaseMutateAsyncMock: vi.fn()
}));

vi.mock("@/lib/fintech/client", () => ({
  useApproveFreelancePayoutReadinessMutation: approveHookMock,
  useArchitectFreelancePayoutQueueQuery: queueHookMock,
  useArchitectStripePlatformDiagnosticsQuery: diagnosticsHookMock,
  useReleaseFreelancePayoutBatchMutation: batchReleaseHookMock,
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
    batchReleaseHookMock.mockReset();
    validateMutateAsyncMock.mockReset();
    approveMutateAsyncMock.mockReset();
    releaseMutateAsyncMock.mockReset();
    batchReleaseMutateAsyncMock.mockReset();
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
    batchReleaseHookMock.mockReturnValue({
      mutateAsync: batchReleaseMutateAsyncMock,
      isPending: false
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

  it("renders a batch release button and confirms the ready payout total", () => {
    render(<ArchitectFreelancePayoutQueue />);

    fireEvent.click(screen.getByRole("button", { name: "Release all ready payouts" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Release all ready payouts?")).toBeInTheDocument();
    expect(within(dialog).getByText("Release 1 payout totaling $8.55?")).toBeInTheDocument();
    expect(within(dialog).getByText("$100.00")).toBeInTheDocument();
    expect(within(dialog).getByText("$8.55")).toBeInTheDocument();
  });

  it("runs batch release and shows the released total", async () => {
    batchReleaseMutateAsyncMock.mockResolvedValue({
      ok: true,
      attemptedCount: 1,
      releasedCount: 1,
      failedCount: 0,
      skippedCount: 0,
      totalReleasedAmount: 8.55,
      requiredAmount: 8.55,
      availableAmount: 100,
      results: [{ routingRecordId: "routing-9", status: "released", amount: 8.55, processorTransferId: "tr_1", reason: null }],
      message: "Released 1 payout totaling $8.55."
    });

    render(<ArchitectFreelancePayoutQueue />);

    fireEvent.click(screen.getByRole("button", { name: "Release all ready payouts" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Release all ready payouts" }));

    await waitFor(() => {
      expect(batchReleaseMutateAsyncMock).toHaveBeenCalledWith({ scope: "freelance", mode: "ready_only" });
    });
    expect(await screen.findByText("Released 1 payout totaling $8.55.")).toBeInTheDocument();
  });

  it("renders backend insufficient-balance batch response cleanly", async () => {
    batchReleaseMutateAsyncMock.mockResolvedValue({
      ok: false,
      attemptedCount: 0,
      releasedCount: 0,
      failedCount: 0,
      skippedCount: 1,
      totalReleasedAmount: 0,
      requiredAmount: 8.55,
      availableAmount: 0,
      errorCode: "insufficient_platform_balance",
      errorMessage: "Release blocked: Stripe platform available balance is below required payout total.",
      results: [{ routingRecordId: "routing-9", status: "skipped", amount: 8.55, processorTransferId: null, reason: "Release blocked" }],
      message: "Release blocked: Stripe platform available balance is below required payout total."
    });

    render(<ArchitectFreelancePayoutQueue />);

    fireEvent.click(screen.getByRole("button", { name: "Release all ready payouts" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Release all ready payouts" }));

    expect(await screen.findByText(/Release blocked: Stripe platform available balance is below required payout total\./)).toBeInTheDocument();
    expect(screen.getByText(/Required: \$8\.55/)).toBeInTheDocument();
    expect(screen.getByText(/Available: \$0\.00/)).toBeInTheDocument();
  });

  it("renders row-level batch payout failure reasons", async () => {
    batchReleaseMutateAsyncMock.mockResolvedValue({
      ok: true,
      attemptedCount: 3,
      releasedCount: 1,
      failedCount: 2,
      skippedCount: 0,
      totalReleasedAmount: 8.55,
      requiredAmount: 18.05,
      availableAmount: 63.55,
      results: [
        {
          routingRecordId: "routing-pos",
          paymentId: "payment-pos",
          appointmentId: null,
          posSaleId: "sale-pos",
          status: "released",
          amount: 8.55,
          processorTransferId: "tr_pos",
          reason: null,
          errorCode: null,
          failedStep: null
        },
        {
          routingRecordId: "c94797d0",
          paymentId: "payment-appointment-1",
          appointmentId: "c94797d0",
          posSaleId: null,
          status: "failed",
          amount: 4.75,
          processorTransferId: null,
          reason: "Payment has not been captured or paid.",
          errorCode: "appointment_payment_not_captured",
          failedStep: "validate_release"
        },
        {
          routingRecordId: "132df4f6",
          paymentId: "payment-appointment-2",
          appointmentId: "132df4f6",
          posSaleId: null,
          status: "failed",
          amount: 4.75,
          processorTransferId: null,
          reason: "Appointment is not completed.",
          errorCode: "appointment_not_completed",
          failedStep: "validate_release"
        }
      ],
      message: "Released 1 payouts. 2 failed."
    });

    render(<ArchitectFreelancePayoutQueue />);

    fireEvent.click(screen.getByRole("button", { name: "Release all ready payouts" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Release all ready payouts" }));

    expect(await screen.findByText("Released 1 payouts. 2 failed.")).toBeInTheDocument();
    const failures = screen.getByTestId("batch-payout-failures");
    expect(within(failures).getByText("2 payouts failed")).toBeInTheDocument();
    expect(within(failures).getByText("$4.75 appointment c94797d0")).toBeInTheDocument();
    expect(within(failures).getByText("Payment has not been captured or paid.")).toBeInTheDocument();
    expect(within(failures).getByText("$4.75 appointment 132df4f6")).toBeInTheDocument();
    expect(within(failures).getByText("Appointment is not completed.")).toBeInTheDocument();
    expect(within(failures).getAllByText("Step: validate_release | Code: appointment_payment_not_captured").length).toBe(1);
  });

  it("disables batch release when Stripe available balance is below the ready total", () => {
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
        availableBalances: [{ currency: "usd", amount: 4 }],
        pendingBalances: [],
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

    render(<ArchitectFreelancePayoutQueue />);

    const button = screen.getByRole("button", { name: "Insufficient Stripe balance" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(batchReleaseMutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Release blocked: Stripe platform available balance is below required payout total.")).toBeInTheDocument();
    expect(screen.getByText("Required: $8.55")).toBeInTheDocument();
    expect(screen.getByText("Available: $4.00")).toBeInTheDocument();
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

  it("shows safe Supabase diagnostics when payout execution insert fails", async () => {
    releaseMutateAsyncMock.mockResolvedValue({
      ok: false,
      message: "Unable to create the payout execution record.",
      failedStep: "create_payout_execution",
      errorCode: "payout_execution_insert_failed",
      errorMessage: "Unable to create the payout execution record.",
      debugSafeDetails: {
        table: "payout_executions",
        constraint: "payout_executions_idempotency_uidx",
        supabaseCode: "23505",
        supabaseMessage: "duplicate key value violates unique constraint \"payout_executions_idempotency_uidx\"",
        supabaseDetails: "Key (idempotency_key)=(freelance_payout_release:routing-9:attempt:7) already exists.",
        supabaseHint: null,
        attemptedIdempotencyKey: "freelance_payout_release:routing-9:attempt:7",
        attemptedAttemptCount: 7,
        nextAttemptNumber: 7,
        routingRecordId: "routing-9",
        paymentId: "payment-9",
        targetConnectedAccountId: "connected-9",
        targetProviderAccountId: "acct_barber",
        amount: 8.55,
        currency: "usd",
        executionStatus: "pending",
        executionType: "transfer",
        targetSubjectType: "barber"
      }
    });

    render(<ArchitectFreelancePayoutQueue />);

    fireEvent.click(screen.getByRole("button", { name: "Release payout" }));

    await waitFor(() => {
      expect(releaseMutateAsyncMock).toHaveBeenCalledWith({ routingRecordId: "routing-9" });
    });
    expect(await screen.findByText(/Unable to create the payout execution record\./)).toBeInTheDocument();
    expect(screen.getByText(/Supabase code: 23505/)).toBeInTheDocument();
    expect(screen.getByText(/Supabase message: duplicate key value violates unique constraint/)).toBeInTheDocument();
    expect(screen.getByText(/Idempotency key: freelance_payout_release:routing-9:attempt:7/)).toBeInTheDocument();
    expect(screen.getByText(/Attempt count: 7/)).toBeInTheDocument();
  });
});
