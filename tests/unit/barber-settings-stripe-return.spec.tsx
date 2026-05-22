import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  mediaRefetchMock,
  trustRefetchMock,
  verificationRefetchMock,
  readinessRefetchMock,
  payoutsRefetchMock,
  overviewRefetchMock,
  refreshStripeMock,
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useBarberFintechReadinessQueryMock,
  useBarberPayoutsQueryMock,
  useCreateStripeDashboardLinkMutationMock,
  useCreateStripeOnboardingLinkMutationMock,
  useRefreshStripeConnectedAccountMutationMock,
  useRecordLegalAcceptanceMutationMock,
  useCreateVerificationUploadMutationMock,
  useStartBarberIdentitySessionMutationMock,
  useSubmitBarberVerificationMutationMock,
  useVerificationMeMock,
  useBarberTrustSummaryMock,
  useBarberTeamInvitesQueryMock,
  useBarberJoinableShopsQueryMock,
  useBarberOverviewQueryMock,
  useRespondBarberTeamInviteMutationMock,
  useSaveBarberSubtypeMutationMock,
  useUpdateBarberBookingLocationMutationMock,
  useUpdateBarberActivationAvailabilityMutationMock,
  useUpdateBarberActivationMutationMock,
  useUpdateBarberStatusMutationMock,
  useCreateMarketplaceServiceMutationMock,
  useMarketplaceServiceCatalogMock
} = vi.hoisted(() => ({
  mediaRefetchMock: vi.fn(),
  trustRefetchMock: vi.fn(),
  verificationRefetchMock: vi.fn(),
  readinessRefetchMock: vi.fn(),
  payoutsRefetchMock: vi.fn(),
  overviewRefetchMock: vi.fn(),
  refreshStripeMock: vi.fn(),
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useBarberFintechReadinessQueryMock: vi.fn(),
  useBarberPayoutsQueryMock: vi.fn(),
  useCreateStripeDashboardLinkMutationMock: vi.fn(),
  useCreateStripeOnboardingLinkMutationMock: vi.fn(),
  useRefreshStripeConnectedAccountMutationMock: vi.fn(),
  useRecordLegalAcceptanceMutationMock: vi.fn(),
  useCreateVerificationUploadMutationMock: vi.fn(),
  useStartBarberIdentitySessionMutationMock: vi.fn(),
  useSubmitBarberVerificationMutationMock: vi.fn(),
  useVerificationMeMock: vi.fn(),
  useBarberTrustSummaryMock: vi.fn(),
  useBarberTeamInvitesQueryMock: vi.fn(),
  useBarberJoinableShopsQueryMock: vi.fn(),
  useBarberOverviewQueryMock: vi.fn(),
  useRespondBarberTeamInviteMutationMock: vi.fn(),
  useSaveBarberSubtypeMutationMock: vi.fn(),
  useUpdateBarberBookingLocationMutationMock: vi.fn(),
  useUpdateBarberActivationAvailabilityMutationMock: vi.fn(),
  useUpdateBarberActivationMutationMock: vi.fn(),
  useUpdateBarberStatusMutationMock: vi.fn(),
  useCreateMarketplaceServiceMutationMock: vi.fn(),
  useMarketplaceServiceCatalogMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Log out</button>
}));

vi.mock("@/components/operations/barber-earnings-workspace", () => ({
  BarberEarningsWorkspace: () => <div data-testid="earnings-workspace" />
}));

vi.mock("@/components/operations/barber-schedule-workspace", () => ({
  BarberScheduleWorkspace: () => <div data-testid="schedule-workspace" />
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useBarberFintechReadinessQuery: useBarberFintechReadinessQueryMock,
  useBarberPayoutsQuery: useBarberPayoutsQueryMock,
  useCreateStripeDashboardLinkMutation: useCreateStripeDashboardLinkMutationMock,
  useCreateStripeOnboardingLinkMutation: useCreateStripeOnboardingLinkMutationMock,
  useRefreshStripeConnectedAccountMutation: useRefreshStripeConnectedAccountMutationMock,
  useRecordLegalAcceptanceMutation: useRecordLegalAcceptanceMutationMock
}));

vi.mock("@/lib/trust/client", () => ({
  useCreateVerificationUploadMutation: useCreateVerificationUploadMutationMock,
  useStartBarberIdentitySessionMutation: useStartBarberIdentitySessionMutationMock,
  useSubmitBarberVerificationMutation: useSubmitBarberVerificationMutationMock,
  useVerificationMe: useVerificationMeMock,
  useBarberTrustSummary: useBarberTrustSummaryMock
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useBarberTeamInvitesQuery: useBarberTeamInvitesQueryMock,
  useBarberJoinableShopsQuery: useBarberJoinableShopsQueryMock,
  useBarberOverviewQuery: useBarberOverviewQueryMock,
  useRespondBarberTeamInviteMutation: useRespondBarberTeamInviteMutationMock,
  useSaveBarberSubtypeMutation: useSaveBarberSubtypeMutationMock,
  useUpdateBarberBookingLocationMutation: useUpdateBarberBookingLocationMutationMock,
  useUpdateBarberActivationAvailabilityMutation: useUpdateBarberActivationAvailabilityMutationMock,
  useUpdateBarberActivationMutation: useUpdateBarberActivationMutationMock,
  useUpdateBarberStatusMutation: useUpdateBarberStatusMutationMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useCreateMarketplaceServiceMutation: useCreateMarketplaceServiceMutationMock,
  useMarketplaceServiceCatalog: useMarketplaceServiceCatalogMock
}));

import { BarberSettingsScreen } from "@/components/barber-experience/barber-settings-screen";

function buildConnectedAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acct-row-1",
    subjectType: "barber",
    provider: "stripe_connect",
    operationalStatus: "onboarding_required",
    providerAccountId: "acct_test_123",
    onboardingStatus: "submitted",
    payoutReadinessStatus: "not_ready",
    legalReadinessStatus: "accepted",
    taxReadinessStatus: "verified",
    chargesEnabled: true,
    payoutsEnabled: true,
    requirementsCurrentlyDue: ["individual.ssn_last_4"],
    requirementsEventuallyDue: [],
    requirementsPastDue: [],
    missingAgreements: [],
    outdatedAgreements: [],
    missingSteps: ["Stripe requirements are still due."],
    disabledReason: null,
    lastCheckedAt: "2026-05-05T12:00:00.000Z",
    onboardingStartedAt: "2026-05-05T11:00:00.000Z",
    onboardingCompletedAt: null,
    processorLastSyncedAt: "2026-05-05T12:00:00.000Z",
    processorLastEventId: "evt_1",
    processorLastEventType: "account.updated",
    dashboardLastAccessedAt: null,
    createdAt: "2026-05-05T10:00:00.000Z",
    updatedAt: "2026-05-05T12:00:00.000Z",
    ...overrides
  };
}

function setupHookMocks() {
  mediaRefetchMock.mockResolvedValue({});
  trustRefetchMock.mockResolvedValue({});
  verificationRefetchMock.mockResolvedValue({});
  readinessRefetchMock.mockResolvedValue({});
  payoutsRefetchMock.mockResolvedValue({});
  overviewRefetchMock.mockResolvedValue({});
  refreshStripeMock.mockResolvedValue({ account: buildConnectedAccount({ requirementsCurrentlyDue: [] }) });

  useProfileMediaWorkspaceQueryMock.mockReturnValue({
    data: {
      viewer: {
        profilePhotoUrl: null,
        notificationPreference: {
          inAppEnabled: true,
          emailEnabled: true,
          smsEnabled: false,
          pushEnabled: false
        }
      },
      barberProfile: {
        profilePhotoUrl: null,
        visibilityState: "public"
      }
    },
    error: null,
    refetch: mediaRefetchMock
  });
  useMutateProfileMediaMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useBarberFintechReadinessQueryMock.mockReturnValue({
    data: {
      barberId: "barber-blaze",
      barberName: "Blaze King",
      connectedAccount: buildConnectedAccount(),
      stripeEnvironment: {
        mode: "test",
        label: "Stripe test mode - not live payouts.",
        blocksLivePayouts: true
      },
      agreements: [],
      memberships: [],
      routingSummary: {
        blockedPaymentsCount: 0,
        pendingPaymentsCount: 0,
        readyForPayoutAmount: 0,
        blockedReasons: []
      },
      blockedPayments: []
    },
    error: null,
    refetch: readinessRefetchMock
  });
  useBarberPayoutsQueryMock.mockReturnValue({
    data: {
      summary: {
        readyForPayoutAmount: 0,
        executableRoutingRecords: 0
      }
    },
    error: null,
    refetch: payoutsRefetchMock
  });
  useCreateStripeDashboardLinkMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useCreateStripeOnboardingLinkMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useRefreshStripeConnectedAccountMutationMock.mockReturnValue({ mutateAsync: refreshStripeMock, isPending: false });
  useRecordLegalAcceptanceMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useCreateVerificationUploadMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useStartBarberIdentitySessionMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useSubmitBarberVerificationMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useVerificationMeMock.mockReturnValue({
    data: {
      profiles: [{
        role: "barber",
        overallStatus: "approved",
        currentRequirements: []
      }]
    },
    error: null,
    refetch: verificationRefetchMock
  });
  useBarberTrustSummaryMock.mockReturnValue({
    data: {
      canonicalOverallStatus: "approved",
      verificationDecision: {
        gates: {
          badge: {
            allowed: true,
            reasons: []
          }
        }
      }
    },
    error: null,
    refetch: trustRefetchMock
  });
  useBarberTeamInvitesQueryMock.mockReturnValue({
    data: { invites: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn()
  });
  useBarberJoinableShopsQueryMock.mockReturnValue({
    data: { shops: [] },
    error: null,
    refetch: vi.fn()
  });
  useBarberOverviewQueryMock.mockReturnValue({
    data: {
      todayAppointments: [],
      shops: [],
      workingHours: [{ weekday: 1, startTime: "12:00", endTime: "19:00" }],
      earnings: {
        grossSales: 0
      },
      activationSetup: {
        hasAvailabilityDraft: true,
        hasServiceLocation: true,
        locationMode: "custom"
      },
      status: {
        isOnline: true,
        liveStatus: "available",
        acceptsWalkIns: true,
        currentShopId: null
      }
    },
    error: null,
    refetch: overviewRefetchMock
  });
  useRespondBarberTeamInviteMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useSaveBarberSubtypeMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useUpdateBarberBookingLocationMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useUpdateBarberActivationAvailabilityMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useUpdateBarberActivationMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useUpdateBarberStatusMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useCreateMarketplaceServiceMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useMarketplaceServiceCatalogMock.mockReturnValue({
    data: {
      editableServices: [{ service: { id: "svc-1", name: "Haircut", isActive: true, isBookable: true } }],
      readOnlyServices: []
    },
    error: null,
    refetch: vi.fn()
  });
}

describe("BarberSettingsScreen Stripe return sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHookMocks();
  });

  it("syncs Stripe payout readiness when returning from Connect onboarding", async () => {
    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} stripeReturnState="return" embedded />);

    await waitFor(() => expect(refreshStripeMock).toHaveBeenCalledWith({}));
    await waitFor(() => expect(readinessRefetchMock).toHaveBeenCalled());
    expect(await screen.findByText("Stripe onboarding returned. Payout readiness synced from Stripe.")).toBeInTheDocument();
  });

  it("offers a manual refresh action near the payout blocker", async () => {
    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} embedded />);

    fireEvent.click(screen.getAllByRole("button", { name: "Refresh payout status" })[0]);

    await waitFor(() => expect(refreshStripeMock).toHaveBeenCalledWith({}));
  });

  it("shows eligible payout balance separately from released balance", async () => {
    useBarberPayoutsQueryMock.mockReturnValue({
      data: {
        summary: {
          eligiblePayoutAmount: 4.75,
          eligibleRoutingRecords: 1,
          readyForPayoutAmount: 0,
          executableRoutingRecords: 0,
          executedAmount: 0
        }
      },
      error: null,
      refetch: payoutsRefetchMock
    });

    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} embedded />);

    expect(screen.getByText("Eligible balance")).toBeInTheDocument();
    expect(screen.getByText("$4.75")).toBeInTheDocument();
    expect(screen.getByText("1 payout-ready routing records")).toBeInTheDocument();
    expect(screen.getByText("Released balance $0.00")).toBeInTheDocument();
  });
});
