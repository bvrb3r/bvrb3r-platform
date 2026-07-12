import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  bookingMock,
  verifyPinMock,
  useKioskPayloadQueryMock,
  useKioskClientSearchQueryMock,
  useKioskBookingMutationMock,
  useVerifyKioskPinMutationMock,
  useKioskDeviceStateMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  bookingMock: vi.fn(),
  verifyPinMock: vi.fn(),
  useKioskPayloadQueryMock: vi.fn(),
  useKioskClientSearchQueryMock: vi.fn(),
  useKioskBookingMutationMock: vi.fn(),
  useVerifyKioskPinMutationMock: vi.fn(),
  useKioskDeviceStateMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

vi.mock("@/lib/kiosk/client", () => ({
  useKioskPayloadQuery: useKioskPayloadQueryMock,
  useKioskClientSearchQuery: useKioskClientSearchQueryMock,
  useKioskBookingMutation: useKioskBookingMutationMock,
  useVerifyKioskPinMutation: useVerifyKioskPinMutationMock,
  useKioskDeviceState: useKioskDeviceStateMock
}));

import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";

const payload = {
  shop: {
    shopId: "loc-ybor",
    shopName: "BVRB3R Ybor",
    subtitle: "Check in or book your appointment",
    locationLabel: "Ybor City, Tampa"
  },
  services: [{ id: "srv-cut", name: "Signature Cut", category: "Cut" }],
  barbers: [{
    id: "barber-blaze",
    name: "Blaze King",
    liveStatusLabel: "Available",
    nextAvailableAt: "2026-07-12T18:00:00.000Z",
    acceptsWalkIns: true,
    waitDisplayLabel: "About 10 min"
  }],
  queue: {
    activeCount: 1,
    averageWaitMinutes: 10,
    kioskEntriesToday: 3
  },
  defaults: {
    autoResetSeconds: 20,
    bookingMode: "next_available" as const,
    allowChooseBarber: true
  }
};

describe("kiosk parity screen", () => {
  beforeEach(() => {
    vi.useRealTimers();
    pushMock.mockReset();
    bookingMock.mockReset();
    verifyPinMock.mockReset();
    useKioskPayloadQueryMock.mockReturnValue({ data: payload, isLoading: false, error: null });
    useKioskClientSearchQueryMock.mockReturnValue({ data: { results: [] }, isLoading: false, error: null });
    useKioskBookingMutationMock.mockReturnValue({ mutateAsync: bookingMock, isPending: false, error: null });
    useVerifyKioskPinMutationMock.mockReturnValue({ mutateAsync: verifyPinMock, isPending: false, error: null });
    useKioskDeviceStateMock.mockReturnValue({ state: {}, isActive: true, activate: vi.fn(), deactivate: vi.fn() });
  });

  it("keeps Next Available server-assigned instead of forcing Barber selection", () => {
    render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

    fireEvent.click(screen.getByRole("button", { name: /Book next available/i }));

    expect(screen.getByText("Client details")).toBeInTheDocument();
    expect(screen.queryByText("Public chairs")).not.toBeInTheDocument();
    expect(screen.getByText("Next eligible Barber")).toBeInTheDocument();
  });

  it("keeps Pick a Barber as a distinct shop flow", () => {
    render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

    fireEvent.click(screen.getByRole("button", { name: /Pick a Barber/i }));

    expect(screen.getByText("Public chairs")).toBeInTheDocument();
    expect(screen.getByText("Blaze King")).toBeInTheDocument();
  });

  it("uses a returning Client profile without exposing private contact fields", () => {
    useKioskClientSearchQueryMock.mockReturnValue({
      data: {
        results: [{
          profileId: "profile-client",
          displayName: "Phillip McGee",
          publicUsername: "phillipmcgee",
          locationLabel: "Tampa, FL",
          roleLabel: "CLIENT"
        }]
      },
      isLoading: false,
      error: null
    });

    render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
    fireEvent.click(screen.getByRole("button", { name: /Book next available/i }));
    fireEvent.change(screen.getByLabelText("BVRB3R Username"), { target: { value: "phillipmcgee" } });
    fireEvent.click(screen.getByRole("button", { name: /This is me/i }));

    expect(screen.getByText(/saved phone and email will be used privately/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Phone number")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("submits a real booking request without claiming payment success", async () => {
    bookingMock.mockResolvedValue({
      appointmentId: "appt-1",
      confirmationCode: "BVR123",
      barberId: "barber-blaze",
      barberName: "Blaze King",
      serviceId: "srv-cut",
      serviceName: "Signature Cut",
      startsAt: "2026-07-12T18:00:00.000Z",
      shopLabel: "BVRB3R Ybor",
      waitDisplayLabel: "About 10 min"
    });

    render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
    fireEvent.click(screen.getByRole("button", { name: /Book next available/i }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jordan Ellis" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "8135550101" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
    fireEvent.click(screen.getByLabelText("Accept kiosk booking policy"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /Reserve my spot/i }));

    await waitFor(() => {
      expect(bookingMock).toHaveBeenCalledWith(expect.objectContaining({
        fullName: "Jordan Ellis",
        phone: "8135550101",
        email: "jordan@example.com",
        serviceId: "srv-cut",
        kioskAction: "book_next_opening"
      }));
    });
    expect(await screen.findByText("Payment remains due until Barber Checkout confirms it.")).toBeInTheDocument();
  });
});
