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

function slotForDate(dateKey: string, hour = 14, overrides: Partial<{
  startsAt: string;
  endsAt: string;
  label: string;
  locationId: string;
  barberId: string;
  serviceId: string;
}> = {}) {
  return {
    startsAt: `${dateKey}T${String(hour).padStart(2, "0")}:00:00.000Z`,
    endsAt: `${dateKey}T${String(hour + 1).padStart(2, "0")}:00:00.000Z`,
    label: `${dateKey} ${hour}:00`,
    locationId: "loc-ybor",
    barberId: "barber-wave",
    serviceId: "srv-cut",
    ...overrides
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
            username: "wave",
            locationId: "loc-ybor"
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
              fullPrepay: false,
              shopId: "loc-ybor"
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useBarberAvailabilityQueryMock.mockReturnValue({
      data: {
        timezone: "America/New_York",
        slots: [slotForDate(getDateKey(), 14)]
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
    expect(screen.getAllByText("$40").length).toBeGreaterThan(0);
    expect(screen.getByText("45 min")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Pick date and time" })).toBeInTheDocument();
    expect(screen.getByText("Selected date")).toBeInTheDocument();
    expect(screen.getByText("Choose another date")).toBeInTheDocument();
    expect(screen.queryByText(/^Date$/)).not.toBeInTheDocument();
    expect(screen.getByText("1 slot")).toBeInTheDocument();
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
    expect(screen.getByText("Payment method ready.")).toBeInTheDocument();
    expect(screen.getByText("Appointment confirmation appears only after the server creates the appointment.")).toBeInTheDocument();
    expect(screen.getByText("Payment status comes from server and Stripe evidence, not this screen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeEnabled();
  });

  it("blocks paid guest booking without calling payment setup or fake booking success", async () => {
    useClientHomeQueryMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: []
      },
      isLoading: false,
      error: null
    });

    render(<BookingForm mode="guest" />);

    await advanceToReview();

    expect(useClientHomeQueryMock).toHaveBeenCalledWith(false);
    expect(usePaymentMethodsQueryMock).toHaveBeenCalledWith(undefined, false);
    expect(screen.queryByText("Offers & promo codes")).not.toBeInTheDocument();
    expect(screen.queryByText("Rewards")).not.toBeInTheDocument();
    expect(screen.getByText("Guest booking identity")).toBeInTheDocument();
    expect(screen.getByText("This appointment requires $40 due today.")).toBeInTheDocument();
    expect(screen.getByText("Guest online payment setup is not connected yet. Sign in or create an account to add a payment method before booking.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute("href", "/login?redirect=%2Fbooking%2Fnew");

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Guest Booker" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "(813) 555-0199" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "guest@example.com" } });
    fireEvent.click(screen.getByLabelText("I acknowledge the cancellation policy."));

    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeDisabled();
    expect(useCreateSavedPaymentMethodSetupMutationMock).not.toHaveBeenCalled();
  });

  it("submits zero-due guest booking identity and shows public lookup support actions after server success", async () => {
    const createBooking = vi.fn().mockResolvedValue({
      appointment: {
        id: "appt-guest",
        confirmationCode: "BVRGUEST1"
      }
    });
    useCreateBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: createBooking
    });
    useClientHomeQueryMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: []
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
              id: "srv-free",
              name: "Consultation",
              category: "Signature",
              description: "A no-charge booking.",
              durationMin: 15,
              bufferMin: 0,
              price: 0,
              deposit: 0,
              fullPrepay: false,
              shopId: "loc-ybor"
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });

    render(<BookingForm mode="guest" />);

    await advanceToReview();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Guest Booker" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "(813) 555-0199" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Guest@Example.COM" } });
    fireEvent.click(screen.getByLabelText("I acknowledge the cancellation policy."));
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    await waitFor(() => expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: "srv-free",
      clientName: "Guest Booker",
      clientPhone: "(813) 555-0199",
      clientEmail: "guest@example.com",
      paymentMethodId: undefined,
      pointsToRedeem: undefined
    })));
    expect(await screen.findByText("Confirmation BVRGUEST1. Keep this code. Support can look up your appointment with your email, phone, confirmation code, and appointment time. Receipt status is verifying.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Look up booking" })).toHaveAttribute("href", "/bookings?confirmation=BVRGUEST1");
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", expect.stringContaining("mailto:support@bvrb3r.app"));
    expect(screen.getByRole("link", { name: "Create or sign in" })).toHaveAttribute("href", "/login?redirect=%2Fbookings%3Fconfirmation%3DBVRGUEST1");
    expect(screen.queryByRole("link", { name: "View Appointment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back Home" })).not.toBeInTheDocument();
  });

  it("blocks inactive and unbookable services with client-facing reasons", async () => {
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
              id: "srv-paused",
              name: "Paused Cut",
              category: "Signature",
              description: "Paused for now.",
              durationMin: 45,
              bufferMin: 10,
              price: 40,
              deposit: 10,
              fullPrepay: false,
              shopId: "loc-ybor",
              isActive: false
            }
          },
          {
            service: {
              id: "srv-private",
              name: "Private Consultation",
              category: "Signature",
              description: "Not online bookable.",
              durationMin: 30,
              bufferMin: 0,
              price: 25,
              deposit: 0,
              fullPrepay: false,
              shopId: "loc-ybor",
              isBookable: false
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });

    render(<BookingForm />);

    expect(screen.getByRole("button", { name: /Paused Cut/ })).toBeDisabled();
    expect(screen.getByText("This service is paused right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Private Consultation/ })).toBeDisabled();
    expect(screen.getByText("This service is not taking online bookings right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("shows a safe next action when the barber has no bookable services", async () => {
    useBarberProfileQueryMock.mockReturnValue({
      data: {
        profile: { username: "wave" },
        shopLocations: [],
        services: []
      },
      isLoading: false,
      error: null
    });

    render(<BookingForm />);

    expect(screen.getByText("No bookable services yet.")).toBeInTheDocument();
    expect(screen.getByText("This barber has not published an active service clients can book. Choose another barber or check back later.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to search" })).toHaveAttribute("href", "/dashboard/client/search");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
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
    expect(screen.queryByText(/^Date$/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find next available" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join waitlist" })).toBeInTheDocument();
    expect(screen.getByText("No times available for this date.")).toBeInTheDocument();
    expect(screen.getByText("Choose a time to continue.")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: "Continue to Review" });
    expect(continueButton).toBeDisabled();
    expect(continueButton.className).toContain("bg-[rgba(255,255,255,0.035)]");
    expect(continueButton.className).not.toContain("bg-[linear-gradient");
  });

  it("shows an explicit loading state while availability proof is loading", async () => {
    useBarberAvailabilityQueryMock.mockReturnValue({
      data: null,
      isLoading: true,
      error: null
    });

    render(<BookingForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Checking available times...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Review" })).toBeDisabled();
  });

  it("renders clean date rail availability states and selected time styling", async () => {
    const today = getDateKey();
    const tomorrow = addDaysToDateKey(today, 1);
    useBarberAvailabilityQueryMock.mockReturnValue({
      data: {
        timezone: "America/New_York",
        slots: [
          slotForDate(today, 14),
          slotForDate(today, 15),
          slotForDate(tomorrow, 16)
        ]
      },
      isLoading: false,
      error: null
    });

    render(<BookingForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const selectedDateOption = screen.getByRole("button", { name: /2 slots/i });
    expect(selectedDateOption).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /1 slot/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /No slots/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText("DATE DATE DATE")).not.toBeInTheDocument();

    const timeButtons = await screen.findAllByRole("button", { name: /AM|PM/ });
    expect(timeButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(timeButtons[0].className).toContain("bg-[#C4F24E]");
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
        timeZone: expect.any(String),
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
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledWith(expect.objectContaining({
        barberId: "barber-wave",
        serviceId: "srv-cut",
        cultureAttribution: {
          source: "culture",
          culturePostId: "post-culture-1",
          cultureAuthorId: "author-profile-1",
          cultureSurface: "client_culture",
          barberId: "barber-wave",
          serviceId: "srv-cut",
          locationId: "loc-ybor",
          targetRoute: expect.any(String),
          cta: "book_barber"
        }
      }));
    });
  });

  it("uses the locked barber canonical location when Culture entry omits locationId", async () => {
    const today = getDateKey();
    const independentLocationId = "independent-barber-43b3cda2";
    const cultureServiceId = "srv-hair-cut-beard-1781175767997";
    const searchGet = vi.fn((key: string) => {
      const params: Record<string, string> = {
        source: "culture",
        culturePostId: "post-culture-1",
        cultureAuthorId: "author-profile-1",
        cultureSurface: "client_culture",
        barberId: "barber-43b3cda2",
        serviceId: cultureServiceId
      };
      return params[key] ?? null;
    });

    useSearchParamsMock.mockReturnValue({ get: searchGet });
    useBookingStoreMock.mockReturnValue({
      selectedLocationId: "generic-shop-location",
      selectedBarberId: "barber-43b3cda2",
      setLocation: vi.fn(),
      setBarber: vi.fn()
    });
    useBarberSearchQueryMock.mockReturnValue({
      data: {
        shops: [
          {
            id: "generic-shop-location",
            name: "Generic Shop",
            city: "Tampa",
            state: "FL",
            address: "1 Generic Way"
          }
        ],
        barbers: [
          {
            barberId: "barber-43b3cda2",
            barberName: "Phillip McGee",
            username: "phillipforsure",
            locationId: independentLocationId
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useBarberProfileQueryMock.mockReturnValue({
      data: {
        profile: {
          username: "phillipforsure",
          shopId: independentLocationId
        },
        shopLocations: [
          {
            id: independentLocationId,
            name: "Phils chair",
            address: "2172 University Square More",
            city: "Tampa",
            state: "FL",
            postalCode: "33607"
          }
        ],
        services: [
          {
            service: {
              id: cultureServiceId,
              name: "Hair Cut & Beard",
              category: "Haircuts",
              description: "Hair Cut & Beard with everything line up.",
              durationMin: 30,
              bufferMin: 0,
              price: 40,
              deposit: 0,
              fullPrepay: false,
              shopId: independentLocationId
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useBarberAvailabilityQueryMock.mockImplementation((params: { locationId?: string; serviceId?: string }) => ({
      data: {
        timezone: "America/New_York",
        service: {
          id: cultureServiceId,
          name: "Hair Cut & Beard",
          durationMin: 30,
          bufferMin: 0,
          price: 40,
          deposit: 0,
          fullPrepay: false
        },
        slots: params.locationId === independentLocationId
          ? [slotForDate(today, 16, {
              locationId: independentLocationId,
              barberId: "barber-43b3cda2",
              serviceId: cultureServiceId
            })]
          : []
      },
      isLoading: false,
      error: null
    }));

    render(<BookingForm />);

    await waitFor(() => {
      expect(useBarberAvailabilityQueryMock).toHaveBeenCalledWith(expect.objectContaining({
        barberId: "barber-43b3cda2",
        serviceId: cultureServiceId,
        locationId: independentLocationId,
        startDate: today,
        days: 14,
        timeZone: expect.any(String)
      }));
    });

    expect(screen.getByText("Culture booking")).toBeInTheDocument();
    expect(screen.getByText("Phils chair")).toBeInTheDocument();
    expect(screen.queryByText("Generic Shop")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /AM|PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Review" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeDisabled();
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
    expect(screen.queryByText("payment_intent")).not.toBeInTheDocument();
    expect(screen.queryByText("payment_routing_records")).not.toBeInTheDocument();
    expect(screen.queryByText("provider_payment_method_id")).not.toBeInTheDocument();
    expect(screen.queryByText("service_reference")).not.toBeInTheDocument();
    expect(screen.queryByText("barber_reference")).not.toBeInTheDocument();
    expect(screen.queryByText("appointment_status_history")).not.toBeInTheDocument();
    expect(screen.queryByText("payout_readiness_status")).not.toBeInTheDocument();

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
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledWith(expect.objectContaining({
        locationId: "loc-ybor",
        barberId: "barber-wave",
        serviceId: "srv-cut",
        appointmentTime: slotForDate(getDateKey(), 14).startsAt,
        clientName: "Jordan Ellis",
        clientPhone: "8135550190",
        paymentMethodId: "pm-default",
        barberName: "wave",
        serviceName: "Signature Precision Cut"
      }));
    });

    expect(await screen.findByText("Appointment booked")).toBeInTheDocument();
    expect(screen.getByText("Confirmation appt-live-1. Visa ending in 4242 is verifying through the server. Activity will show the final receipt state.")).toBeInTheDocument();
    expect(mutatePaymentMock).not.toHaveBeenCalled();
  });

  it("disables confirmation while the server booking request is in progress", async () => {
    useCreateBookingMutationMock.mockReturnValue({
      isPending: true,
      mutateAsync: vi.fn()
    });

    render(<BookingForm />);
    await advanceToReview();

    expect(screen.getByRole("button", { name: "Confirming booking..." })).toBeDisabled();
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

    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    await waitFor(() => {
      expect(mutateBookingMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Payment could not be confirmed. Check your card or try another saved payment method.")).toBeInTheDocument();
    expect(screen.queryByText("Appointment booked")).not.toBeInTheDocument();
  });

  it("returns to time selection when the selected slot is no longer available", async () => {
    const mutateBookingMock = vi.fn().mockRejectedValue(Object.assign(
      new Error("The selected time is no longer available with this barber."),
      { status: 409, code: "schedule_conflict" }
    ));

    useCreateBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: mutateBookingMock
    });

    render(<BookingForm />);
    await advanceToReview();

    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByText("Slot no longer available. Try another time.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pick date and time" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

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
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeDisabled();
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

    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeDisabled();

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
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeEnabled();
  });
});
