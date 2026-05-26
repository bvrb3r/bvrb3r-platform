import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queueHookMock,
  validateHookMock,
  releaseHookMock,
  validateMutateAsyncMock,
  releaseMutateAsyncMock
} = vi.hoisted(() => ({
  queueHookMock: vi.fn(),
  validateHookMock: vi.fn(),
  releaseHookMock: vi.fn(),
  validateMutateAsyncMock: vi.fn(),
  releaseMutateAsyncMock: vi.fn()
}));

vi.mock("@/lib/fintech/client", () => ({
  useArchitectFreelancePayoutQueueQuery: queueHookMock,
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
    canRelease: true
  }]
};

describe("ArchitectFreelancePayoutQueue", () => {
  beforeEach(() => {
    queueHookMock.mockReset();
    validateHookMock.mockReset();
    releaseHookMock.mockReset();
    validateMutateAsyncMock.mockReset();
    releaseMutateAsyncMock.mockReset();
    queueHookMock.mockReturnValue({
      data: queuePayload,
      isLoading: false,
      isError: false,
      error: null
    });
    validateHookMock.mockReturnValue({
      mutateAsync: validateMutateAsyncMock
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
    expect(screen.getByRole("button", { name: "Release payout" })).toBeDisabled();
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
});
