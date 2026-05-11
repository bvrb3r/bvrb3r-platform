import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  usePaymentMethodsQueryMock,
  useAddPaymentMethodMutationMock,
  useCreateSavedPaymentMethodSetupMutationMock,
  useSetDefaultPaymentMethodMutationMock,
  useRenamePaymentMethodMutationMock,
  useRemovePaymentMethodMutationMock
} = vi.hoisted(() => ({
  usePaymentMethodsQueryMock: vi.fn(),
  useAddPaymentMethodMutationMock: vi.fn(),
  useCreateSavedPaymentMethodSetupMutationMock: vi.fn(),
  useSetDefaultPaymentMethodMutationMock: vi.fn(),
  useRenamePaymentMethodMutationMock: vi.fn(),
  useRemovePaymentMethodMutationMock: vi.fn()
}));

vi.mock("@/lib/payments/client", () => ({
  usePaymentMethodsQuery: usePaymentMethodsQueryMock,
  useAddPaymentMethodMutation: useAddPaymentMethodMutationMock,
  useCreateSavedPaymentMethodSetupMutation: useCreateSavedPaymentMethodSetupMutationMock,
  useSetDefaultPaymentMethodMutation: useSetDefaultPaymentMethodMutationMock,
  useRenamePaymentMethodMutation: useRenamePaymentMethodMutationMock,
  useRemovePaymentMethodMutation: useRemovePaymentMethodMutationMock
}));

import { ClientPaymentMethodsPanel } from "@/components/client-experience/client-payment-methods-panel";

function installStripeMock() {
  const handlers: {
    ready?: () => void;
    change?: (event: { complete?: boolean; error?: { message?: string } }) => void;
    loaderror?: (event: { error?: { message?: string } }) => void;
  } = {};
  const cardElementMountMock = vi.fn();
  const cardElementUnmountMock = vi.fn();
  const cardElementOnMock = vi.fn((event: "ready" | "change" | "loaderror", handler: never) => {
    handlers[event] = handler;
  });
  const confirmCardSetupMock = vi.fn().mockResolvedValue({
    setupIntent: {
      payment_method: "pm_wallet_stripe"
    }
  });
  const elementsMock = {
    create: vi.fn().mockReturnValue({
      mount: (target: HTMLElement) => {
        cardElementMountMock(target);
        handlers.ready?.();
        handlers.change?.({ complete: true });
      },
      unmount: cardElementUnmountMock,
      on: cardElementOnMock
    })
  };

  Reflect.set(window, "Stripe", vi.fn().mockReturnValue({
    elements: vi.fn().mockReturnValue(elementsMock),
    confirmCardSetup: confirmCardSetupMock
  }));

  return {
    cardElementMountMock,
    confirmCardSetupMock,
    handlers
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
    Reflect.deleteProperty(window, "Stripe");

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
    const { cardElementMountMock } = installStripeMock();
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

    await waitFor(() => {
      expect(cardElementMountMock).toHaveBeenCalled();
    });
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
    Reflect.set(window, "Stripe", vi.fn().mockReturnValue({
      elements: vi.fn(() => {
        throw new Error("bad publishable key");
      }),
      confirmCardSetup: vi.fn()
    }));
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(await screen.findByText("Secure card form failed to load. Check Stripe publishable key or SetupIntent.")).toBeInTheDocument();
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

