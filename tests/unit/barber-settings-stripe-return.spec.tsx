import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  createMarketplaceServiceMutateMock,
  updateMarketplaceServiceMutateMock,
  useCreateMarketplaceServiceMutationMock,
  useUpdateMarketplaceServiceMutationMock,
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
  createMarketplaceServiceMutateMock: vi.fn(),
  updateMarketplaceServiceMutateMock: vi.fn(),
  useCreateMarketplaceServiceMutationMock: vi.fn(),
  useUpdateMarketplaceServiceMutationMock: vi.fn(),
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
  useUpdateMarketplaceServiceMutation: useUpdateMarketplaceServiceMutationMock,
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
  createMarketplaceServiceMutateMock.mockResolvedValue({ service: { id: "svc-created" } });
  useCreateMarketplaceServiceMutationMock.mockReturnValue({ mutateAsync: createMarketplaceServiceMutateMock, isPending: false });
  updateMarketplaceServiceMutateMock.mockResolvedValue({ service: { id: "svc-1" } });
  useUpdateMarketplaceServiceMutationMock.mockReturnValue({ mutateAsync: updateMarketplaceServiceMutateMock, isPending: false });
  useMarketplaceServiceCatalogMock.mockReturnValue({
    data: {
      editableServices: [
        { canEdit: true, service: { id: "svc-1", category: "Haircuts", name: "Haircut", description: "Clean cut", price: 35, durationMin: 45, bufferMin: 0, deposit: 0, fullPrepay: false, addOnIds: [], isActive: true, isBookable: true } },
        { canEdit: true, service: { id: "svc-archived", category: "Haircuts", name: "Archived Cut", description: "Removed service", price: 45, durationMin: 45, bufferMin: 0, deposit: 0, fullPrepay: false, addOnIds: [], isActive: false, isBookable: false } }
      ],
      readOnlyServices: []
    },
    error: null,
    refetch: vi.fn()
  });
}

describe("BarberSettingsScreen Stripe return sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, edges: [], events: [] })
    })) as unknown as typeof fetch;
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
    expect(screen.getByText("Saved clients, barbers, shops, styles, services, and platform items")).toBeInTheDocument();
    const barberNotificationRow = screen.getByRole("link", { name: /Notifications & Alerts Messages, reminders, booking alerts, payout alerts, and business alerts/ });
    const barberPreferencesRow = screen.getByRole("link", { name: /Preferences App experience, display, dashboard defaults, and business behavior/ });
    const barberSavedRow = screen.getByRole("link", { name: /Saved \/ Favorites Saved clients, barbers, shops, styles, services, and platform items/ });
    const barberActivityRow = screen.getByRole("link", { name: /Activity App activity, client activity, sales activity, and visit history/ });
    expect(barberNotificationRow.compareDocumentPosition(barberPreferencesRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(barberPreferencesRow.compareDocumentPosition(barberSavedRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(barberSavedRow.compareDocumentPosition(barberActivityRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByRole("link", { name: /Stripe Connect Manage bank accounts and payouts/ })).toHaveAttribute("href", "/dashboard/barber/more?section=payouts");
    expect(screen.getByRole("link", { name: /Barber Payouts Eligible balance, payout routing, payout holds/ })).toHaveAttribute("href", "/dashboard/barber/more?section=payouts");
    expect(screen.queryByText("Payout Status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Rewards Points, credits, loyalty progress, and referrals/ })).toHaveAttribute("href", "/rewards");
    expect(screen.getByRole("button", { name: /Transactions Barber sales, receipts, spending, refunds, failed payments, subscriptions, and payout movement/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Identity Verification Government ID or driver license/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /License Verification Barber license upload, license state/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Password & Login Password, sign-in method/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Account Security Email verification, phone verification/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Legal Barber terms, platform agreement/ })).toBeInTheDocument();
    expect(screen.queryByText("Quick Actions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("accepts a pending shop relationship invite with visible pending and connected states", async () => {
    const inviteRefetchMock = vi.fn().mockResolvedValue({});
    let resolveAccept!: (value: unknown) => void;
    const acceptPromise = new Promise((resolve) => {
      resolveAccept = resolve;
    });
    const respondInviteMock = vi.fn(() => acceptPromise);
    useBarberTeamInvitesQueryMock.mockReturnValue({
      data: {
        invites: [{
          id: "invite-shop",
          shopId: "shop-university",
          shopLabel: "The BVRB3R Shop | University Mall | Tampa",
          barberId: "barber-blaze",
          barberName: "Blaze King",
          barberEmail: "blaze@bvrb3r.demo",
          status: "invited",
          source: "owner_invite",
          message: null,
          createdAt: "2026-06-14T10:00:00.000Z",
          respondedAt: null,
          operatingModel: "booth_rent",
          boothRentAmount: 250,
          boothRentFrequency: "weekly",
          barberPercent: null,
          shopPercent: null,
          commissionCapAmount: null,
          commissionCapFrequency: null
        }]
      },
      isLoading: false,
      error: null,
      refetch: inviteRefetchMock
    });
    useRespondBarberTeamInviteMutationMock.mockReturnValue({ mutateAsync: respondInviteMock, isPending: false });

    render(<BarberSettingsScreen user={{ ...resolveDemoUser("blaze@bvrb3r.demo"), appApprovalStatus: "approved" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Shop Relationship Invites and operating model/i }));
    const dialog = screen.getByRole("dialog", { name: "Shop invitations" });
    expect(within(dialog).getByText("The BVRB3R Shop | University Mall | Tampa")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Accept" }));
    expect(respondInviteMock).toHaveBeenCalledWith({ inviteId: "invite-shop", status: "accepted" });
    expect(within(dialog).getByRole("button", { name: "Accepting..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Decline" })).toBeDisabled();

    await act(async () => {
      resolveAccept({
        invite: {
          id: "invite-shop",
          shopLabel: "The BVRB3R Shop | University Mall | Tampa",
          status: "active"
        }
      });
      await acceptPromise;
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Shop invitations" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Shop connected. The BVRB3R Shop | University Mall | Tampa is now active for your barber account.")).toBeInTheDocument();
    expect(inviteRefetchMock).toHaveBeenCalled();
    expect(overviewRefetchMock).toHaveBeenCalled();
    expect(readinessRefetchMock).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("keeps shop invite errors visible and re-enables controls", async () => {
    useBarberTeamInvitesQueryMock.mockReturnValue({
      data: {
        invites: [{
          id: "invite-shop",
          shopId: "shop-university",
          shopLabel: "The BVRB3R Shop | University Mall | Tampa",
          barberId: "barber-blaze",
          barberName: "Blaze King",
          barberEmail: "blaze@bvrb3r.demo",
          status: "invited",
          source: "owner_invite",
          message: null,
          createdAt: "2026-06-14T10:00:00.000Z",
          respondedAt: null,
          operatingModel: "booth_rent",
          boothRentAmount: 250,
          boothRentFrequency: "weekly",
          barberPercent: null,
          shopPercent: null,
          commissionCapAmount: null,
          commissionCapFrequency: null
        }]
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useRespondBarberTeamInviteMutationMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Unable to assign the barber to this shop.")),
      isPending: false
    });

    render(<BarberSettingsScreen user={{ ...resolveDemoUser("blaze@bvrb3r.demo"), appApprovalStatus: "approved" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Shop Relationship Invites and operating model/i }));
    const dialog = screen.getByRole("dialog", { name: "Shop invitations" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept" }));

    expect(await within(dialog).findByText("Unable to assign the barber to this shop.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Accept" })).not.toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Decline" })).not.toBeDisabled();
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

  it("opens shared More modals for route-backed barber rows and preserves business workspaces", async () => {
    render(<BarberSettingsScreen user={{ ...resolveDemoUser("blaze@bvrb3r.demo"), appApprovalStatus: "approved" }} />);

    fireEvent.click(screen.getByRole("link", { name: /Wallet \/ Billing Default payment method/ }));
    let dialog = screen.getByRole("dialog", { name: "Wallet / Billing" });
    expect(within(dialog).getByLabelText("Close setting modal")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save Changes" })).toBeDisabled();
    expect(within(dialog).getByText("Canonical save path required")).toBeInTheDocument();
    expect(within(dialog).getByText("Source of truth")).toBeInTheDocument();
    expect(within(dialog).getByText("Sync targets")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open full workspace" })).toHaveAttribute("href", "/dashboard/barber/more?section=wallet");
    expect(within(dialog).queryByText("Open attached destination")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("link", { name: /Preferences App experience, display, dashboard defaults, and business behavior/ }));
    dialog = screen.getByRole("dialog", { name: "Preferences" });
    const barberPreferenceSave = within(dialog).getByRole("button", { name: "Save Changes" });
    expect(barberPreferenceSave).toBeDisabled();
    expect(within(dialog).getAllByText("Dashboard defaults, chair workflow, client follow-up prompts, and business behavior.").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Default dashboard behavior")).toBeInTheDocument();
    expect(within(dialog).getByText("Client rebook prompts")).toBeInTheDocument();
    expect(within(dialog).getByText("Open slot suggestions")).toBeInTheDocument();
    expect(within(dialog).queryByText("Preferred contact channel")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Auto-book suggestions")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/Open slot suggestions/));
    expect(barberPreferenceSave).toBeEnabled();
    fireEvent.click(barberPreferenceSave);
    await waitFor(() => {
      const preferencesRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((call) => {
        const request = call[1] as RequestInit | undefined;
        return call[0] === "/api/settings/more" && String(request?.body).includes("update_app_preferences");
      })?.[1] as RequestInit | undefined;
      expect(preferencesRequest).toBeDefined();
      const preferencesValues = JSON.parse(String(preferencesRequest?.body)).values as Record<string, unknown>;
      expect(preferencesValues).toEqual(expect.objectContaining({ open_slot_suggestions_enabled: true }));
      expect(preferencesValues).not.toHaveProperty("preferred_contact_channel");
      expect(preferencesValues).not.toHaveProperty("auto_book_suggestions_enabled");
    });

    fireEvent.click(screen.getByRole("link", { name: /Notifications & Alerts Messages, reminders, booking alerts, payout alerts, and business alerts/ }));
    dialog = screen.getByRole("dialog", { name: "Notifications & Alerts" });
    const barberNotificationSave = within(dialog).getByRole("button", { name: "Save Changes" });
    expect(barberNotificationSave).toBeDisabled();
    expect(within(dialog).queryByText("Canonical save path required")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("Messages, booking alerts, payout alerts, schedule updates, and business alerts.").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Payout alerts")).toBeInTheDocument();
    expect(within(dialog).queryByText("Creator alerts")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Rewards alerts")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Quiet hours start")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Quiet hours end")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/SMS updates/));
    expect(barberNotificationSave).toBeEnabled();
    fireEvent.click(barberNotificationSave);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/settings/more", expect.objectContaining({
      method: "POST"
    })));
    const barberSettingsRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((call) => {
      const request = call[1] as RequestInit | undefined;
      return call[0] === "/api/settings/more" && String(request?.body).includes("update_notification_preferences");
    })?.[1] as RequestInit | undefined;
    const barberSettingsValues = JSON.parse(String(barberSettingsRequest?.body)).values as Record<string, unknown>;
    expect(barberSettingsValues).toEqual(expect.objectContaining({ sms_enabled: true, payout_alerts_enabled: true }));
    expect(barberSettingsValues).not.toHaveProperty("creator_alerts_enabled");
    expect(barberSettingsValues).not.toHaveProperty("rewards_alerts_enabled");
    expect(barberSettingsValues).not.toHaveProperty("quiet_hours_start");
    expect(barberSettingsValues).not.toHaveProperty("quiet_hours_end");

    fireEvent.click(screen.getByRole("link", { name: /Saved \/ Favorites Saved clients, barbers, shops, styles, services, and platform items/ }));
    dialog = screen.getByRole("dialog", { name: "Saved / Favorites" });
    expect(within(dialog).getByText("Saved clients")).toBeInTheDocument();
    expect(within(dialog).getByText("Saved marketplace items")).toBeInTheDocument();
    expect(within(dialog).getByText("Source of truth")).toBeInTheDocument();
    expect(within(dialog).getByText("Sync targets")).toBeInTheDocument();
    expect(within(dialog).getByText("Platform sync contract")).toBeInTheDocument();
    expect(within(dialog).getByText("Canonical save path required")).toBeInTheDocument();
    expect(within(dialog).getByText(/canonical role engagement graph/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save Changes" })).toBeDisabled();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        edges: [{ id: "edge-hidden", targetId: "client-raw-uuid" }],
        sections: [
          {
            key: "barber-saved-clients",
            title: "Saved clients",
            emptyText: "No saved clients yet.",
            items: [{ key: "safe-client", title: "Jordan Ellis", detail: "Private save record for a client.", meta: "Updated Jun 11, 2026" }]
          },
          { key: "barber-saved-marketplace", title: "Saved marketplace items", emptyText: "No saved marketplace items yet.", items: [] }
        ]
      })
    } as Response);
    fireEvent.click(within(dialog).getByRole("button", { name: "Load current records" }));
    expect(await within(dialog).findByText("Jordan Ellis")).toBeInTheDocument();
    expect(within(dialog).getByText("No saved marketplace items yet.")).toBeInTheDocument();
    expect(within(dialog).queryByText("client-raw-uuid")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("link", { name: /Activity App activity, client activity, sales activity, and visit history/ }));
    dialog = screen.getByRole("dialog", { name: "Activity" });
    expect(within(dialog).getByRole("button", { name: "Save Changes" })).toBeDisabled();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        events: [{ id: "activity-hidden", targetId: "service-raw-uuid" }],
        items: [{ key: "safe-activity", title: "Service Edited", detail: "Service edited on service.", meta: "Recorded Jun 11, 2026" }],
        emptyText: "No account activity yet."
      })
    } as Response);
    fireEvent.click(within(dialog).getByRole("button", { name: "Load current records" }));
    expect(await within(dialog).findByText("Service Edited")).toBeInTheDocument();
    expect(within(dialog).queryByText("service-raw-uuid")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByTestId("business-tool-services"));
    dialog = screen.getByRole("dialog", { name: "Services" });
    expect(screen.getByTestId("more-setting-modal-backdrop")).toHaveClass("fixed", "inset-0", "z-[9999]");
    expect(screen.getByTestId("business-tool-modal")).toHaveClass("relative", "z-[10000]");
    expect(screen.getByTestId("more-setting-modal-footer")).toHaveClass("sticky", "bottom-0", "z-20");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save Changes" })).toBeDisabled();
    expect(within(dialog).queryByRole("link", { name: /Edit services/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: /Checkout/i })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Add Service/ })).toBeInTheDocument();
    expect(within(dialog).queryByText("Archived services")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Archived Cut")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Edit service Haircut/ }));
    expect(within(dialog).getByLabelText("Service Name")).toHaveValue("Haircut");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Clean cut");
    expect(within(dialog).getByLabelText("Price")).toHaveValue("35");
    expect(within(dialog).getByLabelText("Duration minutes")).toHaveValue("45");
    const activeToggle = within(dialog).getByLabelText(/Active/);
    const bookableToggle = within(dialog).getByLabelText(/Bookable/);
    expect(activeToggle).toBeEnabled();
    expect(bookableToggle).toBeEnabled();
    expect(within(dialog).queryByText("Canonical save path required for active/bookable toggles")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remove Service" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Service" }));
    expect(within(dialog).getByText("Remove Haircut?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Existing appointments and receipts will not be changed/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Cancel" })[0]);
    expect(updateMarketplaceServiceMutateMock).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("Service Name")).toHaveValue("Haircut");
    fireEvent.change(within(dialog).getByLabelText("Service Name"), { target: { value: "Signature Cut" } });
    const activeToggleAfterCancel = within(dialog).getByLabelText(/Active/);
    const bookableToggleAfterCancel = within(dialog).getByLabelText(/Bookable/);
    fireEvent.click(activeToggleAfterCancel);
    expect(bookableToggleAfterCancel).not.toBeChecked();
    expect(bookableToggleAfterCancel).toBeDisabled();
    const serviceSaveButton = within(dialog).getAllByRole("button", { name: "Save Changes" }).find((button) => !button.hasAttribute("disabled"));
    expect(serviceSaveButton).toBeDefined();
    fireEvent.click(serviceSaveButton as HTMLElement);
    await waitFor(() => expect(updateMarketplaceServiceMutateMock).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: "svc-1",
      name: "Signature Cut",
      price: 35,
      durationMin: 45,
      active: false,
      bookable: false
    })));
    await waitFor(() => expect(within(dialog).queryByLabelText("Service Name")).not.toBeInTheDocument());

    fireEvent.click(within(dialog).getByRole("button", { name: /Add Service/ }));
    expect(within(dialog).getByLabelText("Service Name")).toHaveValue("");
    expect(within(dialog).getByLabelText(/Active/)).toBeEnabled();
    expect(within(dialog).getByLabelText(/Bookable/)).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText("Service Name"), { target: { value: "Line Up" } });
    const addSaveButton = within(dialog).getAllByRole("button", { name: "Save Changes" }).find((button) => !button.hasAttribute("disabled"));
    expect(addSaveButton).toBeDefined();
    fireEvent.click(addSaveButton as HTMLElement);
    await waitFor(() => expect(createMarketplaceServiceMutateMock).toHaveBeenCalledWith(expect.objectContaining({
      name: "Line Up",
      price: 35,
      durationMin: 45,
      active: true,
      bookable: true
    })));

    fireEvent.click(within(dialog).getByRole("button", { name: /Edit service Haircut/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Service" }));
    let resolveRemove!: () => void;
    const removePromise = new Promise<void>((resolve) => {
      resolveRemove = resolve;
    });
    updateMarketplaceServiceMutateMock.mockImplementationOnce(() => removePromise);
    const removeButton = within(dialog).getByRole("button", { name: "Remove Service" });
    fireEvent.click(removeButton);
    expect(await within(dialog).findByRole("button", { name: "Removing..." })).toBeDisabled();
    await act(async () => {
      resolveRemove();
      await removePromise;
    });
    await waitFor(() => expect(updateMarketplaceServiceMutateMock).toHaveBeenLastCalledWith({
      serviceId: "svc-1",
      active: false,
      bookable: false
    }));
    await waitFor(() => expect(overviewRefetchMock).toHaveBeenCalled());
    await waitFor(() => expect(within(dialog).queryByText("Remove Haircut?")).not.toBeInTheDocument());
    fireEvent.click(within(dialog).getByLabelText("Close business tool"));

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    dialog = screen.getByRole("dialog", { name: "Log Out" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Log out" })).toBeInTheDocument();
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
