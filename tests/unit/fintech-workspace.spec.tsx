import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useFintechManagementQueryMock,
  useFintechPayoutsQueryMock,
  mutationMock
} = vi.hoisted(() => ({
  useFintechManagementQueryMock: vi.fn(),
  useFintechPayoutsQueryMock: vi.fn(),
  mutationMock: vi.fn()
}));

vi.mock("@/lib/fintech/client", () => ({
  useFintechManagementQuery: useFintechManagementQueryMock,
  useFintechPayoutsQuery: useFintechPayoutsQueryMock,
  useUpdateMembershipCompensationMutation: mutationMock,
  useRecordLegalAcceptanceMutation: mutationMock,
  useCreateStripeOnboardingLinkMutation: mutationMock,
  useCreateStripeDashboardLinkMutation: mutationMock,
  useRefreshStripeConnectedAccountMutation: mutationMock,
  useExecuteFintechPayoutsMutation: mutationMock
}));

import { FintechWorkspace } from "@/components/operations/fintech-workspace";

describe("fintech workspace", () => {
  beforeEach(() => {
    mutationMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
    useFintechManagementQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: {
          totalAccounts: 1,
          readyAccounts: 0,
          blockedAccounts: 0,
          needsAttentionAccounts: 1,
          notReadyAccounts: 0,
          blockedRoutingRecords: 0,
          readyForPayoutAmount: 0
        },
        shops: [{
          id: "connected-shop-1",
          shopId: "shop-1",
          shopLabel: "BVRB3R Ybor",
          displayName: "BVRB3R Ybor",
          provider: "stripe_connect",
          providerAccountId: "acct_123",
          onboardingStatus: "restricted",
          operationalStatus: "needs_attention",
          legalReadinessStatus: "accepted",
          taxReadinessStatus: "submitted",
          chargesEnabled: true,
          payoutsEnabled: false,
          requirementsCurrentlyDue: ["individual.verification.document"],
          requirementsEventuallyDue: [],
          requirementsPastDue: [],
          disabledReason: "requirements.pending_verification",
          missingAgreements: [],
          missingSteps: [],
          processorLastSyncedAt: "2026-08-13T05:00:00.000Z",
          processorLastEventType: "account.updated"
        }],
        barbers: [],
        memberships: [],
        blockedPayments: []
      }
    });
    useFintechPayoutsQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: {
          executableRoutingRecords: 0,
          readyForPayoutAmount: 0,
          blockedExecutionRecords: 0,
          failedExecutionRecords: 0,
          executedTransferCount: 0,
          reversedExecutionCount: 0,
          executedAmount: 0,
          reversedAmount: 0
        },
        readyRouting: [],
        recentExecutions: []
      }
    });
  });

  it("renders Stripe-owned account state read-only with supported Stripe actions", () => {
    render(<FintechWorkspace viewerRole="owner" locationIds={["shop-1"]} />);

    expect(screen.getByText("Stripe-owned status · read only")).toBeInTheDocument();
    expect(screen.getByText("acct_123")).toBeInTheDocument();
    expect(screen.getByText("individual.verification.document")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save (barber )?readiness/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume Stripe onboarding" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Stripe dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Stripe status" })).toBeInTheDocument();
  });
});
