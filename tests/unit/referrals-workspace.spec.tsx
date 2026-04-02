import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useClientReferralSummaryMock,
  useCreateReferralInviteMutationMock,
  useMarketplaceAnalyticsMutationMock
} = vi.hoisted(() => ({
  useClientReferralSummaryMock: vi.fn(),
  useCreateReferralInviteMutationMock: vi.fn(),
  useMarketplaceAnalyticsMutationMock: vi.fn()
}));

vi.mock("@/lib/engagement/client", () => ({
  useClientReferralSummary: useClientReferralSummaryMock,
  useCreateReferralInviteMutation: useCreateReferralInviteMutationMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock
}));

import { ReferralsWorkspace } from "@/components/engagement/referrals-workspace";

describe("referrals workspace", () => {
  beforeEach(() => {
    useClientReferralSummaryMock.mockReset();
    useCreateReferralInviteMutationMock.mockReset();
    useMarketplaceAnalyticsMutationMock.mockReset();

    useCreateReferralInviteMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useClientReferralSummaryMock.mockReturnValue({
      isLoading: false,
      isError: false,
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
          invited: 3,
          signedUp: 2,
          booked: 2,
          completed: 1,
          credited: 1,
          rewardPointsEarned: 10
        },
        recentReferrals: [
          {
            id: "referral-1",
            referralCodeId: "ref-1",
            referrerClientId: "client-jordan",
            referredClientEmail: "friend@example.com",
            status: "booked",
            rewardPoints: 10,
            createdAt: "2026-03-20T09:00:00.000Z",
            signedUpAt: "2026-03-20T10:00:00.000Z",
            bookedAt: "2026-03-22T15:00:00.000Z"
          }
        ]
      }
    });
  });

  it("shows the real referral lifecycle and recent invite progress", () => {
    render(<ReferralsWorkspace />);

    expect(screen.getByText("Share one clean invite. Earn when the visit really closes.")).toBeInTheDocument();
    expect(screen.getAllByText("Shared").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Signed up").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Booked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Credited").length).toBeGreaterThan(0);
    expect(screen.getByText("friend@example.com")).toBeInTheDocument();
    expect(screen.getByText("Real lifecycle only")).toBeInTheDocument();
  });
});
