import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  useApplyPromotionMutationMock,
  usePaymentMethodsQueryMock,
  useCreateAppointmentPaymentMutationMock
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
  useApplyPromotionMutationMock: vi.fn(),
  usePaymentMethodsQueryMock: vi.fn(),
  useCreateAppointmentPaymentMutationMock: vi.fn()
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

vi.mock("@/lib/payments/client", () => ({
  usePaymentMethodsQuery: usePaymentMethodsQueryMock,
  useCreateAppointmentPaymentMutation: useCreateAppointmentPaymentMutationMock
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
    usePaymentMethodsQueryMock.mockReset();
    useCreateAppointmentPaymentMutationMock.mockReset();

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
            startsAt: "2026-04-28T14:00:00.000Z",
            label: "Tue, Apr 28 - 2:00 PM"
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
    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: [
          {
            id: "pm-default",
            provider: "stripe",
            brand: "Visa",
            last4: "4242",
            expMonth: 12,
            expYear: 2029,
            isDefault: true,
            createdAt: "2026-04-01T00:00:00.000Z",
            label: "Visa ending in 4242"
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useCreateAppointmentPaymentMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("shows saved payment selection inside the booking confirmation flow", () => {
    render(<BookingForm />);

    expect(screen.getByLabelText("Saved payment method")).toBeInTheDocument();
    expect(screen.getByText(/Visa ending in 4242 will be charged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and pay" })).toBeEnabled();
  });

  it("creates the appointment and payment through the canonical booking path", async () => {
    const mutateBookingMock = vi.fn().mockResolvedValue({
      appointment: {
        id: "appt-live-1"
      }
    });
    const mutatePaymentMock = vi.fn();

    useCreateBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: mutateBookingMock
    });
    useCreateAppointmentPaymentMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: mutatePaymentMock
    });

    const { container } = render(<BookingForm />);

    fireEvent.change(container.querySelector('input[name="clientName"]') as HTMLInputElement, {
      target: { value: "Jordan Ellis" }
    });
    fireEvent.change(container.querySelector('input[name="clientPhone"]') as HTMLInputElement, {
      target: { value: "8135550190" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledWith(expect.objectContaining({
        locationId: "loc-ybor",
        barberId: "barber-wave",
        serviceId: "srv-cut",
        appointmentTime: "2026-04-28T14:00:00.000Z",
        clientName: "Jordan Ellis",
        clientPhone: "8135550190",
        paymentMethodId: "pm-default"
      }));
    });

    expect(await screen.findByText(/Booking confirmed\. Appointment/i)).toBeInTheDocument();
    expect(screen.getByText("Visa ending in 4242 was charged for this booking.")).toBeInTheDocument();
    expect(mutatePaymentMock).not.toHaveBeenCalled();
  });

  it("passes AI recommendation attribution through the canonical booking payload", async () => {
    const searchGet = vi.fn((key: string) => {
      if (key === "aiRecommendationId") {
        return "rebooking:client-jordan:appt-last:28";
      }
      if (key === "aiRecommendationType") {
        return "rebooking_reminder";
      }
      return null;
    });
    const mutateBookingMock = vi.fn().mockResolvedValue({
      appointment: {
        id: "appt-live-2"
      }
    });

    useSearchParamsMock.mockReturnValue({ get: searchGet });
    useCreateBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: mutateBookingMock
    });

    const { container } = render(<BookingForm />);

    fireEvent.change(container.querySelector('input[name="clientName"]') as HTMLInputElement, {
      target: { value: "Jordan Ellis" }
    });
    fireEvent.change(container.querySelector('input[name="clientPhone"]') as HTMLInputElement, {
      target: { value: "8135550190" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledWith(expect.objectContaining({
        aiRecommendationId: "rebooking:client-jordan:appt-last:28",
        aiRecommendationType: "rebooking_reminder"
      }));
    });
  });

  it("blocks confirmation when no saved payment method exists", () => {
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<BookingForm />);

    expect(screen.getByText("No saved payment method is ready for this account yet. Add one in Wallet before confirming the booking.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open wallet" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Confirm and pay" })).toBeDisabled();
  });
});
