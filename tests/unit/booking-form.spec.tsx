import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useSearchParamsMock,
  usePwaMock,
  useBookingStoreMock,
  useClientHomeQueryMock,
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
  useAddPaymentMethodMutationMock,
  useCreateSavedPaymentMethodSetupMutationMock,
  useCreateAppointmentPaymentMutationMock,
  loadStripeMock,
  stripeCardNumberMock,
  confirmCardSetupMock,
  stripeMockState
} = vi.hoisted(() => ({
  useSearchParamsMock: vi.fn(),
  usePwaMock: vi.fn(),
  useBookingStoreMock: vi.fn(),
  useClientHomeQueryMock: vi.fn(),
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
  useAddPaymentMethodMutationMock: vi.fn(),
  useCreateSavedPaymentMethodSetupMutationMock: vi.fn(),
  useCreateAppointmentPaymentMutationMock: vi.fn(),
  loadStripeMock: vi.fn(),
  stripeCardNumberMock: {
    focus: vi.fn()
  },
  confirmCardSetupMock: vi.fn(),
  stripeMockState: {
    autoReady: true,
    complete: {
      cardNumber: true,
      cardExpiry: true,
      cardCvc: true
    },
    loadError: null as string | null,
    elementsOptions: [] as unknown[]
  }
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
  useClientHomeQuery: useClientHomeQueryMock,
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
  getResolvedDefaultPaymentMethod: (methods: Array<{ id: string; isDefault: boolean }>, defaultPaymentMethodId?: string | null) =>
    (defaultPaymentMethodId ? methods.find((method) => method.id === defaultPaymentMethodId) : null)
    ?? methods.find((method) => method.isDefault)
    ?? (methods.length === 1 ? methods[0] : null),
  normalizeClientPaymentMethodDefaults: (methods: Array<{ id: string; isDefault: boolean }>, defaultPaymentMethodId?: string | null) => {
    const defaultMethod = (defaultPaymentMethodId ? methods.find((method) => method.id === defaultPaymentMethodId) : null)
      ?? methods.find((method) => method.isDefault)
      ?? (methods.length === 1 ? methods[0] : null);
    return methods.map((method) => ({
      ...method,
      isDefault: defaultMethod ? method.id === defaultMethod.id : false
    }));
  },
  usePaymentMethodsQuery: usePaymentMethodsQueryMock,
  useAddPaymentMethodMutation: useAddPaymentMethodMutationMock,
  useCreateSavedPaymentMethodSetupMutation: useCreateSavedPaymentMethodSetupMutationMock,
  useCreateAppointmentPaymentMutation: useCreateAppointmentPaymentMutationMock
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: loadStripeMock
}));

vi.mock("@stripe/react-stripe-js", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function createSplitElement(field: "cardNumber" | "cardExpiry" | "cardCvc", testId: string, element: typeof stripeCardNumberMock) {
    function MockStripeElement(props: {
      onReady?: (element: typeof stripeCardNumberMock) => void;
      onFocus?: () => void;
      onBlur?: () => void;
      onChange?: (event: { complete?: boolean; error?: { message?: string } }) => void;
      onLoadError?: (event: { error?: { message?: string } }) => void;
    }) {
      const { onReady, onFocus, onBlur, onChange, onLoadError } = props;
      const emittedRef = React.useRef(false);

      React.useEffect(() => {
        if (emittedRef.current) {
          return;
        }

        emittedRef.current = true;
        const timer = window.setTimeout(() => {
          const shouldFail = stripeMockState.loadError === field || (field === "cardNumber" && Boolean(stripeMockState.loadError));
          if (shouldFail) {
            onLoadError?.({ error: { message: stripeMockState.loadError ?? "Stripe iframe failed" } });
          } else if (stripeMockState.autoReady) {
            onReady?.(element);
            onChange?.({ complete: stripeMockState.complete[field] });
          }
        }, 0);

        return () => window.clearTimeout(timer);
      }, [onChange, onLoadError, onReady]);

      return React.createElement(
        "div",
        {
          "data-testid": testId,
          onFocus,
          onBlur,
          tabIndex: 0
        },
        React.createElement("iframe", { title: "Secure card input" })
      );
    }

    MockStripeElement.displayName = `MockStripe${field}`;
    return MockStripeElement;
  }

  const CardNumberElement = createSplitElement("cardNumber", "mock-stripe-card-number-element", stripeCardNumberMock);
  const CardExpiryElement = createSplitElement("cardExpiry", "mock-stripe-card-expiry-element", { focus: vi.fn() });
  const CardCvcElement = createSplitElement("cardCvc", "mock-stripe-card-cvc-element", { focus: vi.fn() });

  return {
    Elements: ({ children, options }: { children: React.ReactNode; options?: unknown }) => {
      stripeMockState.elementsOptions.push(options);
      return React.createElement(React.Fragment, null, children);
    },
    CardNumberElement,
    CardExpiryElement,
    CardCvcElement,
    useStripe: () => ({
      confirmCardSetup: confirmCardSetupMock
    }),
    useElements: () => ({
      getElement: (element: unknown) => element === CardNumberElement ? stripeCardNumberMock : null
    })
  };
});

import { BookingForm } from "@/components/booking/booking-form";

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  return getDateKey(next);
}

function slotForDate(dateKey: string, hour = 14) {
  return {
    startsAt: `${dateKey}T${String(hour).padStart(2, "0")}:00:00.000Z`,
    endsAt: `${dateKey}T${String(hour + 1).padStart(2, "0")}:00:00.000Z`,
    label: `${dateKey} ${hour}:00`,
    locationId: "loc-ybor",
    barberId: "barber-wave",
    serviceId: "srv-cut"
  };
}

async function advanceToReview() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to Review" }));
  await screen.findByRole("heading", { name: "Review appointment" });
}

describe("booking form", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReset();
    usePwaMock.mockReset();
    useBookingStoreMock.mockReset();
    useClientHomeQueryMock.mockReset();
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
    useAddPaymentMethodMutationMock.mockReset();
    useCreateSavedPaymentMethodSetupMutationMock.mockReset();
    useCreateAppointmentPaymentMutationMock.mockReset();
    loadStripeMock.mockReset();
    confirmCardSetupMock.mockReset();
    stripeCardNumberMock.focus.mockReset();
    stripeMockState.autoReady = true;
    stripeMockState.complete = {
      cardNumber: true,
      cardExpiry: true,
      cardCvc: true
    };
    stripeMockState.loadError = null;
    stripeMockState.elementsOptions = [];
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      width: 240,
      height: 56,
      top: 0,
      right: 240,
      bottom: 56,
      left: 0,
      toJSON: () => ({})
    }));
    loadStripeMock.mockResolvedValue({});
    confirmCardSetupMock.mockResolvedValue({
      setupIntent: {
        payment_method: "pm_inline_stripe"
      }
    });

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
    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          phone: "8135550190",
          email: "jordan@example.com",
          loyaltyPoints: 180,
          retentionTag: "vip",
          notes: []
        }
      },
      isLoading: false,
      error: null
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
            name: "Centro Ybor Flagship",
            city: "Tampa",
            state: "FL",
            address: "2172 University Square Mall"
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
        shopLocations: [
          {
            id: "loc-ybor",
            name: "Phils chair",
            address: "2172 University Square Mall",
            city: "Tampa",
            state: "FL",
            postalCode: "33612"
          }
        ],
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
            nickname: "Phil Stripe Card",
            isDefault: true,
            createdAt: "2026-04-01T00:00:00.000Z",
            label: "Visa ending in 4242"
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useAddPaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useCreateSavedPaymentMethodSetupMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        provider: "stripe",
        mode: "setup",
        clientSecret: "seti_booking_inline_secret",
        customerId: "cus_booking_inline",
        publishableKey: "pk_test_booking_inline"
      })
    });
    useCreateAppointmentPaymentMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("shows service, time, and saved payment selection inside the booking flow", async () => {
    render(<BookingForm />);

    expect(screen.getByRole("heading", { name: "Choose service" })).toBeInTheDocument();
    expect(screen.getByText("Booking with")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getAllByText("Phils chair").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2172 University Square Mall, Tampa, FL 33612").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Signature Precision Cut/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Pick date and time" })).toBeInTheDocument();
    expect(screen.getByText("Selected date")).toBeInTheDocument();
    expect(screen.getByText("Choose another date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AM|PM/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to Review" }));

    expect(await screen.findByText("Payment method")).toBeInTheDocument();
    expect(screen.getByText("Jordan Ellis")).toBeInTheDocument();
    expect(screen.getByText("8135550190")).toBeInTheDocument();
    expect(screen.queryByText("Client name")).not.toBeInTheDocument();
    expect(screen.getAllByText("2172 University Square Mall, Tampa, FL 33612").length).toBeGreaterThan(0);
    expect(screen.getByText("Phil Stripe Card")).toBeInTheDocument();
    expect(screen.getByText(/4242/)).toBeInTheDocument();
    expect(screen.getByText("Exp 12/29")).toBeInTheDocument();
    expect(screen.queryByText("Add a payment method before booking.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book Appointment" })).toBeEnabled();
  });

  it("keeps date controls visible and review gated when the selected date has no slots", async () => {
    useBarberAvailabilityQueryMock.mockReturnValue({
      data: {
        service: {
          id: "srv-cut",
          name: "Signature Precision Cut",
          durationMin: 45,
          bufferMin: 10,
          price: 40,
          deposit: 10,
          fullPrepay: false
        },
        slots: []
      },
      isLoading: false,
      error: null
    });

    render(<BookingForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Pick date and time" })).toBeInTheDocument();
    expect(screen.getByText("Selected date")).toBeInTheDocument();
    expect(screen.getByText("Choose another date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find next available" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join waitlist" })).toBeInTheDocument();
    expect(screen.getByText("No times available for this date.")).toBeInTheDocument();
    expect(screen.getByText("Choose a time to continue.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Review" })).toBeDisabled();
  });

  it("reloads availability when the booking date changes and enables review after a real slot is selected", async () => {
    const today = getDateKey();
    const tomorrow = addDaysToDateKey(today, 1);
    const availabilityByDate = new Map([
      [tomorrow, [slotForDate(tomorrow, 15)]]
    ]);

    useBarberAvailabilityQueryMock.mockImplementation((params: { startDate?: string }) => ({
      data: {
        service: {
          id: "srv-cut",
          name: "Signature Precision Cut",
          durationMin: 45,
          bufferMin: 10,
          price: 40,
          deposit: 10,
          fullPrepay: false
        },
        slots: availabilityByDate.get(params.startDate ?? "") ?? []
      },
      isLoading: false,
      error: null
    }));

    render(<BookingForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Continue to Review" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next day" }));

    await waitFor(() => {
      expect(useBarberAvailabilityQueryMock).toHaveBeenCalledWith(expect.objectContaining({
        startDate: tomorrow,
        days: 14,
        barberId: "barber-wave",
        serviceId: "srv-cut",
        locationId: "loc-ybor"
      }));
    });

    expect(await screen.findByRole("button", { name: /AM|PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Review" })).toBeEnabled();
  });

  it("uses Find next available to move from an empty date to the next real slot", async () => {
    const today = getDateKey();
    const tomorrow = addDaysToDateKey(today, 1);
    const nextAvailable = addDaysToDateKey(today, 2);

    useBarberAvailabilityQueryMock.mockImplementation((params: { startDate?: string }) => ({
      data: {
        service: {
          id: "srv-cut",
          name: "Signature Precision Cut",
          durationMin: 45,
          bufferMin: 10,
          price: 40,
          deposit: 10,
          fullPrepay: false
        },
        slots: params.startDate === tomorrow || params.startDate === nextAvailable ? [slotForDate(nextAvailable, 16)] : []
      },
      isLoading: false,
      error: null
    }));

    render(<BookingForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Choose another date"), {
      target: { value: tomorrow }
    });

    expect(await screen.findByText("No times available for this date.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find next available" }));

    expect(await screen.findByRole("button", { name: /AM|PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Review" })).toBeEnabled();
  });

  it("preserves Culture attribution through service, date, and time selection", async () => {
    const searchGet = vi.fn((key: string) => {
      const params: Record<string, string> = {
        source: "culture",
        culturePostId: "post-culture-1",
        cultureAuthorId: "author-profile-1",
        cultureSurface: "client_culture",
        cta: "book_barber",
        barberId: "barber-wave",
        serviceId: "srv-cut"
      };
      return params[key] ?? null;
    });
    const mutateBookingMock = vi.fn().mockResolvedValue({
      appointment: {
        id: "appt-culture"
      }
    });

    useSearchParamsMock.mockReturnValue({ get: searchGet });
    useCreateBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: mutateBookingMock
    });

    render(<BookingForm />);
    expect(screen.getByText("Culture booking")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to Review" }));
    expect(await screen.findByText("Payment method")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Book Appointment" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledWith(expect.objectContaining({
        barberId: "barber-wave",
        serviceId: "srv-cut",
        cultureAttribution: {
          source: "culture",
          culturePostId: "post-culture-1",
          cultureAuthorId: "author-profile-1",
          cultureSurface: "client_culture",
          cta: "book_barber"
        }
      }));
    });
  });

  it("auto-selects the only saved card during booking even if default metadata is missing", async () => {
    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: [
          {
            id: "pm-only",
            provider: "stripe",
            brand: "Visa",
            last4: "4242",
            expMonth: 12,
            expYear: 2034,
            nickname: "phil stripe card",
            isDefault: false,
            createdAt: "2026-04-01T00:00:00.000Z",
            label: "Visa ending in 4242"
          }
        ],
        defaultPaymentMethodId: null
      },
      isLoading: false,
      error: null
    });

    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getByText("phil stripe card")).toBeInTheDocument();
    expect(screen.getByText("Default for bookings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book Appointment" })).toBeEnabled();
  });

  it("keeps the saved default card selected without starting setup intent", async () => {
    const createSetupMock = vi.fn().mockResolvedValue({
      provider: "stripe",
      mode: "setup",
      clientSecret: "seti_should_not_start",
      customerId: "cus_should_not_start",
      publishableKey: "pk_test_should_not_start"
    });
    useCreateSavedPaymentMethodSetupMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: createSetupMock
    });

    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getByText("Phil Stripe Card")).toBeInTheDocument();
    expect(screen.getByText(/4242/)).toBeInTheDocument();
    expect(screen.getByText("Default for bookings")).toBeInTheDocument();
    expect(screen.queryByText("Add a payment method to complete booking.")).not.toBeInTheDocument();
    expect(screen.queryByText("Secure card fields are unavailable until payment setup starts.")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(createSetupMock).not.toHaveBeenCalled();
    });
  });

  it("does not auto-start setup intent when saved payment methods fail to load", async () => {
    const createSetupMock = vi.fn().mockResolvedValue({
      provider: "stripe",
      mode: "setup",
      clientSecret: "seti_should_wait_for_user",
      customerId: "cus_should_wait_for_user",
      publishableKey: "pk_test_should_wait_for_user"
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: Object.assign(new Error("Only clients can manage saved payment methods."), { status: 403 })
    });
    useCreateSavedPaymentMethodSetupMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: createSetupMock
    });

    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getAllByText("Saved payment method could not be loaded. Refresh or manage wallet.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Add a payment method to complete booking.")).not.toBeInTheDocument();
    expect(screen.queryByText("Secure card fields are unavailable until payment setup starts.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book Appointment" })).toBeDisabled();
    await waitFor(() => {
      expect(createSetupMock).not.toHaveBeenCalled();
    });
  });

  it("keeps the review receipt and summary client-facing without duplicated internal rows", async () => {
    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getByText("Offers & promo codes")).toBeInTheDocument();
    expect(screen.getByText("No active offers for this booking.")).toBeInTheDocument();
    expect(screen.getByText("Rewards")).toBeInTheDocument();
    expect(screen.getByText("Price breakdown")).toBeInTheDocument();
    expect(screen.getAllByText("Subtotal")).toHaveLength(1);
    expect(screen.getByText("Total due today")).toBeInTheDocument();

    expect(screen.queryByText("Live availability")).not.toBeInTheDocument();
    expect(screen.queryByText(/including buffer/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Deposit reserved")).not.toBeInTheDocument();
    expect(screen.queryByText("Remaining at checkout")).not.toBeInTheDocument();
    expect(screen.queryByText("Selected time")).not.toBeInTheDocument();

    const summary = screen.getByText("Booking Summary").closest("div");
    expect(summary?.textContent).not.toContain("BVR Points");
    expect(summary?.textContent).not.toContain("Subtotal");
  });

  it("only shows promo errors after the client tries to apply a code", async () => {
    const applyPromotionMock = vi.fn().mockRejectedValue(new Error("Shop not found for this promotion"));

    useClientPromotionsQueryMock.mockReturnValue({
      data: {
        promotions: [],
        quote: null
      },
      isLoading: false,
      error: new Error("Shop not found for this promotion")
    });
    useApplyPromotionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: applyPromotionMock
    });

    render(<BookingForm />);
    await advanceToReview();

    expect(screen.queryByText("Shop not found for this promotion")).not.toBeInTheDocument();
    expect(screen.queryByText("Promo code not valid for this booking.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("Enter a promo code first.")).toBeInTheDocument();
    expect(applyPromotionMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Enter promo code"), {
      target: { value: "NOPE" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Promo code not valid for this booking.")).toBeInTheDocument();
    expect(screen.queryByText("Shop not found for this promotion")).not.toBeInTheDocument();
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

    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getByText("Jordan Ellis")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Book Appointment" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledWith(expect.objectContaining({
        locationId: "loc-ybor",
        barberId: "barber-wave",
        serviceId: "srv-cut",
        appointmentTime: "2026-04-28T14:00:00.000Z",
        clientName: "Jordan Ellis",
        clientPhone: "8135550190",
        paymentMethodId: "pm-default",
        barberName: "wave",
        serviceName: "Signature Precision Cut"
      }));
    });

    expect(await screen.findByText("Appointment booked")).toBeInTheDocument();
    expect(screen.getByText("Confirmation appt-live-1. Visa ending in 4242 was charged for this booking.")).toBeInTheDocument();
    expect(mutatePaymentMock).not.toHaveBeenCalled();
  });

  it("uses the public barber username on client-facing booking surfaces", async () => {
    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getAllByText("wave").length).toBeGreaterThan(0);
    expect(screen.queryByText("Wave Carter")).not.toBeInTheDocument();
  });

  it("does not show confirmation when the canonical pay and book path fails", async () => {
    const mutateBookingMock = vi.fn().mockRejectedValue(new Error("Payment authorization failed"));

    useCreateBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: mutateBookingMock
    });

    render(<BookingForm />);
    await advanceToReview();

    fireEvent.click(screen.getByRole("button", { name: "Book Appointment" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Payment authorization failed")).toBeInTheDocument();
    expect(screen.queryByText("Appointment booked")).not.toBeInTheDocument();
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

    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getByText("Jordan Ellis")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Book Appointment" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledWith(expect.objectContaining({
        aiRecommendationId: "rebooking:client-jordan:appt-last:28",
        aiRecommendationType: "rebooking_reminder"
      }));
    });
  });

  it("blocks confirmation when no saved payment method exists", async () => {
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getByText("Add a payment method to complete booking.")).toBeInTheDocument();
    expect(await screen.findByText("Card number")).toBeInTheDocument();
    expect(screen.getByText("MM/YY")).toBeInTheDocument();
    expect(screen.getByText("CVC")).toBeInTheDocument();
    expect(screen.getByText("ZIP")).toBeInTheDocument();
    expect(screen.getByTestId("postal-code-input")).toBeInTheDocument();
    expect(screen.queryByText("Cardholder name")).not.toBeInTheDocument();
    expect(screen.queryByText("Secure card details")).not.toBeInTheDocument();
    expect(screen.queryByText("Stripe secure card entry")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage payment methods" })).toHaveAttribute("href", "/dashboard/client/profile?section=wallet");
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book Appointment" })).toBeDisabled();
  });

  it("saves an inline card and enables booking without leaving the flow", async () => {
    const createSetupMock = vi.fn().mockResolvedValue({
      provider: "stripe",
      mode: "setup",
      clientSecret: "seti_inline_secret",
      customerId: "cus_inline",
      publishableKey: "pk_test_inline"
    });
    const addMethodMock = vi.fn().mockResolvedValue({
      method: {
        id: "pm-inline",
        provider: "stripe",
        brand: "Visa",
        last4: "4242",
        expMonth: 4,
        expYear: 2028,
        nickname: "Phil Stripe Card",
        isDefault: true,
        createdAt: "2026-04-02T00:00:00.000Z",
        label: "Visa ending in 4242"
      }
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });
    useCreateSavedPaymentMethodSetupMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: createSetupMock
    });
    useAddPaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: addMethodMock
    });

    render(<BookingForm />);
    await advanceToReview();

    await waitFor(() => {
      expect(createSetupMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId("mock-stripe-card-number-element")).toBeInTheDocument();
    expect(screen.getByTestId("mock-stripe-card-expiry-element")).toBeInTheDocument();
    expect(screen.getByTestId("mock-stripe-card-cvc-element")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save card" })).toBeInTheDocument());
    expect(stripeMockState.elementsOptions.length).toBeGreaterThan(0);
    expect(stripeMockState.elementsOptions.every((options) => options === undefined)).toBe(true);

    expect(screen.getByRole("button", { name: "Book Appointment" })).toBeDisabled();

    expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
    fireEvent.change(screen.getByTestId("postal-code-input"), {
      target: { value: "33612" }
    });
    fireEvent.click(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings."));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));

    await waitFor(() => {
      expect(confirmCardSetupMock).toHaveBeenCalledTimes(1);
    });
    expect(confirmCardSetupMock).toHaveBeenCalledWith("seti_inline_secret", expect.objectContaining({
      payment_method: expect.objectContaining({
        card: stripeCardNumberMock,
        billing_details: {
          address: {
            postal_code: "33612"
          }
        }
      })
    }));
    expect(await screen.findByText("Name this card")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Example: Phil Stripe Card"), {
      target: { value: "Phil Stripe Card" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Card" }));
    await waitFor(() => {
      expect(addMethodMock).toHaveBeenCalledWith(expect.objectContaining({
        provider: "stripe",
        providerCustomerId: "cus_inline",
        providerPaymentMethodId: "pm_inline_stripe",
        nickname: "Phil Stripe Card",
        isDefault: true
      }));
    });

    expect(await screen.findByText("Phil Stripe Card")).toBeInTheDocument();
    expect(screen.getByText(/4242/)).toBeInTheDocument();
    expect(screen.getByText("Exp 04/28")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book Appointment" })).toBeEnabled();
  });
});
