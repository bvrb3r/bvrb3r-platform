import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  useCreateBarberPayoutOnboardingLinkMutationMock,
  useCreateStripeDashboardLinkMutationMock,
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
  createMessageThreadMock,
  useCreateMarketplaceServiceMutationMock,
  useCreateMessageThreadMutationMock,
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
  useCreateBarberPayoutOnboardingLinkMutationMock: vi.fn(),
  useCreateStripeDashboardLinkMutationMock: vi.fn(),
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
  createMessageThreadMock: vi.fn(),
  useCreateMarketplaceServiceMutationMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn(),
  useMarketplaceServiceCatalogMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
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
  useCreateBarberPayoutOnboardingLinkMutation: useCreateBarberPayoutOnboardingLinkMutationMock,
  useCreateStripeDashboardLinkMutation: useCreateStripeDashboardLinkMutationMock,
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

vi.mock("@/lib/messages/client", () => ({
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock
}));

import { BarberSettingsScreen } from "@/components/barber-experience/barber-settings-screen";

const emptySalesTrend = {
  today: [],
  week: [],
  month: [],
  year: []
};

const mixedSalesTrend = {
  today: [
    { label: "12 AM", cashCents: 0, cardAppCents: 0, grossCents: 0 },
    { label: "1 PM", cashCents: 3500, cardAppCents: 500, grossCents: 4000 }
  ],
  week: [
    { label: "Sun", cashCents: 7000, cardAppCents: 500, grossCents: 7500 },
    { label: "Mon", cashCents: 0, cardAppCents: 0, grossCents: 0 }
  ],
  month: [
    { label: "Week 1", cashCents: 3500, cardAppCents: 500, grossCents: 4000 }
  ],
  year: [
    { label: "May", cashCents: 3500, cardAppCents: 500, grossCents: 4000 }
  ]
};

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

function buildStripePayoutReadiness(overrides: Record<string, unknown> = {}) {
  return {
    barberId: "barber-blaze",
    stripeConnectAccountId: "acct_test_123",
    hasAccount: true,
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    currentlyDue: ["individual.ssn_last_4"],
    eventuallyDue: [],
    pastDue: [],
    disabledReason: null,
    canReceivePayouts: false,
    requiresOnboarding: true,
    displayStatus: "incomplete",
    displayMessage: "Missing: individual.ssn_last_4.",
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
        publicUsername: "phillipforsure",
        profilePhotoUrl: null,
        visibilityState: "public",
        publicAddress: "8516 Island Breeze Ln",
        publicCity: "Temple Terrace",
        publicState: "FL",
        publicZip: "33607",
        serviceAreaLabel: "8516 Island Breeze Ln - Temple Terrace, FL 33607 • Independent barber • Freelance service area"
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
      stripePayoutReadiness: buildStripePayoutReadiness(),
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
      },
      salesTrend: emptySalesTrend
    },
    error: null,
    refetch: payoutsRefetchMock
  });
  useCreateStripeDashboardLinkMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useCreateBarberPayoutOnboardingLinkMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
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
        locationMode: "custom",
        serviceLocationLabel: "8516 Island Breeze Ln - Temple Terrace, FL 33607 • Independent barber • Freelance service area"
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
  createMessageThreadMock.mockResolvedValue({ thread: { id: "thread-1" } });
  useCreateMessageThreadMutationMock.mockReturnValue({ mutateAsync: createMessageThreadMock, isPending: false });
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

  it("renders the barber More control center with one heading and the identity card first", () => {
    render(<BarberSettingsScreen user={{ ...resolveDemoUser("blaze@bvrb3r.demo"), appApprovalStatus: "approved" }} />);

    expect(screen.getAllByRole("heading", { name: "More" })).toHaveLength(1);
    const identityCard = screen.getByTestId("barber-more-identity-card");
    expect(screen.queryByText("Your barber setup")).not.toBeInTheDocument();
    expect(identityCard).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Account" }));
    expect(screen.getByRole("dialog", { name: "Edit Account" })).toBeInTheDocument();
    expect(screen.getByLabelText("BVRB3R Username")).toBeInTheDocument();
    expect(screen.queryByLabelText("Public display name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone Number")).toBeInTheDocument();
    expect(screen.getByText("Default Payment Method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Payment Method" })).toBeInTheDocument();
    expect(screen.getByText("Payout Method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Payout Method" })).toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Edit Account" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Public Profile" })).toHaveAttribute("href", "/dashboard/barber/profile");
    expect(screen.queryByRole("link", { name: "View Public Profile" })).not.toBeInTheDocument();
    expect(within(identityCard).getByRole("heading", { name: "Blaze King" })).toBeInTheDocument();
    expect(within(identityCard).getByText("BARBER ACCOUNT")).toBeInTheDocument();
    expect(within(identityCard).getAllByText("blaze@bvrb3r.demo")).toHaveLength(1);
    expect(within(identityCard).queryByText("Freelance")).not.toBeInTheDocument();
    expect(within(identityCard).getByText("Account approved")).toBeInTheDocument();
    expect(within(identityCard).getByText("License approved")).toBeInTheDocument();
    expect(within(identityCard).getByText("Payouts connected")).toBeInTheDocument();
    expect(within(identityCard).getByText("@phillipforsure")).toBeInTheDocument();
    expect(within(identityCard).getByText("8516 Island Breeze Ln - Temple Terrace, FL 33607")).toBeInTheDocument();
    expect(screen.getByText("Kiosk Settings")).toBeInTheDocument();
    expect(screen.getByText("4-digit PIN, walk-in booking, chair kiosk, and public booking mode")).toBeInTheDocument();
    expect(identityCard).not.toHaveTextContent("Independent barber");
    expect(identityCard).not.toHaveTextContent("Freelance service area");
    expect(identityCard).not.toHaveTextContent("Phils chair / 2172 University Square More / Tampa");
    expect(identityCard).not.toHaveTextContent("independent-barber-");
    expect(screen.getByText("BVRB3R App Settings")).toBeInTheDocument();
    expect(screen.getByText("Notifications & Alerts")).toBeInTheDocument();
    expect(screen.getByText("Messages, reminders, booking alerts, payout alerts, and business alerts")).toBeInTheDocument();
    expect(screen.getByText("Barber Business Settings")).toBeInTheDocument();
    ["Service Library", "Hours", "Booking Rules", "Shop Relationship", "Kiosk Settings", "Performance"].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Alerts")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Account Name, contact, and profile photo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Public Profile Barber brand/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Help Support resources/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Payout Balance")).not.toBeInTheDocument();
    expect(screen.queryByText("Receipts")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments & Banking" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wallet \/ Billing Default payment method/ })).toHaveAttribute("href", "/dashboard/barber/more?section=wallet");
    expect(screen.getByRole("heading", { name: "Compliance & Security" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Stripe Connect Payout account and readiness/ })).toHaveAttribute("href", "/dashboard/barber/more?section=payouts");
    expect(screen.getByRole("button", { name: /Transactions Sales and receipts/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Identity Verification Identity review and account proofing/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Legal Agreements and policies/ })).toBeInTheDocument();
    expect(screen.queryByText("Quick Actions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("keeps the canonical public location for freelance barbers even with an accepted shop link", () => {
    useBarberFintechReadinessQueryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        connectedAccount: buildConnectedAccount(),
        stripePayoutReadiness: buildStripePayoutReadiness(),
        stripeEnvironment: {
          mode: "test",
          label: "Stripe test mode - not live payouts.",
          blocksLivePayouts: true
        },
        agreements: [],
        memberships: [{ id: "membership-1", shopId: "shop-legacy", shopLabel: "Legacy Shop", status: "accepted" }],
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
    useBarberOverviewQueryMock.mockReturnValue({
      data: {
        todayAppointments: [],
        shops: [{ id: "shop-legacy", label: "Phils chair / 2172 University Square More / Tampa • Independent barber • Freelance service area" }],
        workingHours: [{ weekday: 1, startTime: "12:00", endTime: "19:00" }],
        earnings: {
          grossSales: 0
        },
        activationSetup: {
          hasAvailabilityDraft: true,
          hasServiceLocation: true,
          locationMode: "shop",
          serviceLocationLabel: "Phils chair / 2172 University Square More / Tampa • Independent barber • Freelance service area"
        },
        status: {
          isOnline: true,
          liveStatus: "available",
          acceptsWalkIns: true,
          currentShopId: "shop-legacy"
        }
      },
      error: null,
      refetch: overviewRefetchMock
    });

    render(<BarberSettingsScreen user={{ ...resolveDemoUser("blaze@bvrb3r.demo"), barberSubtype: "freelance", appApprovalStatus: "approved" }} />);

    const identityCard = screen.getByTestId("barber-more-identity-card");
    expect(within(identityCard).getByText("@phillipforsure")).toBeInTheDocument();
    expect(within(identityCard).getByText("8516 Island Breeze Ln - Temple Terrace, FL 33607")).toBeInTheDocument();
    expect(identityCard).not.toHaveTextContent("Independent barber");
    expect(identityCard).not.toHaveTextContent("Freelance service area");
    expect(identityCard).not.toHaveTextContent("Phils chair / 2172 University Square More / Tampa");
  });

  it("syncs Stripe payout readiness when returning from Connect onboarding", async () => {
    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} stripeReturnState="return" embedded />);

    await waitFor(() => expect(refreshStripeMock).toHaveBeenCalledWith({}));
    await waitFor(() => expect(readinessRefetchMock).toHaveBeenCalled());
    expect(await screen.findByText("Stripe onboarding returned. Payout readiness synced from Stripe.")).toBeInTheDocument();
  });

  it("offers a manual refresh action near the payout blocker", async () => {
    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} initialSection="payouts" embedded />);

    fireEvent.click(screen.getAllByRole("button", { name: "Refresh payout status" })[0]);

    await waitFor(() => expect(refreshStripeMock).toHaveBeenCalledWith({}));
  });

  it("shows the Stripe payout setup reason and resume action", () => {
    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} initialSection="payouts" embedded />);

    expect(screen.getAllByText("Payout setup required").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing: individual.ssn_last_4.").length).toBeGreaterThan(0);
    expect(screen.getByText("individual.ssn_last_4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume Stripe Setup" })).toBeInTheDocument();
  });

  it("shows internal payout review without telling the barber to resume Stripe setup", () => {
    useBarberFintechReadinessQueryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        connectedAccount: buildConnectedAccount({
          payoutReadinessStatus: "needs_attention",
          legalReadinessStatus: "pending",
          requirementsCurrentlyDue: [],
          requirementsPastDue: [],
          chargesEnabled: true,
          payoutsEnabled: true
        }),
        stripePayoutReadiness: buildStripePayoutReadiness({
          currentlyDue: [],
          canReceivePayouts: false,
          requiresOnboarding: false,
          displayStatus: "internal_review",
          displayMessage: "Payout setup pending BVRB3R review."
        }),
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
          readyForPayoutAmount: 91.2,
          blockedReasons: []
        },
        blockedPayments: []
      },
      error: null,
      refetch: readinessRefetchMock
    });

    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} initialSection="payouts" embedded />);

    expect(screen.getAllByText("Payout setup pending BVRB3R review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Payout setup pending BVRB3R review.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Resume Stripe Setup" })).not.toBeInTheDocument();
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

    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} initialSection="payouts" embedded />);

    expect(screen.getByText("Eligible balance")).toBeInTheDocument();
    expect(screen.getAllByText("$4.75").length).toBeGreaterThan(0);
    expect(screen.getByText("1 payout-ready routing records")).toBeInTheDocument();
    expect(screen.getByText("Released balance $0.00")).toBeInTheDocument();
  });

  it("separates cash, card/app, payout eligible, and gross money posture", () => {
    useBarberPayoutsQueryMock.mockReturnValue({
      data: {
        summary: {
          eligiblePayoutAmount: 4.75,
          eligibleRoutingRecords: 1,
          readyForPayoutAmount: 0,
          executableRoutingRecords: 0,
          executedAmount: 0
        },
        moneyPosture: {
          cashCollectedToday: 35,
          cardAppCollectedToday: 5,
          appPayoutEligible: 4.75,
          grossTotalToday: 40,
          paidAppointmentsCount: 1,
          cashSalesCount: 1,
          cardPosSalesCount: 0,
          pendingPaymentRequestsCount: 1,
          releasedPayoutAmount: 0
        },
        transactions: [],
        salesTrend: mixedSalesTrend,
        recentExecutions: []
      },
      error: null,
      refetch: payoutsRefetchMock
    });

    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} initialSection="payouts" embedded />);

    expect(screen.getByText("Cash Collected Today")).toBeInTheDocument();
    expect(screen.getByText("$35")).toBeInTheDocument();
    expect(screen.getByText("Card/App Collected Today")).toBeInTheDocument();
    expect(screen.getAllByText("$5").length).toBeGreaterThan(0);
    expect(screen.getByText("App Payout Eligible")).toBeInTheDocument();
    expect(screen.getByText("Gross Total Today")).toBeInTheDocument();
    expect(screen.getByText("$40")).toBeInTheDocument();
    expect(screen.getByText("Eligible balance excludes cash.")).toBeInTheDocument();
  });

  it("renders a Sales Pulse chart with range totals inside Reports", () => {
    useBarberPayoutsQueryMock.mockReturnValue({
      data: {
        summary: {
          eligiblePayoutAmount: 4.75,
          eligibleRoutingRecords: 1,
          readyForPayoutAmount: 0,
          executableRoutingRecords: 0,
          executedAmount: 0
        },
        moneyPosture: {
          cashCollectedToday: 35,
          cardAppCollectedToday: 5,
          appPayoutEligible: 4.75,
          grossTotalToday: 40,
          paidAppointmentsCount: 1,
          cashSalesCount: 1,
          cardPosSalesCount: 1,
          pendingPaymentRequestsCount: 1,
          releasedPayoutAmount: 0
        },
        transactions: [],
        salesTrend: mixedSalesTrend,
        recentExecutions: []
      },
      error: null,
      refetch: payoutsRefetchMock
    });

    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} embedded />);

    fireEvent.click(screen.getByTestId("business-tool-reports"));
    const dialog = screen.getByRole("dialog", { name: "Reports" });

    expect(within(dialog).getByTestId("sales-pulse-section")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Sales Pulse").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Compare cash, card/app, and gross sales over time.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Week" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Month" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Year" })).toBeInTheDocument();
    expect(within(dialog).getByText("Cash: $35")).toBeInTheDocument();
    expect(within(dialog).getByText("Card/App: $5")).toBeInTheDocument();
    expect(within(dialog).getByText("Gross: $40")).toBeInTheDocument();
    expect(within(dialog).getByText("App Payout Eligible")).toBeInTheDocument();
    expect(within(dialog).getByText("Pending requests")).toBeInTheDocument();
    expect(within(dialog).queryByText("Gross: $75")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Week" }));

    expect(within(dialog).getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText("Cash: $70")).toBeInTheDocument();
    expect(within(dialog).getByText("Gross: $75")).toBeInTheDocument();
    expect(within(dialog).getByText("Sun")).toBeInTheDocument();
  });

  it("renders the Sales Pulse empty state when a range has no sales", () => {
    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} embedded />);

    fireEvent.click(screen.getByTestId("business-tool-reports"));
    const dialog = screen.getByRole("dialog", { name: "Reports" });

    expect(within(dialog).getByTestId("sales-pulse-section")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText("No sales recorded for this period yet.")).toBeInTheDocument();
    expect(within(dialog).getByText("Cash Collected Today")).toBeInTheDocument();
    expect(within(dialog).getByText("Gross Total Today")).toBeInTheDocument();
  });

  it("renders appointment, cash, and card request transactions with contact posture", () => {
    useBarberPayoutsQueryMock.mockReturnValue({
      data: {
        summary: {
          eligiblePayoutAmount: 4.75,
          eligibleRoutingRecords: 1,
          readyForPayoutAmount: 0,
          executableRoutingRecords: 0,
          executedAmount: 0
        },
        moneyPosture: {
          cashCollectedToday: 35,
          cardAppCollectedToday: 5,
          appPayoutEligible: 4.75,
          grossTotalToday: 40,
          paidAppointmentsCount: 1,
          cashSalesCount: 1,
          cardPosSalesCount: 0,
          pendingPaymentRequestsCount: 1,
          releasedPayoutAmount: 0
        },
        transactions: [
          {
            id: "appointment:pay-1",
            transactionType: "appointment",
            sourceId: "pay-1",
            appointmentId: "appt-1",
            posSaleId: null,
            paymentId: "pay-1",
            requestId: null,
            messageThreadId: null,
            clientId: "client-1",
            clientProfileId: "profile-client-1",
            customerName: "Jordan Client",
            customerPhone: "8135550101",
            customerEmail: "jordan@example.com",
            serviceLabel: "Haircut",
            note: null,
            occurredAt: "2026-05-24T14:00:00.000Z",
            paymentMethodLabel: "Card/App",
            grossAmount: 5,
            platformFeeAmount: 0.25,
            barberPayoutAmount: 4.75,
            status: "completed",
            statusLabel: "Completed / Paid",
            postureLabel: "Collected through BVRB3R. Eligible after routing.",
            canMessage: true
          },
          {
            id: "pos:cash-1",
            transactionType: "pos_cash",
            sourceId: "cash-1",
            appointmentId: null,
            posSaleId: "cash-1",
            paymentId: null,
            requestId: null,
            messageThreadId: null,
            clientId: null,
            clientProfileId: null,
            customerName: "Walk-in customer",
            customerPhone: "8135550202",
            customerEmail: null,
            serviceLabel: "Custom Amount",
            note: null,
            occurredAt: "2026-05-24T13:00:00.000Z",
            paymentMethodLabel: "Cash",
            grossAmount: 35,
            platformFeeAmount: 0,
            barberPayoutAmount: null,
            status: "paid",
            statusLabel: "Cash recorded",
            postureLabel: "Cash collected directly. No platform payout.",
            canMessage: false
          },
          {
            id: "pos:card-9",
            transactionType: "pos_card",
            sourceId: "card-9",
            appointmentId: null,
            posSaleId: "pos-sale-card-9",
            paymentId: "payment-card-9",
            requestId: "request-card-9",
            messageThreadId: "thread-card-9",
            clientId: "client-phillip",
            clientProfileId: "profile-client-phillip",
            customerName: "Phillip mcgee",
            customerPhone: "8135550909",
            customerEmail: "phillip@example.com",
            serviceLabel: "Custom Amount",
            note: null,
            occurredAt: "2026-05-24T12:30:00.000Z",
            paymentMethodLabel: "Card on File",
            grossAmount: 9,
            platformFeeAmount: 0.45,
            barberPayoutAmount: 8.55,
            shopSplitAmount: 0,
            routingModel: "freelance",
            payoutReadinessStatus: "ready",
            moneyRoutingStatus: "pending",
            status: "paid",
            statusLabel: "Paid",
            postureLabel: "Collected through BVRB3R. Eligible after routing.",
            canMessage: true
          },
          {
            id: "pos:booth-rent-card",
            transactionType: "pos_card",
            sourceId: "booth-rent-card",
            appointmentId: null,
            posSaleId: "pos-sale-booth-rent-card",
            paymentId: "payment-booth-rent-card",
            requestId: "request-booth-rent-card",
            messageThreadId: "thread-booth-rent-card",
            clientId: "client-booth-rent",
            clientProfileId: "profile-client-booth-rent",
            customerName: "Booth Client",
            customerPhone: "8135550808",
            customerEmail: "booth@example.com",
            serviceLabel: "Custom Amount",
            note: null,
            occurredAt: "2026-05-24T12:15:00.000Z",
            paymentMethodLabel: "Card on File",
            grossAmount: 100,
            platformFeeAmount: 5,
            barberPayoutAmount: 95,
            shopSplitAmount: 0,
            routingModel: "booth_rent",
            payoutReadinessStatus: "ready",
            moneyRoutingStatus: "pending",
            status: "paid",
            statusLabel: "Paid",
            postureLabel: "Collected through BVRB3R. Eligible after routing.",
            canMessage: true
          },
          {
            id: "pos:card-released",
            transactionType: "pos_card",
            sourceId: "card-released",
            appointmentId: null,
            posSaleId: "pos-sale-card-released",
            paymentId: "payment-card-released",
            requestId: "request-card-released",
            messageThreadId: "thread-card-released",
            clientId: "client-released",
            clientProfileId: "profile-client-released",
            customerName: "Released Client",
            customerPhone: null,
            customerEmail: "released@example.com",
            serviceLabel: "Custom Amount",
            note: null,
            occurredAt: "2026-05-24T12:10:00.000Z",
            paymentMethodLabel: "Card on File",
            grossAmount: 20,
            platformFeeAmount: 1,
            barberPayoutAmount: 19,
            shopSplitAmount: 0,
            routingModel: "freelance",
            eligibleAt: "2026-05-24T12:10:00.000Z",
            releasedAt: "2026-05-24T13:10:00.000Z",
            payoutExecutionStatus: "executed",
            payoutFailureReason: null,
            payoutReadinessStatus: "ready",
            moneyRoutingStatus: "paid_out",
            status: "paid",
            statusLabel: "Paid",
            postureLabel: "Collected through BVRB3R. Eligible after routing.",
            canMessage: true
          },
          {
            id: "pos:request-1",
            transactionType: "pos_request",
            sourceId: "request-1",
            appointmentId: null,
            posSaleId: "sale-request-1",
            paymentId: null,
            requestId: "request-1",
            messageThreadId: "thread-2",
            clientId: "client-2",
            clientProfileId: "profile-client-2",
            customerName: "Riley Client",
            customerPhone: null,
            customerEmail: "riley@example.com",
            serviceLabel: "Custom Amount",
            note: null,
            occurredAt: "2026-05-24T12:00:00.000Z",
            paymentMethodLabel: "Card on File",
            grossAmount: 35,
            platformFeeAmount: 0,
            barberPayoutAmount: null,
            status: "payment_pending",
            statusLabel: "Pending approval",
            postureLabel: "Awaiting client approval.",
            canMessage: true
          },
          {
            id: "pos:missing-receipt",
            transactionType: "pos_card",
            sourceId: "missing-receipt",
            appointmentId: null,
            posSaleId: null,
            paymentId: null,
            requestId: null,
            messageThreadId: null,
            clientId: null,
            clientProfileId: null,
            customerName: "Missing Sale",
            customerPhone: null,
            customerEmail: null,
            serviceLabel: "Custom Amount",
            note: null,
            occurredAt: "2026-05-24T11:45:00.000Z",
            paymentMethodLabel: "Card on File",
            grossAmount: 9,
            platformFeeAmount: 0.45,
            barberPayoutAmount: 8.55,
            shopSplitAmount: 0,
            payoutReadinessStatus: "ready",
            moneyRoutingStatus: "pending",
            status: "paid",
            statusLabel: "Paid",
            postureLabel: "Collected through BVRB3R. Eligible after routing.",
            canMessage: false
          },
          {
            id: "pos:request-declined",
            transactionType: "pos_request",
            sourceId: "request-declined",
            appointmentId: null,
            posSaleId: "sale-request-declined",
            paymentId: null,
            requestId: "request-declined",
            messageThreadId: "thread-declined",
            clientId: "client-3",
            clientProfileId: "profile-client-3",
            customerName: "Avery Client",
            customerPhone: null,
            customerEmail: "avery@example.com",
            serviceLabel: "Custom Amount",
            note: null,
            occurredAt: "2026-05-24T11:30:00.000Z",
            paymentMethodLabel: "Card on File",
            grossAmount: 35,
            platformFeeAmount: 0,
            barberPayoutAmount: null,
            status: "voided",
            statusLabel: "Declined",
            postureLabel: "No payment collected.",
            canMessage: true
          }
        ],
        salesTrend: mixedSalesTrend,
        recentExecutions: []
      },
      error: null,
      refetch: payoutsRefetchMock
    });

    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} embedded />);

    expect(screen.queryByText("Paid appointments and receipts")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("business-tool-transactions"));

    const dialog = screen.getByRole("dialog", { name: "Transactions" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByTestId("transactions-ledger-feed")).toBeInTheDocument();
    expect(within(dialog).getByText("Jordan Client")).toBeInTheDocument();
    expect(within(dialog).getByText("Walk-in customer")).toBeInTheDocument();
    expect(within(dialog).getByText("Phillip mcgee")).toBeInTheDocument();
    expect(within(dialog).getByText("Booth Client")).toBeInTheDocument();
    expect(within(dialog).getByText("Released Client")).toBeInTheDocument();
    expect(within(dialog).getByText("Riley Client")).toBeInTheDocument();
    expect(within(dialog).getByText("Missing Sale")).toBeInTheDocument();
    expect(within(dialog).getByText("Avery Client")).toBeInTheDocument();
    expect(within(dialog).getByText(/Cash \| \$35/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Card\/App \| \$5/)).toBeInTheDocument();
    expect(within(screen.getByTestId("transaction-row-pos:card-9")).getByText(/Card on File \| \$9/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Pending approval/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Declined \| No payment collected\./)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Request closed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Message unavailable" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Message" })).toHaveLength(6);

    fireEvent.click(within(screen.getByTestId("transaction-row-pos:card-9")).getByRole("button", { name: "Receipt" }));
    const cardReceipt = screen.getByRole("dialog", { name: "Transaction receipt" });
    expect(within(cardReceipt).getByText("Phillip mcgee")).toBeInTheDocument();
    expect(within(cardReceipt).getByText("Card on File")).toBeInTheDocument();
    expect(within(cardReceipt).getByText("$9.00")).toBeInTheDocument();
    expect(within(cardReceipt).getByText("$0.45")).toBeInTheDocument();
    expect(within(cardReceipt).getByText("$8.55")).toBeInTheDocument();
    expect(within(cardReceipt).getByText("Ready")).toBeInTheDocument();
    expect(within(cardReceipt).getByText("Pending")).toBeInTheDocument();
    expect(within(cardReceipt).getByText("Payout timeline")).toBeInTheDocument();
    expect(within(cardReceipt).getByText("Waiting for BVRB3R release")).toBeInTheDocument();
    fireEvent.click(within(cardReceipt).getByLabelText("Close receipt"));

    fireEvent.click(within(screen.getByTestId("transaction-row-pos:card-released")).getByRole("button", { name: "Receipt" }));
    const releasedReceipt = screen.getByRole("dialog", { name: "Transaction receipt" });
    expect(within(releasedReceipt).getByText("Released Client")).toBeInTheDocument();
    expect(within(releasedReceipt).getByText("Released to payout account")).toBeInTheDocument();
    fireEvent.click(within(releasedReceipt).getByLabelText("Close receipt"));

    fireEvent.click(within(screen.getByTestId("transaction-row-pos:booth-rent-card")).getByRole("button", { name: "Receipt" }));
    const boothRentReceipt = screen.getByRole("dialog", { name: "Transaction receipt" });
    expect(within(boothRentReceipt).getByText("Booth Client")).toBeInTheDocument();
    expect(within(boothRentReceipt).getByText("Booth rent barber")).toBeInTheDocument();
    expect(within(boothRentReceipt).getAllByText("Service payout goes to barber after BVRB3R fee. Booth rent is billed separately.").length).toBeGreaterThan(0);
    expect(within(boothRentReceipt).getByText("$100.00")).toBeInTheDocument();
    expect(within(boothRentReceipt).getByText("$5.00")).toBeInTheDocument();
    expect(within(boothRentReceipt).getByText("$95.00")).toBeInTheDocument();
    expect(within(boothRentReceipt).getByText("$0.00")).toBeInTheDocument();
    expect(within(boothRentReceipt).queryByText(/Commission split/i)).not.toBeInTheDocument();
    fireEvent.click(within(boothRentReceipt).getByLabelText("Close receipt"));

    fireEvent.click(within(screen.getByTestId("transaction-row-pos:cash-1")).getByRole("button", { name: "Receipt" }));
    const cashReceipt = screen.getByRole("dialog", { name: "Transaction receipt" });
    expect(within(cashReceipt).getByText("Walk-in customer")).toBeInTheDocument();
    expect(within(cashReceipt).getByText("Cash")).toBeInTheDocument();
    expect(within(cashReceipt).getByText("$35.00")).toBeInTheDocument();
    expect(within(cashReceipt).getByText("Cash collected directly")).toBeInTheDocument();
    expect(within(cashReceipt).getByText("No platform payout")).toBeInTheDocument();
    fireEvent.click(within(cashReceipt).getByLabelText("Close receipt"));

    fireEvent.click(within(screen.getByTestId("transaction-row-pos:missing-receipt")).getByRole("button", { name: "Receipt" }));
    const missingReceipt = screen.getByRole("dialog", { name: "Transaction receipt" });
    expect(within(missingReceipt).getByText("Receipt data could not be loaded for this sale.")).toBeInTheDocument();
  });

  it("opens Manage Your Business tiles in compact modal workspaces", () => {
    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} embedded />);

    expect(screen.getByTestId("business-tool-services")).toBeInTheDocument();
    expect(screen.getByTestId("business-tool-availability")).toBeInTheDocument();
    expect(screen.getByTestId("business-tool-transactions")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Paid appointments and receipts")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("business-tool-services"));
    expect(screen.getByRole("dialog", { name: "Services" })).toBeInTheDocument();
    expect(screen.getAllByText("Haircut").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Close business tool"));
    fireEvent.click(screen.getByTestId("business-tool-availability"));

    const availabilityDialog = screen.getByRole("dialog", { name: "Availability" });
    expect(availabilityDialog).toBeInTheDocument();
    expect(within(availabilityDialog).getByRole("button", { name: "Hours" })).toBeInTheDocument();
    expect(within(availabilityDialog).getByRole("button", { name: "Blocked Time" })).toBeInTheDocument();
    expect(within(availabilityDialog).getByTestId("availability-hours-tab")).toBeInTheDocument();

    fireEvent.click(within(availabilityDialog).getByRole("button", { name: "Blocked Time" }));
    expect(within(availabilityDialog).getByTestId("availability-blocked-tab")).toBeInTheDocument();
  });

  it("opens booking, reports, verification, legal, and account nested workspaces", () => {
    render(<BarberSettingsScreen user={resolveDemoUser("blaze@bvrb3r.demo")} embedded />);

    fireEvent.click(screen.getByTestId("business-tool-booking"));
    let dialog = screen.getByRole("dialog", { name: "Booking Settings" });
    expect(within(dialog).getByText("Business Model")).toBeInTheDocument();
    expect(within(dialog).getByText("Booking Location")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId("booking-panel-business-model"));
    expect(within(dialog).getByRole("button", { name: "Save business model" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close business tool"));
    fireEvent.click(screen.getByTestId("business-tool-reports"));
    dialog = screen.getByRole("dialog", { name: "Reports" });
    expect(within(dialog).getByText("Cash Collected Today")).toBeInTheDocument();
    expect(within(dialog).getByText("Gross Total Today")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close business tool"));
    fireEvent.click(screen.getByTestId("business-tool-verification"));
    dialog = screen.getByRole("dialog", { name: "Verification" });
    expect(within(dialog).getByText("Identity Status")).toBeInTheDocument();
    expect(within(dialog).getByText("License Status")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close business tool"));
    fireEvent.click(screen.getByTestId("business-tool-legal"));
    dialog = screen.getByRole("dialog", { name: "Legal" });
    expect(within(dialog).getByText("Platform Terms")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Upload and submit" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("License Documents"));
    expect(within(dialog).getByRole("button", { name: "Upload and submit" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close business tool"));
    fireEvent.click(screen.getByTestId("business-tool-account"));
    dialog = screen.getByRole("dialog", { name: "Account Settings" });
    expect(within(dialog).getByText("Profile")).toBeInTheDocument();
    expect(within(dialog).getByText("Notifications")).toBeInTheDocument();
    expect(within(dialog).getByText("Security")).toBeInTheDocument();
    expect(within(dialog).getByText("System Info")).toBeInTheDocument();
  });
});
