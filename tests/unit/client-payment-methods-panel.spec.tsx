import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  usePaymentMethodsQueryMock,
  useAddPaymentMethodMutationMock,
  useCreateSavedPaymentMethodSetupMutationMock,
  useSetDefaultPaymentMethodMutationMock,
  useRenamePaymentMethodMutationMock,
  useRemovePaymentMethodMutationMock,
  loadStripeMock,
  stripeCardNumberMock,
  confirmCardSetupMock,
  stripeMockState
} = vi.hoisted(() => ({
  usePaymentMethodsQueryMock: vi.fn(),
  useAddPaymentMethodMutationMock: vi.fn(),
  useCreateSavedPaymentMethodSetupMutationMock: vi.fn(),
  useSetDefaultPaymentMethodMutationMock: vi.fn(),
  useRenamePaymentMethodMutationMock: vi.fn(),
  useRemovePaymentMethodMutationMock: vi.fn(),
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
    elementsOptions: [] as unknown[],
    mountCount: {
      cardNumber: 0,
      cardExpiry: 0,
      cardCvc: 0
    },
    unmountCount: {
      cardNumber: 0,
      cardExpiry: 0,
      cardCvc: 0
    }
  }
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
  useSetDefaultPaymentMethodMutation: useSetDefaultPaymentMethodMutationMock,
  useRenamePaymentMethodMutation: useRenamePaymentMethodMutationMock,
  useRemovePaymentMethodMutation: useRemovePaymentMethodMutationMock
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
      const initialCallbacks = React.useRef({ onReady, onChange, onLoadError });

      React.useEffect(() => {
        stripeMockState.mountCount[field] += 1;
        let cancelled = false;

        Promise.resolve().then(() => {
          if (cancelled) {
            return;
          }

          const shouldFail = stripeMockState.loadError === field || (field === "cardNumber" && Boolean(stripeMockState.loadError));
          if (shouldFail) {
            initialCallbacks.current.onLoadError?.({ error: { message: stripeMockState.loadError ?? "Stripe iframe failed" } });
          } else if (stripeMockState.autoReady) {
            initialCallbacks.current.onReady?.(element);
            initialCallbacks.current.onChange?.({ complete: stripeMockState.complete[field] });
          }
        });

        return () => {
          cancelled = true;
          stripeMockState.unmountCount[field] += 1;
        };
      }, []);

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

import { ClientPaymentMethodsPanel } from "@/components/client-experience/client-payment-methods-panel";

function installStripeMock() {
  loadStripeMock.mockResolvedValue({});
  confirmCardSetupMock.mockResolvedValue({
    setupIntent: {
      payment_method: "pm_wallet_stripe"
    }
  });

  return {
    confirmCardSetupMock
  };
}

describe("client payment methods panel", () => {
  beforeEach(() => {
    usePaymentMethodsQueryMock.mockReset();
    useAddPaymentMethodMutationMock.mockReset();
    useCreateSavedPaymentMethodSetupMutationMock.mockReset();
    useSetDefaultPaymentMethodMutationMock.mockReset();
    useRenamePaymentMethodMutationMock.mockReset();
    useRemovePaymentMethodMutationMock.mockReset();
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
    stripeMockState.mountCount = {
      cardNumber: 0,
      cardExpiry: 0,
      cardCvc: 0
    };
    stripeMockState.unmountCount = {
      cardNumber: 0,
      cardExpiry: 0,
      cardCvc: 0
    };
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

    useSetDefaultPaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useRemovePaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useRenamePaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useCreateSavedPaymentMethodSetupMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        provider: "stripe",
        mode: "setup",
        clientSecret: "seti_wallet_secret",
        customerId: "cus_wallet",
        publishableKey: "pk_test_wallet"
      })
    });
    useAddPaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        method: {
          id: "pm-wallet",
          provider: "stripe",
          brand: "Visa",
          last4: "4242",
          expMonth: 4,
          expYear: 2028,
          nickname: null,
          isDefault: true,
          createdAt: "2026-05-11T12:00:00.000Z",
          label: "Visa ending in 4242"
        }
      })
    });
  });

  it("renders a Stripe card-on-file form without provider reference fields", async () => {
    installStripeMock();
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(screen.getAllByText("Card on file").length).toBeGreaterThan(0);
    expect(screen.getByText("Add a card so booking and rebooking stay fast. Protected and encrypted by Stripe.")).toBeInTheDocument();
    expect(await screen.findByText("Card number")).toBeInTheDocument();
    expect(screen.getByText("MM/YY")).toBeInTheDocument();
    expect(screen.getByText("CVC")).toBeInTheDocument();
    expect(screen.getByText("ZIP")).toBeInTheDocument();
    expect(screen.getByTestId("postal-code-input")).toBeInTheDocument();
    expect(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings.")).toBeInTheDocument();

    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Provider customer ref")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment method ref")).not.toBeInTheDocument();
    expect(screen.queryByText("Brand")).not.toBeInTheDocument();
    expect(screen.queryByText("Last 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Exp month")).not.toBeInTheDocument();
    expect(screen.queryByText("Exp year")).not.toBeInTheDocument();
    expect(screen.queryByText("Cardholder name")).not.toBeInTheDocument();
    expect(screen.queryByText("Stripe secure card entry")).not.toBeInTheDocument();

    expect(await screen.findByTestId("mock-stripe-card-number-element")).toBeInTheDocument();
    expect(screen.getByTestId("mock-stripe-card-expiry-element")).toBeInTheDocument();
    expect(screen.getByTestId("mock-stripe-card-cvc-element")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading secure card fields...")).not.toBeInTheDocument());
    expect(screen.getByText("Secure card form ready.")).toBeInTheDocument();
    expect(stripeMockState.elementsOptions.length).toBeGreaterThan(0);
    expect(stripeMockState.elementsOptions.every((options) => options === undefined)).toBe(true);
    const cardWrapper = screen.getByTestId("stripe-card-number-field");
    expect(cardWrapper).toHaveClass("min-w-[280px]");
    expect(screen.getByTestId("stripe-mm-yy-field")).toHaveClass("min-w-[110px]");
    expect(screen.getByTestId("stripe-cvc-field")).toHaveClass("min-w-[90px]");
    expect(screen.getByTestId("stripe-zip-field")).toHaveClass("min-w-[110px]");
    expect(cardWrapper).toHaveStyle({
      pointerEvents: "auto",
      cursor: "text"
    });
    expect(cardWrapper.closest("fieldset[disabled]")).toBeNull();
    expect(cardWrapper.querySelector("[data-stripe-card-overlay='true']")).not.toBeInTheDocument();
    expect(cardWrapper.childElementCount).toBe(1);
    fireEvent.click(cardWrapper);
    expect(stripeCardNumberMock.focus).toHaveBeenCalledTimes(1);
  });

  it("requires card-on-file authorization before saving", async () => {
    installStripeMock();
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
    fireEvent.change(screen.getByTestId("postal-code-input"), {
      target: { value: "33612" }
    });
    fireEvent.click(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings."));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });
  });

  it("does not remount the Stripe card element when authorization changes", async () => {
    installStripeMock();
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(await screen.findByTestId("mock-stripe-card-number-element")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading secure card fields...")).not.toBeInTheDocument());
    expect(stripeMockState.mountCount.cardNumber).toBe(1);
    expect(stripeMockState.mountCount.cardExpiry).toBe(1);
    expect(stripeMockState.mountCount.cardCvc).toBe(1);

    fireEvent.change(screen.getByTestId("postal-code-input"), {
      target: { value: "33612" }
    });
    fireEvent.click(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings."));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });

    expect(stripeMockState.mountCount.cardNumber).toBe(1);
    expect(stripeMockState.mountCount.cardExpiry).toBe(1);
    expect(stripeMockState.mountCount.cardCvc).toBe(1);
  });

  it("does not remount the Stripe card element when the nickname modal opens", async () => {
    installStripeMock();
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(await screen.findByTestId("mock-stripe-card-number-element")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading secure card fields...")).not.toBeInTheDocument());
    expect(stripeMockState.mountCount.cardNumber).toBe(1);

    fireEvent.change(screen.getByTestId("postal-code-input"), {
      target: { value: "33612" }
    });
    fireEvent.click(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings."));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));

    expect(await screen.findByText("Name this card")).toBeInTheDocument();
    expect(stripeMockState.mountCount.cardNumber).toBe(1);

    fireEvent.change(screen.getByPlaceholderText("Example: Phil Stripe Card"), {
      target: { value: "Phil Stripe Card" }
    });
    expect(stripeMockState.mountCount.cardNumber).toBe(1);
  });

  it("keeps Save card disabled until Stripe reports complete card details", async () => {
    installStripeMock();
    stripeMockState.complete = {
      cardNumber: false,
      cardExpiry: true,
      cardCvc: true
    };
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(await screen.findByText("Secure card form ready.")).toBeInTheDocument();
    fireEvent.change(await screen.findByTestId("postal-code-input"), {
      target: { value: "33612" }
    });
    fireEvent.click(await screen.findByLabelText("I authorize BVRB3R to save this card on file for future bookings."));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
    });
  });

  it("saves a Stripe card without sending raw card metadata from the client", async () => {
    const { confirmCardSetupMock } = installStripeMock();
    const addMethodMock = vi.fn().mockResolvedValue({
      method: {
        id: "pm-wallet",
        provider: "stripe",
        brand: "Visa",
        last4: "4242",
        expMonth: 4,
        expYear: 2028,
        nickname: "Phil Stripe Card",
        isDefault: true,
        createdAt: "2026-05-11T12:00:00.000Z",
        label: "Visa ending in 4242"
      }
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });
    useAddPaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: addMethodMock
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
    });
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
    expect(confirmCardSetupMock).toHaveBeenCalledWith("seti_wallet_secret", expect.objectContaining({
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
        providerCustomerId: "cus_wallet",
        providerPaymentMethodId: "pm_wallet_stripe",
        nickname: "Phil Stripe Card",
        isDefault: true
      }));
    });

    const payload = addMethodMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("brand");
    expect(payload).not.toHaveProperty("last4");
    expect(payload).not.toHaveProperty("expMonth");
    expect(payload).not.toHaveProperty("expYear");
    expect((await screen.findAllByText("Phil Stripe Card")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4242/).length).toBeGreaterThan(0);
  });

  it("defaults a blank card nickname to the card brand and last four", async () => {
    const { confirmCardSetupMock } = installStripeMock();
    const addMethodMock = vi.fn().mockResolvedValue({
      method: {
        id: "pm-wallet",
        provider: "stripe",
        brand: "Visa",
        last4: "4242",
        expMonth: 4,
        expYear: 2028,
        nickname: null,
        isDefault: true,
        createdAt: "2026-05-11T12:00:00.000Z",
        label: "Visa ending in 4242"
      }
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });
    useAddPaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: addMethodMock
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(await screen.findByText("Secure card form ready.")).toBeInTheDocument();
    fireEvent.change(await screen.findByTestId("postal-code-input"), {
      target: { value: "33612" }
    });
    fireEvent.click(await screen.findByLabelText("I authorize BVRB3R to save this card on file for future bookings."));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));
    await waitFor(() => {
      expect(confirmCardSetupMock).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Save Card" }));

    await waitFor(() => {
      expect(addMethodMock).toHaveBeenCalledWith(expect.not.objectContaining({
        nickname: expect.any(String)
      }));
    });
    expect((await screen.findAllByText(/4242/)).length).toBeGreaterThan(0);
  });

  it("shows a Stripe mount failure message when Elements cannot load", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    loadStripeMock.mockResolvedValue(null);
    useCreateSavedPaymentMethodSetupMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        provider: "stripe",
        mode: "setup",
        clientSecret: "seti_wallet_failure_secret",
        customerId: "cus_wallet",
        publishableKey: "pk_test_wallet_failure"
      })
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect((await screen.findAllByText("Secure card fields did not finish loading. Refresh and try again.")).length).toBeGreaterThan(0);
    consoleErrorSpy.mockRestore();
  });

  it("shows a Stripe mount failure message when the card element load fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    installStripeMock();
    stripeMockState.loadError = "Stripe iframe failed";
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect((await screen.findAllByText("Secure card fields did not finish loading. Refresh and try again.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Secure card form ready.")).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it("shows a Stripe setup error when the publishable key is missing", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useCreateSavedPaymentMethodSetupMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        provider: "stripe",
        mode: "setup",
        clientSecret: "seti_wallet_missing_key_secret",
        customerId: "cus_wallet",
        publishableKey: ""
      })
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect((await screen.findAllByText("Secure card form failed to load. Stripe publishable key is missing.")).length).toBeGreaterThan(0);
    consoleErrorSpy.mockRestore();
  });

  it("shows a Stripe setup error when the setup intent client secret is missing", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useCreateSavedPaymentMethodSetupMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        provider: "stripe",
        mode: "setup",
        clientSecret: "",
        customerId: "cus_wallet",
        publishableKey: "pk_test_wallet_missing_secret"
      })
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect((await screen.findAllByText("Secure card form failed to load. SetupIntent was not created.")).length).toBeGreaterThan(0);
    consoleErrorSpy.mockRestore();
  });

  it("renders the saved default card without raw provider references", () => {
    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: [{
          id: "pm-wallet",
          provider: "stripe",
          brand: "Visa",
          last4: "4242",
          expMonth: 4,
          expYear: 2028,
          nickname: "Phil Stripe Card",
          isDefault: true,
          createdAt: "2026-05-11T12:00:00.000Z",
          label: "Visa ending in 4242"
        }]
      },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(screen.getAllByText("Phil Stripe Card").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4242/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Default for bookings").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove/ })).toBeInTheDocument();
    expect(screen.queryByText(/cus_/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pm_/)).not.toBeInTheDocument();
  });

  it("treats the only saved card as the wallet default when the server flag is missing", () => {
    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: [{
          id: "pm-wallet",
          provider: "stripe",
          brand: "Visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2034,
          nickname: "phil stripe card",
          isDefault: false,
          createdAt: "2026-05-11T12:00:00.000Z",
          label: "Visa ending in 4242"
        }],
        defaultPaymentMethodId: null
      },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(screen.getAllByText("phil stripe card").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Default for bookings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Make default" })).not.toBeInTheDocument();
  });

  it("shows Make default only for non-default saved cards", () => {
    const setDefaultMock = vi.fn().mockResolvedValue({
      method: {
        id: "pm-business",
        provider: "stripe",
        brand: "Mastercard",
        last4: "4444",
        expMonth: 11,
        expYear: 2030,
        nickname: "Business Card",
        isDefault: true,
        createdAt: "2026-05-12T12:00:00.000Z",
        label: "Mastercard ending in 4444"
      },
      defaultPaymentMethodId: "pm-business"
    });
    useSetDefaultPaymentMethodMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: setDefaultMock
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: [{
          id: "pm-wallet",
          provider: "stripe",
          brand: "Visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2034,
          nickname: "phil stripe card",
          isDefault: true,
          createdAt: "2026-05-11T12:00:00.000Z",
          label: "Visa ending in 4242"
        }, {
          id: "pm-business",
          provider: "stripe",
          brand: "Mastercard",
          last4: "4444",
          expMonth: 11,
          expYear: 2030,
          nickname: "Business Card",
          isDefault: false,
          createdAt: "2026-05-12T12:00:00.000Z",
          label: "Mastercard ending in 4444"
        }],
        defaultPaymentMethodId: "pm-wallet"
      },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(screen.getAllByText("phil stripe card").length).toBeGreaterThan(0);
    expect(screen.getByText("Business Card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make default" })).toBeInTheDocument();
  });
});
