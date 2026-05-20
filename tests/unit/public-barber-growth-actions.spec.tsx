import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useBarberFollowStateMock,
  useFollowBarberMutationMock,
  useUnfollowBarberMutationMock,
  useSaveFavoriteBarberMutationMock,
  followMutateAsyncMock,
  unfollowMutateAsyncMock,
  favoriteMutateAsyncMock,
  noopMutateAsyncMock
} = vi.hoisted(() => ({
  useBarberFollowStateMock: vi.fn(),
  useFollowBarberMutationMock: vi.fn(),
  useUnfollowBarberMutationMock: vi.fn(),
  useSaveFavoriteBarberMutationMock: vi.fn(),
  followMutateAsyncMock: vi.fn(),
  unfollowMutateAsyncMock: vi.fn(),
  favoriteMutateAsyncMock: vi.fn(),
  noopMutateAsyncMock: vi.fn()
}));

vi.mock("@/lib/engagement/client", () => ({
  useBarberFollowState: useBarberFollowStateMock,
  useFollowBarberMutation: useFollowBarberMutationMock,
  useUnfollowBarberMutation: useUnfollowBarberMutationMock
}));

vi.mock("@/lib/booking/client", () => ({
  useSaveFavoriteBarberMutation: useSaveFavoriteBarberMutationMock
}));

vi.mock("@/lib/mobile/client", () => ({
  useRecordDeepLinkMutation: () => ({ mutateAsync: noopMutateAsyncMock, isPending: false })
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: () => ({ mutateAsync: noopMutateAsyncMock, isPending: false })
}));

vi.mock("@/lib/trust/client", () => ({
  useSubmitSafetyReportMutation: () => ({ mutateAsync: noopMutateAsyncMock, isPending: false })
}));

import { PublicBarberGrowthActions } from "@/components/marketplace/public-barber-growth-actions";

describe("public barber growth actions", () => {
  beforeEach(() => {
    useBarberFollowStateMock.mockReset();
    useFollowBarberMutationMock.mockReset();
    useUnfollowBarberMutationMock.mockReset();
    useSaveFavoriteBarberMutationMock.mockReset();
    followMutateAsyncMock.mockReset();
    unfollowMutateAsyncMock.mockReset();
    favoriteMutateAsyncMock.mockReset();
    noopMutateAsyncMock.mockReset();

    useBarberFollowStateMock.mockReturnValue({
      data: {
        barberId: "barber-43b3cda2",
        isFollowing: false,
        notifyOnAvailability: true,
        notifyOnPortfolio: true,
        followerCount: 18
      }
    });
    useFollowBarberMutationMock.mockReturnValue({
      mutateAsync: followMutateAsyncMock,
      isPending: false
    });
    useUnfollowBarberMutationMock.mockReturnValue({
      mutateAsync: unfollowMutateAsyncMock,
      isPending: false
    });
    useSaveFavoriteBarberMutationMock.mockReturnValue({
      mutateAsync: favoriteMutateAsyncMock,
      isPending: false
    });
  });

  it("shows follower count and treats follow success as a clean UI success", async () => {
    followMutateAsyncMock.mockResolvedValue({
      ok: true,
      action: "followed",
      follow: {
        barberId: "barber-43b3cda2",
        notifyOnAvailability: true,
        notifyOnPortfolio: true
      },
      followState: {
        barberId: "barber-43b3cda2",
        isFollowing: true,
        notifyOnAvailability: true,
        notifyOnPortfolio: true,
        followerCount: 19
      }
    });

    render(<PublicBarberGrowthActions barberId="barber-43b3cda2" username="barber-43b3cda2" canFollow initialFollowerCount={18} />);

    expect(screen.getByText("18 followers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Following" })).toBeInTheDocument());
    expect(screen.getByText("19 followers")).toBeInTheDocument();
    expect(screen.getByText("Following.")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("shows Saved after the favorite mutation succeeds", async () => {
    favoriteMutateAsyncMock.mockResolvedValue({
      ok: true,
      saved: true,
      favoriteBarberReference: "barber-43b3cda2"
    });

    render(<PublicBarberGrowthActions barberId="barber-43b3cda2" username="barber-43b3cda2" canFollow initialFollowerCount={18} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument());
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(screen.queryByText(/unable to save favorite barber/i)).not.toBeInTheDocument();
  });
});
