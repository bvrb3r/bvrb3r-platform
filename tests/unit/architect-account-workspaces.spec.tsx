import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchitectAccountDetailPayload, ArchitectAccountDirectoryPayload } from "@/types/platform-admin";

const {
  useArchitectAccountDirectoryQueryMock,
  useArchitectAccountDetailQueryMock,
  useArchitectAccountActionMutationMock,
  useArchitectVerificationActionMutationMock
} = vi.hoisted(() => ({
  useArchitectAccountDirectoryQueryMock: vi.fn(),
  useArchitectAccountDetailQueryMock: vi.fn(),
  useArchitectAccountActionMutationMock: vi.fn(),
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
  useArchitectVerificationActionMutation: useArchitectVerificationActionMutationMock
}));

import { ArchitectAccountDirectoryWorkspace } from "@/components/operations/architect-account-directory-workspace";
import { ArchitectAccountDetailWorkspace } from "@/components/operations/architect-account-detail-workspace";

const directoryPayload: ArchitectAccountDirectoryPayload = {
  accounts: [
    {
      profileId: "profile-barber",
      authUserId: "profile-barber",
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
      marketplaceBlockers: ["Barber approval pending"],
      searchText: "phillip mcgee phillipmcgee813@gmail.com barber"
    },
    {
      profileId: "profile-owner",
      authUserId: "profile-owner",
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

const detailPayload: ArchitectAccountDetailPayload = {
  account: {
    ...directoryPayload.accounts[0],
    profile: {
      id: "profile-barber",
      role: "barber",
      fullName: "Phillip McGee",
      email: "phillipmcgee813@gmail.com",
      phone: "8135550101",
      primaryOnboardingRole: "barber",
      onboardingState: "complete",
      phoneVerifiedAt: null,
      lastOnboardedAt: null,
      createdAt: "2026-04-02T12:00:00.000Z"
    },
    barber: {
      id: "barber-1",
      referenceCode: "barber-ref-1",
      compensationModel: "commission",
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
      linkedShopIds: ["shop-1"]
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
    auditTrail: []
  },
  warnings: []
};

describe("architect account workspaces", () => {
  beforeEach(() => {
    useArchitectAccountDirectoryQueryMock.mockReset();
    useArchitectAccountDetailQueryMock.mockReset();
    useArchitectAccountActionMutationMock.mockReset();
    useArchitectVerificationActionMutationMock.mockReset();

    useArchitectAccountActionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useArchitectVerificationActionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders real barber and shop-owner accounts in the searchable directory", () => {
    useArchitectAccountDirectoryQueryMock.mockReturnValue({
      data: directoryPayload,
      error: null
    });

    render(<ArchitectAccountDirectoryWorkspace initialData={directoryPayload} initialFilters={{ role: "all", status: "all" }} />);

    expect(screen.getByText("Architect Accounts")).toBeInTheDocument();
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
      error: null
    });

    render(<ArchitectAccountDirectoryWorkspace initialData={emptyPayload} initialFilters={{ role: "all", status: "all" }} />);

    expect(screen.getByText("No real accounts in this view")).toBeInTheDocument();
    expect(screen.queryByText(/Wave Carter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Blaze King/i)).not.toBeInTheDocument();
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
    expect(screen.getByText("Barber approval pending")).toBeInTheDocument();
    expect(screen.getByText("No real verification documents are linked to this account.")).toBeInTheDocument();
  });
});
