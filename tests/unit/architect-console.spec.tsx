import { fireEvent, render, screen } from "@testing-library/react";
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
});
