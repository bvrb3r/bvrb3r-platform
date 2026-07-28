import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchitectAccountDetailPayload, ArchitectAccountDirectoryPayload, ArchitectDashboardPayload } from "@/types/platform-admin";

const {
  useArchitectAccountDirectoryQueryMock,
  useArchitectAccountDetailQueryMock,
  useArchitectAccountActionMutationMock,
  useArchitectBarberProfileRepairMutationMock,
  useArchitectClientPaymentRepairMutationMock,
  useArchitectVerificationActionMutationMock
} = vi.hoisted(() => ({
  useArchitectAccountDirectoryQueryMock: vi.fn(),
  useArchitectAccountDetailQueryMock: vi.fn(),
  useArchitectAccountActionMutationMock: vi.fn(),
  useArchitectBarberProfileRepairMutationMock: vi.fn(),
  useArchitectClientPaymentRepairMutationMock: vi.fn(),
  useArchitectVerificationActionMutationMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    href,
    ...props
  }: ComponentProps<"a"> & {
    children?: ReactNode;
    onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      {...props}
      href={typeof href === "string" ? href : "#"}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  )
}));

vi.mock("@/lib/platform-admin/client", () => ({
  useArchitectAccountDirectoryQuery: useArchitectAccountDirectoryQueryMock,
  useArchitectAccountDetailQuery: useArchitectAccountDetailQueryMock,
  useArchitectAccountActionMutation: useArchitectAccountActionMutationMock,
  useArchitectBarberProfileRepairMutation: useArchitectBarberProfileRepairMutationMock,
  useArchitectClientPaymentRepairMutation: useArchitectClientPaymentRepairMutationMock,
  useArchitectVerificationActionMutation: useArchitectVerificationActionMutationMock
}));

import { ArchitectAccountDirectoryWorkspace } from "@/components/operations/architect-account-directory-workspace";
import { ArchitectAccountDetailWorkspace } from "@/components/operations/architect-account-detail-workspace";
import { ArchitectDashboard } from "@/components/operations/architect-dashboard";

const directoryPayload: ArchitectAccountDirectoryPayload = {
  accounts: [
    {
      profileId: "profile-barber",
      authUserId: "profile-barber",
      profileExists: true,
      fullName: "Phillip McGee",
      email: "phillipmcgee813@gmail.com",
      role: "barber",
      roleLabel: "Barber",
      primaryOnboardingRole: "barber",
      onboardingState: "complete",
      accountStatus: "active",
      approvalStatus: "pending",
      verificationStatus: "pending",
      verificationProfileId: "verification-barber",
      barberId: "barber-1",
      barberReference: "barber-ref-1",
      barberSubtype: "solo",
      username: "phillipmcgee",
      serviceCount: 1,
      availabilityCount: 1,
      documentCount: 1,
      reviewCount: 0,
      marketplaceLive: false,
      clientHomeIncluded: false,
      searchIncluded: false,
      clientSearchIncluded: false,
      directSearchMatch: false,
      feedEligible: false,
      feedAssetCount: 0,
      publicRoute: "/barber/phillipmcgee",
      discoveryLocation: "Independent Studio, Tampa FL",
      payoutMode: "test",
      serviceLocationCount: 1,
      marketplaceBlockers: ["Barber approval pending"],
      searchText: "phillip mcgee phillipmcgee813@gmail.com barber"
    },
    {
      profileId: "profile-owner",
      authUserId: "profile-owner",
      profileExists: true,
      fullName: "BVRB3R Shop",
      email: "bvrb3r@gmail.com",
      role: "shop_owner",
      roleLabel: "Shop owner",
      primaryOnboardingRole: "shop_owner",
      onboardingState: "complete",
      accountStatus: "active",
      approvalStatus: "pending",
      verificationStatus: "pending",
      verificationProfileId: "verification-owner",
      shopId: "shop-1",
      shopName: "BVRB3R Studio",
      serviceCount: 0,
      availabilityCount: 0,
      documentCount: 0,
      reviewCount: 0,
      marketplaceLive: false,
      clientHomeIncluded: false,
      searchIncluded: false,
      clientSearchIncluded: false,
      directSearchMatch: false,
      feedEligible: false,
      feedAssetCount: 0,
      publicRoute: "/shop/shop-1",
      discoveryLocation: "Tampa, FL",
      payoutMode: "test",
      marketplaceBlockers: ["Shop approval pending"],
      searchText: "bvrb3r shop bvrb3r@gmail.com shop_owner bvrb3r studio"
    }
  ],
  counts: {
    totalAccounts: 2,
    totalClients: 0,
    totalBarbers: 1,
    totalShopOwners: 1,
    totalPlatformAdmins: 0,
    pendingBarberApprovals: 1,
    pendingShopOwnerApprovals: 1,
    approvedBarbers: 0,
    approvedShops: 0,
    suspendedAccounts: 0,
    bannedAccounts: 0
  },
  filters: { search: "", role: "all", status: "all" },
  warnings: []
};

const dashboardPayload: ArchitectDashboardPayload = {
  actorName: "BVRB3R Architect",
  counts: directoryPayload.counts,
  recentSignups: directoryPayload.accounts,
  recentApprovalActions: [],
  warnings: []
};

const detailPayload: ArchitectAccountDetailPayload = {
  account: {
    ...directoryPayload.accounts[0],
    profile: {
      id: "profile-barber",
      exists: true,
      role: "barber",
      fullName: "Phillip McGee",
      email: "phillipmcgee813@gmail.com",
      phone: "8135550101",
      primaryOnboardingRole: "barber",
      onboardingState: "complete",
      phoneVerifiedAt: null,
      lastOnboardedAt: null,
      createdAt: "2026-04-02T12:00:00.000Z",
      updatedAt: "2026-04-02T12:00:00.000Z"
    },
    authIdentity: {
      id: "profile-barber",
      email: "phillipmcgee813@gmail.com",
      phone: "8135550101",
      providers: ["email"],
      createdAt: "2026-04-02T12:00:00.000Z",
      updatedAt: "2026-04-02T12:00:00.000Z",
      lastSignInAt: "2026-04-03T12:00:00.000Z",
      emailVerified: true,
      phoneVerified: false
    },
    barber: {
      id: "barber-1",
      referenceCode: "barber-ref-1",
      compensationModel: "autobooth_rent",
      barberSubtype: "solo",
      appApprovalStatus: "pending",
      shopApprovalStatus: "pending",
      status: "active",
      acceptingBookings: true,
      nextAvailableAt: "2026-04-05T12:00:00.000Z",
      visibilityState: "visible",
      acceptsInstantBookings: true,
      servicesCount: 1,
      availabilityRulesCount: 1,
      workingHoursCount: 0,
      linkedShopIds: ["shop-1"],
      serviceLocationLabels: ["Independent Studio, Tampa FL"]
    },
    verificationProfiles: [
      {
        id: "verification-barber",
        role: "barber",
        overallStatus: "pending",
        identityStatus: "pending",
        licenseStatus: "pending",
        businessStatus: "not_started",
        payoutStatus: "not_started",
        complianceStatus: "pending",
        publicVerified: false,
        canAcceptBookings: false,
        canReceivePayouts: false,
        canCreateShopListing: false,
        currentRequirements: ["Identity review"],
        reviewNotes: null,
        lastReviewedAt: null,
        createdAt: "2026-04-02T13:00:00.000Z",
        updatedAt: "2026-04-02T13:00:00.000Z"
      }
    ],
    documents: [],
    reviews: [],
    auditTrail: [],
    barberRowHealth: {
      authUserExists: true,
      platformProfileExists: true,
      barberRowExists: true,
      barberRowId: "barber-1",
      barberProfileRowExists: true,
      barberProfileId: "barber-profile-1",
      barberProfileReference: "barber-ref-1",
      barberProfileBarberId: "barber-1",
      barberRowLinkedToUser: true,
      barberReference: "barber-ref-1",
      username: "phillipmcgee",
      publicRoute: "/barber/phillipmcgee",
      discoverable: false,
      repairAttempted: true,
      repairResult: "already_synced",
      finalReadByReference: true,
      finalReadByBarberId: true,
      finalReadByProfileUser: true,
      blockers: ["Barber approval pending"]
    }
  },
  warnings: []
};

describe("architect account workspaces", () => {
  beforeEach(() => {
    useArchitectAccountDirectoryQueryMock.mockReset();
    useArchitectAccountDetailQueryMock.mockReset();
    useArchitectAccountActionMutationMock.mockReset();
    useArchitectBarberProfileRepairMutationMock.mockReset();
    useArchitectClientPaymentRepairMutationMock.mockReset();
    useArchitectVerificationActionMutationMock.mockReset();

    useArchitectAccountActionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useArchitectVerificationActionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useArchitectBarberProfileRepairMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useArchitectClientPaymentRepairMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders only founder-priority dashboard cards with filtered links", () => {
    render(<ArchitectDashboard initialData={dashboardPayload} />);

    expect(screen.getByRole("link", { name: /clients 0 real client accounts/i })).toHaveAttribute("href", "/architect/users?role=client");
    expect(screen.getByRole("link", { name: /barbers 1 real barber accounts/i })).toHaveAttribute("href", "/architect/users?role=barber");
    expect(screen.getByRole("link", { name: /shop owners 1 real owner accounts/i })).toHaveAttribute("href", "/architect/users?role=shop_owner");
    expect(screen.getByRole("link", { name: /pending barbers 1 needs platform review/i })).toHaveAttribute("href", "/architect/users?role=barber&status=pending_review");
    expect(screen.getByRole("link", { name: /pending shops 1 needs platform review/i })).toHaveAttribute("href", "/architect/users?role=shop_owner&status=pending_review");
    expect(screen.queryByText("Platform admins")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved barbers")).not.toBeInTheDocument();
    expect(screen.queryByText("Total accounts")).not.toBeInTheDocument();
  });

  it("renders real barber and shop-owner accounts in the searchable directory", () => {
    useArchitectAccountDirectoryQueryMock.mockReturnValue({
      data: directoryPayload,
      error: null,
      isFetching: false
    });

    render(<ArchitectAccountDirectoryWorkspace initialData={directoryPayload} initialFilters={{ role: "all", status: "all" }} />);

    expect(screen.getByText("Architect Users")).toBeInTheDocument();
    expect(screen.getByText("Phillip McGee")).toBeInTheDocument();
    expect(screen.getByText("phillipmcgee813@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("BVRB3R Studio")).toBeInTheDocument();
    expect(screen.queryByText(/Wave Carter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Blaze King/i)).not.toBeInTheDocument();
  });

  it("renders a true empty state when account directory has no real rows", () => {
    const emptyPayload = { ...directoryPayload, accounts: [], counts: { ...directoryPayload.counts, totalAccounts: 0 } };
    useArchitectAccountDirectoryQueryMock.mockReturnValue({
      data: emptyPayload,
      error: null,
      isFetching: false
    });

    render(<ArchitectAccountDirectoryWorkspace initialData={emptyPayload} initialFilters={{ role: "all", status: "all" }} />);

    expect(screen.getByText("No real accounts in this view")).toBeInTheDocument();
    expect(screen.queryByText(/Wave Carter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Blaze King/i)).not.toBeInTheDocument();
  });

  it("uses an explicit mobile-safe apply flow", () => {
    useArchitectAccountDirectoryQueryMock.mockReturnValue({
      data: directoryPayload,
      error: null,
      isFetching: false
    });

    render(<ArchitectAccountDirectoryWorkspace initialData={directoryPayload} initialFilters={{ role: "all", status: "all" }} />);

    fireEvent.change(screen.getByPlaceholderText(/email, phone, name/i), {
      target: { value: "phillipmcgee813@gmail.com" }
    });
    expect(screen.getByText(/filters changed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /apply search/i }));

    expect(useArchitectAccountDirectoryQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "phillipmcgee813@gmail.com" }),
      undefined
    );
  });

  it("renders loading feedback while live account search is running", () => {
    useArchitectAccountDirectoryQueryMock.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true
    });

    render(<ArchitectAccountDirectoryWorkspace initialData={directoryPayload} initialFilters={{ role: "all", status: "all" }} />);

    expect(screen.getAllByText(/searching accounts/i).length).toBeGreaterThan(0);
  });

  it("opens a real account detail page with verification actions and marketplace blockers", () => {
    useArchitectAccountDetailQueryMock.mockReturnValue({
      data: detailPayload,
      error: null
    });

    render(<ArchitectAccountDetailWorkspace profileId="profile-barber" initialData={detailPayload} />);

    expect(screen.getByText("Phillip McGee")).toBeInTheDocument();
    expect(screen.getByText("Barber state")).toBeInTheDocument();
    expect(screen.getByText("Verification actions")).toBeInTheDocument();
    expect(screen.getAllByText("Barber approval pending").length).toBeGreaterThan(0);
    expect(screen.getByText("Approved means eligible. Live means clients can discover and book.")).toBeInTheDocument();
    expect(screen.getByText("Client discovery debug")).toBeInTheDocument();
    expect(screen.getAllByText("Independent Studio, Tampa FL").length).toBeGreaterThan(0);
    expect(screen.getByText("/barber/phillipmcgee")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /force recalculate marketplace eligibility/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("Final read by reference")).toBeInTheDocument();
    expect(screen.getAllByText("Marketplace Not live").length).toBeGreaterThan(0);
    expect(screen.getByText("No real verification documents are linked to this account.")).toBeInTheDocument();
  });

  it("lets Architect trigger the canonical barber profile repair", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      repair: {
        message: "Profile already synced.",
        readChecks: {
          byReference: true,
          byBarberId: true,
          byProfileUser: true
        }
      }
    });
    useArchitectBarberProfileRepairMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
    useArchitectAccountDetailQueryMock.mockReturnValue({
      data: detailPayload,
      error: null
    });

    render(<ArchitectAccountDetailWorkspace profileId="profile-barber" initialData={detailPayload} />);

    fireEvent.click(screen.getAllByRole("button", { name: /force recalculate marketplace eligibility/i })[0]);

    expect(mutateAsync).toHaveBeenCalled();
    expect(await screen.findByText(/Profile already synced\. Final read checks/i)).toBeInTheDocument();
  });

  it("shows marketplace live separately from approval when no blockers remain", () => {
    const livePayload: ArchitectAccountDetailPayload = {
      ...detailPayload,
      account: detailPayload.account
        ? {
            ...detailPayload.account,
            approvalStatus: "approved",
            verificationStatus: "approved",
            marketplaceBlockers: [],
            marketplaceLive: true,
            clientHomeIncluded: true,
            searchIncluded: true,
            clientSearchIncluded: true,
            directSearchMatch: true,
            feedEligible: true,
            feedAssetCount: 1,
            publicRoute: "/barber/phillipmcgee",
            discoveryLocation: "Independent Studio, Tampa FL",
            payoutMode: "test",
            barber: detailPayload.account.barber
              ? {
                  ...detailPayload.account.barber,
                  appApprovalStatus: "approved",
                  status: "active",
                  acceptingBookings: true,
                  visibilityState: "public",
                  acceptsInstantBookings: true,
                  servicesCount: 1,
                  availabilityRulesCount: 1,
                  workingHoursCount: 1
                }
              : undefined
          }
        : null
    };
    useArchitectAccountDetailQueryMock.mockReturnValue({
      data: livePayload,
      error: null
    });

    render(<ArchitectAccountDetailWorkspace profileId="profile-barber" initialData={livePayload} />);

    expect(screen.getAllByText("Approval Approved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Marketplace Live").length).toBeGreaterThan(0);
    expect(screen.getByText("No marketplace blockers are currently detected from live account data.")).toBeInTheDocument();
  });
});
