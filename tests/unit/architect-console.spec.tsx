import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchitectConsole } from "@/components/operations/architect-console";
import type { PlatformAdminConsolePayload } from "@/types/platform-admin";

const {
  usePlatformAdminConsoleQueryMock,
  usePlatformAdminActionMutationMock
} = vi.hoisted(() => ({
  usePlatformAdminConsoleQueryMock: vi.fn(),
  usePlatformAdminActionMutationMock: vi.fn()
}));

vi.mock("@/lib/platform-admin/client", () => ({
  usePlatformAdminConsoleQuery: usePlatformAdminConsoleQueryMock,
  usePlatformAdminActionMutation: usePlatformAdminActionMutationMock
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

function createConsolePayload(overrides: Partial<PlatformAdminConsolePayload> = {}): PlatformAdminConsolePayload {
  return {
    actorName: "Architect",
    overview: {
      totalUsers: 0,
      activeClients: 0,
      activeBarbers: 0,
      activeShops: 0,
      bookingsToday: 0,
      revenueToday: 0,
      payoutIssues: 0,
      billingIssues: 0,
      fraudFlags: 0,
      kioskActiveCount: 0,
      aiManagerActiveCount: 0,
      releaseReadyCount: 0,
      releaseAttentionCount: 0
    },
    users: [],
    shops: [],
    moneyRisk: {
      openAnomalies: 0,
      criticalAnomalies: 0,
      billingFailures: 0,
      disputesOpen: 0,
      pointsLiabilityValue: 0,
      fraudReviewRate: 0,
      reversalRate: 0,
      overdueBoothRent: 0,
      recentAnomalies: [],
      recentCashouts: [],
      recentDisputes: []
    },
    support: [],
    controls: {
      shops: [],
      release: {
        readyCount: 0,
        attentionCount: 0
      }
    },
    auditLog: [],
    warnings: [],
    ...overrides
  };
}

describe("architect console", () => {
  beforeEach(() => {
    usePlatformAdminConsoleQueryMock.mockReset();
    usePlatformAdminActionMutationMock.mockReset();

    usePlatformAdminConsoleQueryMock.mockReturnValue({
      data: undefined,
      error: null
    });
    usePlatformAdminActionMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
  });

  it("renders a warning banner instead of crashing on malformed founder payloads", () => {
    render(<ArchitectConsole initialData={{ actorName: "Architect" } as unknown as PlatformAdminConsolePayload} />);

    expect(screen.getByText("Architect Console")).toBeInTheDocument();
    expect(screen.getByText("Architect data is partially unavailable. Core access is still active.")).toBeInTheDocument();
  });

  it("shows degraded architect warnings without exposing raw error objects", () => {
    render(<ArchitectConsole initialData={createConsolePayload({
      warnings: [
        "Architect data is partially unavailable. Core access is still active.",
        "Architect audit storage is unavailable; recent audit history may be incomplete."
      ]
    })} />);

    expect(screen.getByText("Architect audit storage is unavailable; recent audit history may be incomplete.")).toBeInTheDocument();
  });

  it("renders an explicit empty state when the audit log has no founder actions yet", () => {
    render(<ArchitectConsole initialData={createConsolePayload()} />);
    fireEvent.click(screen.getByRole("button", { name: /audit log/i }));

    expect(screen.getByText("No audit entries yet")).toBeInTheDocument();
  });

  it("surfaces canonical shortcut cards for verification, transactions, and account control", () => {
    render(<ArchitectConsole initialData={createConsolePayload({
      overview: {
        totalUsers: 5,
        activeClients: 2,
        activeBarbers: 2,
        activeShops: 1,
        bookingsToday: 4,
        revenueToday: 240,
        payoutIssues: 1,
        billingIssues: 0,
        fraudFlags: 0,
        kioskActiveCount: 1,
        aiManagerActiveCount: 1,
        releaseReadyCount: 3,
        releaseAttentionCount: 1
      },
      users: [
        {
          id: "profile-barber",
          name: "Phillip McGee",
          email: "phillipmcgee813@gmail.com",
          primaryRole: "Barber",
          title: "Barber",
          accountStatus: "active",
          verificationStatus: "pending",
          shopRelationships: ["BVRB3R Studio"],
          accountHealth: ["Verification pending"],
          bookingSummary: { completed: 2, active: 1, cancelled: 0, lifetimeValue: 120 },
          pointsSummary: { totalPoints: 0, unlockedPoints: 0, pendingPoints: 0 },
          referralSummary: { invited: 0, completed: 0, credited: 0 },
          verificationItems: [{ category: "identity_verification", label: "Identity", status: "pending" }],
          supportFlags: [],
          canManageAccess: true,
          isPlatformAdmin: false,
          barberId: "barber-1"
        },
        {
          id: "profile-suspended",
          name: "Dormant Account",
          email: "dormant@example.com",
          primaryRole: "Client",
          title: "Client",
          accountStatus: "suspended",
          verificationStatus: "unverified",
          shopRelationships: [],
          accountHealth: ["Suspended"],
          bookingSummary: { completed: 0, active: 0, cancelled: 0, lifetimeValue: 0 },
          pointsSummary: { totalPoints: 0, unlockedPoints: 0, pendingPoints: 0 },
          referralSummary: { invited: 0, completed: 0, credited: 0 },
          verificationItems: [],
          supportFlags: [],
          canManageAccess: true,
          isPlatformAdmin: false
        }
      ],
      shops: [
        {
          id: "shop-1",
          name: "BVRB3R Studio",
          ownerLabel: "Owner",
          status: "active",
          locationLabels: ["Tampa"],
          activeBarbers: 2,
          kioskEnabled: true,
          aiManagerEnabled: false,
          billingHealth: "Healthy",
          verificationStatus: "pending",
          verificationItems: [{ category: "business_verification", label: "Business", status: "pending" }],
          revenueToday: 240,
          growthSummary: "No synthetic growth summary",
          accountHealth: []
        }
      ],
      moneyRisk: {
        openAnomalies: 1,
        criticalAnomalies: 0,
        billingFailures: 0,
        disputesOpen: 1,
        pointsLiabilityValue: 0,
        fraudReviewRate: 0,
        reversalRate: 0,
        overdueBoothRent: 0,
        recentAnomalies: [],
        recentCashouts: [],
        recentDisputes: []
      }
    })} />);

    expect(screen.getAllByText("Verification queue").length).toBeGreaterThan(0);
    expect(screen.getByText("Transaction monitor")).toBeInTheDocument();
    expect(screen.getByText("User control")).toBeInTheDocument();
    expect(screen.getByText("Attention items")).toBeInTheDocument();
  });

  it("treats dispute resolution as a guarded architect action that requires a reason", () => {
    render(<ArchitectConsole initialData={createConsolePayload({
      moneyRisk: {
        openAnomalies: 0,
        criticalAnomalies: 0,
        billingFailures: 0,
        disputesOpen: 1,
        pointsLiabilityValue: 0,
        fraudReviewRate: 0,
        reversalRate: 0,
        overdueBoothRent: 0,
        recentAnomalies: [],
        recentCashouts: [],
        recentDisputes: [
          {
            id: "dispute-live-1",
            summary: "Stripe dispute for appointment A-100",
            status: "open",
            locationId: "location-1"
          }
        ]
      }
    })} />);

    fireEvent.click(screen.getByRole("button", { name: /^transactions$/i }));
    fireEvent.click(screen.getByRole("button", { name: /resolve dispute/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^resolve dispute$/i }).at(-1)!);

    expect(screen.getByText("A reason is required for sensitive and critical Architect Console actions.")).toBeInTheDocument();
  });
});
