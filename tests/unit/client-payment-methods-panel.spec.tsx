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
  stripeCardMock,
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
  stripeCardMock: {
    focus: vi.fn()
  },
  confirmCardSetupMock: vi.fn(),
  stripeMockState: {
    autoReady: true,
    complete: true,
    loadError: null as string | null
  }
}));

vi.mock("@/lib/payments/client", () => ({
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

  return {
    Elements: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    CardElement: (props: {
      onReady?: (element: typeof stripeCardMock) => void;
      onChange?: (event: { complete?: boolean; error?: { message?: string } }) => void;
      onLoadError?: (event: { error?: { message?: string } }) => void;
    }) => {
      const { onReady, onChange, onLoadError } = props;

      React.useEffect(() => {
        if (stripeMockState.loadError) {
          onLoadError?.({ error: { message: stripeMockState.loadError } });
        } else if (stripeMockState.autoReady) {
          onReady?.(stripeCardMock);
          onChange?.({ complete: stripeMockState.complete });
        }
      }, [onChange, onLoadError, onReady]);

      return React.createElement(
        "div",
        { "data-testid": "mock-stripe-card-element" },
        React.createElement("iframe", { title: "Secure card input" })
      );
    },
    useStripe: () => ({
      confirmCardSetup: confirmCardSetupMock
    }),
    useElements: () => ({
      getElement: () => stripeCardMock
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
    stripeCardMock.focus.mockReset();
    stripeMockState.autoReady = true;
    stripeMockState.complete = true;
    stripeMockState.loadError = null;
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
    expect(screen.getByText("Card number")).toBeInTheDocument();
    expect(screen.getByText("MM/YY")).toBeInTheDocument();
    expect(screen.getByText("CVC")).toBeInTheDocument();
    expect(screen.getByText("ZIP")).toBeInTheDocument();
    expect(screen.getByLabelText("Card number, MM/YY, CVC, and ZIP")).toBeInTheDocument();
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

    expect(await screen.findByTestId("mock-stripe-card-element")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading secure card form...")).not.toBeInTheDocument());
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
    fireEvent.click(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings."));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });
  });

  it("keeps Save card disabled until Stripe reports complete card details", async () => {
    installStripeMock();
    stripeMockState.complete = false;
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

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
    fireEvent.click(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings."));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));

    await waitFor(() => {
      expect(confirmCardSetupMock).toHaveBeenCalledTimes(1);
    });
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
    expect(await screen.findByText("Phil Stripe Card")).toBeInTheDocument();
    expect(screen.getByText(/4242/)).toBeInTheDocument();
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
    expect(await screen.findByText(/4242/)).toBeInTheDocument();
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

    expect(await screen.findByText("Secure card form failed to load. Stripe setup is not ready.")).toBeInTheDocument();
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

    expect(await screen.findByText("Secure card form failed to load. Stripe setup is not ready.")).toBeInTheDocument();
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

    expect(await screen.findByText("Secure card form failed to load. Stripe setup is not ready.")).toBeInTheDocument();
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

    expect(screen.getByText("Phil Stripe Card")).toBeInTheDocument();
    expect(screen.getByText(/4242/)).toBeInTheDocument();
    expect(screen.getByText("Default for bookings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove/ })).toBeInTheDocument();
    expect(screen.queryByText(/cus_/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pm_/)).not.toBeInTheDocument();
  });
});

