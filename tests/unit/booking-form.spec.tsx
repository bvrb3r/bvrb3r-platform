import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useSearchParamsMock,
  usePwaMock,
  useBookingStoreMock,
  useClientPointsBalanceQueryMock,
  useClientMembershipQueryMock,
  useBarberAvailabilityQueryMock,
  useBarberProfileQueryMock,
  useBarberSearchQueryMock,
  useCreateBookingMutationMock,
  useMarketplaceAnalyticsMutationMock,
  useMarketplaceWaitlistMutationMock,
  useClientPromotionsQueryMock,
  useApplyPromotionMutationMock
} = vi.hoisted(() => ({
  useSearchParamsMock: vi.fn(),
  usePwaMock: vi.fn(),
  useBookingStoreMock: vi.fn(),
  useClientPointsBalanceQueryMock: vi.fn(),
  useClientMembershipQueryMock: vi.fn(),
  useBarberAvailabilityQueryMock: vi.fn(),
  useBarberProfileQueryMock: vi.fn(),
  useBarberSearchQueryMock: vi.fn(),
  useCreateBookingMutationMock: vi.fn(),
  useMarketplaceAnalyticsMutationMock: vi.fn(),
  useMarketplaceWaitlistMutationMock: vi.fn(),
  useClientPromotionsQueryMock: vi.fn(),
  useApplyPromotionMutationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useSearchParams: useSearchParamsMock
}));

vi.mock("@/components/pwa/pwa-provider", () => ({
  usePwa: usePwaMock
}));

vi.mock("@/lib/data/booking-store", () => ({
  useBookingStore: useBookingStoreMock
}));

vi.mock("@/lib/booking/client", () => ({
  useClientPointsBalanceQuery: useClientPointsBalanceQueryMock,
  useClientMembershipQuery: useClientMembershipQueryMock,
  useBarberAvailabilityQuery: useBarberAvailabilityQueryMock,
  useBarberProfileQuery: useBarberProfileQueryMock,
  useBarberSearchQuery: useBarberSearchQueryMock,
  useCreateBookingMutation: useCreateBookingMutationMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock,
  useMarketplaceWaitlistMutation: useMarketplaceWaitlistMutationMock
}));

vi.mock("@/lib/promotions/client", () => ({
  useClientPromotionsQuery: useClientPromotionsQueryMock,
  useApplyPromotionMutation: useApplyPromotionMutationMock
}));

import { BookingForm } from "@/components/booking/booking-form";

describe("booking form", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReset();
    usePwaMock.mockReset();
    useBookingStoreMock.mockReset();
    useClientPointsBalanceQueryMock.mockReset();
    useClientMembershipQueryMock.mockReset();
    useBarberAvailabilityQueryMock.mockReset();
    useBarberProfileQueryMock.mockReset();
    useBarberSearchQueryMock.mockReset();
    useCreateBookingMutationMock.mockReset();
    useMarketplaceAnalyticsMutationMock.mockReset();
    useMarketplaceWaitlistMutationMock.mockReset();
    useClientPromotionsQueryMock.mockReset();
    useApplyPromotionMutationMock.mockReset();

    useSearchParamsMock.mockReturnValue({
      get: vi.fn().mockReturnValue(null)
    });
    usePwaMock.mockReturnValue({ isOnline: true });
    useBookingStoreMock.mockReturnValue({
      selectedLocationId: "loc-ybor",
      selectedBarberId: "barber-wave",
      setLocation: vi.fn(),
      setBarber: vi.fn()
    });
    useClientMembershipQueryMock.mockReturnValue({ data: null });
    useClientPointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 180,
        pendingPoints: 20,
        promoUnlockedPoints: 80,
        earnedUnlockedPoints: 100,
        inAppValue: 18
      },
      isLoading: false,
      error: null
    });
    useBarberSearchQueryMock.mockReturnValue({
      data: {
        shops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship"
          }
        ],
        barbers: [
          {
            barberId: "barber-wave",
            barberName: "Wave Carter",
            username: "wave"
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useBarberProfileQueryMock.mockReturnValue({
      data: {
        profile: { username: "wave" },
        services: [
          {
            service: {
              id: "srv-cut",
              name: "Signature Precision Cut",
              category: "Signature",
              description: "A premium cut.",
              durationMin: 45,
              bufferMin: 10,
              price: 40,
              deposit: 10,
              fullPrepay: false
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useBarberAvailabilityQueryMock.mockReturnValue({
      data: {
        slots: [
          {
            startsAt: "2026-03-28T14:00:00.000Z",
            label: "Sat, Mar 28 • 2:00 PM"
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useCreateBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutate: vi.fn()
    });
    useMarketplaceWaitlistMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useClientPromotionsQueryMock.mockReturnValue({
      data: {
        promotions: [],
        quote: null
      },
      isLoading: false,
      error: null
    });
    useApplyPromotionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders quick BVR Points redemption controls at confirmation", () => {
    render(<BookingForm />);

    expect(screen.getByText("Available balance")).toBeInTheDocument();
    expect(screen.getByText("Max usable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "$5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "$10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto-apply max" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "$5" }));
    expect(screen.getByLabelText("Redeem on this booking")).toHaveValue(50);
  });
});
