import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  usePaymentMethodsQueryMock,
  useAddPaymentMethodMutationMock,
  useCreateSavedPaymentMethodSetupMutationMock,
  useSetDefaultPaymentMethodMutationMock,
  useRemovePaymentMethodMutationMock
} = vi.hoisted(() => ({
  usePaymentMethodsQueryMock: vi.fn(),
  useAddPaymentMethodMutationMock: vi.fn(),
  useCreateSavedPaymentMethodSetupMutationMock: vi.fn(),
  useSetDefaultPaymentMethodMutationMock: vi.fn(),
  useRemovePaymentMethodMutationMock: vi.fn()
}));

vi.mock("@/lib/payments/client", () => ({
  usePaymentMethodsQuery: usePaymentMethodsQueryMock,
  useAddPaymentMethodMutation: useAddPaymentMethodMutationMock,
  useCreateSavedPaymentMethodSetupMutation: useCreateSavedPaymentMethodSetupMutationMock,
  useSetDefaultPaymentMethodMutation: useSetDefaultPaymentMethodMutationMock,
  useRemovePaymentMethodMutation: useRemovePaymentMethodMutationMock
}));

import { ClientPaymentMethodsPanel } from "@/components/client-experience/client-payment-methods-panel";

function installStripeMock() {
  const paymentElementMountMock = vi.fn();
  const paymentElementUnmountMock = vi.fn();
  const submitMock = vi.fn().mockResolvedValue({});
  const confirmSetupMock = vi.fn().mockResolvedValue({
    setupIntent: {
      payment_method: "pm_wallet_stripe"
    }
  });
  const elementsMock = {
    create: vi.fn().mockReturnValue({
      mount: paymentElementMountMock,
      unmount: paymentElementUnmountMock
    }),
    submit: submitMock
  };

  Reflect.set(window, "Stripe", vi.fn().mockReturnValue({
    elements: vi.fn().mockReturnValue(elementsMock),
    confirmSetup: confirmSetupMock
  }));

  return {
    paymentElementMountMock,
    confirmSetupMock,
    submitMock
  };
}

describe("client payment methods panel", () => {
  beforeEach(() => {
    usePaymentMethodsQueryMock.mockReset();
    useAddPaymentMethodMutationMock.mockReset();
    useCreateSavedPaymentMethodSetupMutationMock.mockReset();
    useSetDefaultPaymentMethodMutationMock.mockReset();
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
          isDefault: true,
          createdAt: "2026-05-11T12:00:00.000Z",
          label: "Visa ending in 4242"
        }
      })
    });
  });

  it("renders a Stripe card-on-file form without provider reference fields", async () => {
    const { paymentElementMountMock } = installStripeMock();
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(screen.getAllByText("Card on file").length).toBeGreaterThan(0);
    expect(screen.getByText("Add a card so booking and rebooking stay fast. Protected and encrypted by Stripe.")).toBeInTheDocument();
    expect(screen.getByLabelText("Stripe secure card entry: Card number, expiration, CVC, and postal code")).toBeInTheDocument();
    expect(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings.")).toBeInTheDocument();

    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Provider customer ref")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment method ref")).not.toBeInTheDocument();
    expect(screen.queryByText("Brand")).not.toBeInTheDocument();
    expect(screen.queryByText("Last 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Exp month")).not.toBeInTheDocument();
    expect(screen.queryByText("Exp year")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(paymentElementMountMock).toHaveBeenCalled();
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
    fireEvent.change(screen.getByLabelText("Cardholder name"), {
      target: { value: "Jordan Ellis" }
    });
    fireEvent.change(screen.getByLabelText("ZIP"), {
      target: { value: "33612" }
    });

    expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings."));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });
  });

  it("saves a Stripe card without sending raw card metadata from the client", async () => {
    const { confirmSetupMock } = installStripeMock();
    const addMethodMock = vi.fn().mockResolvedValue({
      method: {
        id: "pm-wallet",
        provider: "stripe",
        brand: "Visa",
        last4: "4242",
        expMonth: 4,
        expYear: 2028,
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
    fireEvent.change(screen.getByLabelText("Cardholder name"), {
      target: { value: "Jordan Ellis" }
    });
    fireEvent.change(screen.getByLabelText("ZIP"), {
      target: { value: "33612" }
    });
    fireEvent.click(screen.getByLabelText("I authorize BVRB3R to save this card on file for future bookings."));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save card" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));

    await waitFor(() => {
      expect(confirmSetupMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(addMethodMock).toHaveBeenCalledWith(expect.objectContaining({
        provider: "stripe",
        providerCustomerId: "cus_wallet",
        providerPaymentMethodId: "pm_wallet_stripe",
        isDefault: true
      }));
    });

    const payload = addMethodMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("brand");
    expect(payload).not.toHaveProperty("last4");
    expect(payload).not.toHaveProperty("expMonth");
    expect(payload).not.toHaveProperty("expYear");
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
          isDefault: true,
          createdAt: "2026-05-11T12:00:00.000Z",
          label: "Visa ending in 4242"
        }]
      },
      isLoading: false,
      error: null
    });

    render(<ClientPaymentMethodsPanel initialMethods={[]} isSignedInClient />);

    expect(screen.getByText("Visa •••• 4242")).toBeInTheDocument();
    expect(screen.getByText("Default for bookings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change card" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove/ })).toBeInTheDocument();
    expect(screen.queryByText(/cus_/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pm_/)).not.toBeInTheDocument();
  });
});
