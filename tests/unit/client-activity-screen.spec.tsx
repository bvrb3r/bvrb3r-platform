import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  usePointsBalanceQueryMock,
  usePointsHistoryQueryMock,
  useClientReferralSummaryMock,
  mutateAnalyticsAsyncMock,
  useMarketplaceAnalyticsMutationMock
} = vi.hoisted(() => ({
  usePointsBalanceQueryMock: vi.fn(),
  usePointsHistoryQueryMock: vi.fn(),
  useClientReferralSummaryMock: vi.fn(),
  mutateAnalyticsAsyncMock: vi.fn(),
  useMarketplaceAnalyticsMutationMock: vi.fn()
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

vi.mock("@/lib/points/client", () => ({
  usePointsBalanceQuery: usePointsBalanceQueryMock,
  usePointsHistoryQuery: usePointsHistoryQueryMock
}));

vi.mock("@/lib/engagement/client", () => ({
  useClientReferralSummary: useClientReferralSummaryMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock
}));

import { ClientActivityScreen } from "@/components/client-experience/client-activity-screen";

describe("client activity screen", () => {
  beforeEach(() => {
    usePointsBalanceQueryMock.mockReset();
    usePointsHistoryQueryMock.mockReset();
    useClientReferralSummaryMock.mockReset();
    mutateAnalyticsAsyncMock.mockReset();
    useMarketplaceAnalyticsMutationMock.mockReset();

    usePointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 180,
        pendingPoints: 20,
        inAppValue: 18,
        explanation: {
          pointsToNextMilestone: 20,
          progressPercent: 90,
          progressLabel: "20 pts until $20.00 in-app value.",
          valueAdvantageLabel: "$6.00 more value in-app than cash-out at the default rate.",
          unlockHint: "20 pending points are still validating before they unlock.",
          cashoutHint: "Earned points are worth more in app than cash-out."
        }
      },
      isLoading: false,
      error: null
    });

    usePointsHistoryQueryMock.mockReturnValue({
      data: {
        activity: [
          {
            id: "activity-1",
            title: "Completed booking",
            detail: "Closed-loop validation cleared and the reward was written to the ledger.",
            amountLabel: "+10 pts",
            statusLabel: "unlocked",
            occurredAt: "2026-03-27T12:00:00.000Z",
            tone: "positive"
          },
          {
            id: "activity-2",
            title: "Qualified tip",
            detail: "Tip reward qualified on $9.00 gratuity.",
            amountLabel: "+6 pts",
            statusLabel: "pending",
            occurredAt: "2026-03-27T13:00:00.000Z",
            tone: "neutral"
          }
        ],
        transactions: [
          {
            id: "txn-pending",
            eventType: "tip",
            pointsDelta: 6,
            status: "pending",
            unlockedAt: "2026-03-29T13:00:00.000Z",
            metadata: {}
          }
        ]
      },
      isLoading: false,
      error: null
    });

    useClientReferralSummaryMock.mockReturnValue({
      data: {
        clientId: "client-jordan",
        referralCode: {
          id: "ref-1",
          clientId: "client-jordan",
          code: "JORDAN",
          rewardPoints: 10,
          active: true,
          createdAt: "2026-03-01T09:00:00.000Z"
        },
        inviteLink: "https://bvrb3r.test/ref/JORDAN",
        shareMessage: "Invite a friend into BVRB3R.",
        totals: {
          invited: 2,
          signedUp: 1,
          booked: 1,
          completed: 1,
          credited: 1,
          rewardPointsEarned: 10
        },
        recentReferrals: []
      }
    });

    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutateAsync: mutateAnalyticsAsyncMock
    });
  });

  it("renders the rewards hub from canonical points data", () => {
    render(<ClientActivityScreen />);

    expect(screen.getByText("BVR Points, kept simple.")).toBeInTheDocument();
    expect(screen.getByText("Use points without overthinking it.")).toBeInTheDocument();
    expect(screen.getByText("Redeem on booking")).toBeInTheDocument();
    expect(screen.getByText("Refer friends")).toBeInTheDocument();
    expect(screen.getByText("Every point movement stays explainable.")).toBeInTheDocument();
    expect(screen.getAllByText("Completed booking").length).toBeGreaterThan(0);
    expect(screen.getByText("Qualified tip")).toBeInTheDocument();
    expect(screen.getByText("20 pending pts")).toBeInTheDocument();
  });

  it("tracks the referral action from the rewards hub", async () => {
    render(<ClientActivityScreen />);

    fireEvent.click(screen.getByRole("link", { name: "Refer friends" }));

    await waitFor(() => {
      expect(mutateAnalyticsAsyncMock).toHaveBeenCalledWith({
        eventType: "referral_shared",
        sourceKind: "client_dashboard",
        sourceReference: "JORDAN",
        metadata: {
          interaction: "cta_click",
          surface: "activity"
        }
      });
    });
  });
});
