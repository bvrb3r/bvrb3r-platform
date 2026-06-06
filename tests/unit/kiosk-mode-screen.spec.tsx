import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  replaceMock,
  searchParamsState,
  useKioskPayloadQueryMock,
  useKioskBookingMutationMock,
  useVerifyKioskPinMutationMock,
  useKioskWaitlistMutationMock,
  useKioskDeviceStateMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsState: { value: "" },
  useKioskPayloadQueryMock: vi.fn(),
  useKioskBookingMutationMock: vi.fn(),
  useVerifyKioskPinMutationMock: vi.fn(),
  useKioskWaitlistMutationMock: vi.fn(),
  useKioskDeviceStateMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock
  }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value)
}));

vi.mock("@/lib/kiosk/client", () => ({
  useKioskPayloadQuery: useKioskPayloadQueryMock,
  useKioskBookingMutation: useKioskBookingMutationMock,
  useVerifyKioskPinMutation: useVerifyKioskPinMutationMock,
  useKioskWaitlistMutation: useKioskWaitlistMutationMock,
  useKioskDeviceState: useKioskDeviceStateMock
}));

import { KioskModeScreen } from "@/components/kiosk/kiosk-mode-screen";

describe("kiosk mode screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    searchParamsState.value = "";
    pushMock.mockImplementation((href: string) => {
      const url = new URL(href, "https://bvrb3r.demo");
      searchParamsState.value = url.searchParams.toString();
    });
    replaceMock.mockImplementation((href: string) => {
      const url = new URL(href, "https://bvrb3r.demo");
      searchParamsState.value = url.searchParams.toString();
    });
    useKioskPayloadQueryMock.mockReset();
    useKioskBookingMutationMock.mockReset();
    useVerifyKioskPinMutationMock.mockReset();
    useKioskWaitlistMutationMock.mockReset();
    useKioskDeviceStateMock.mockReset();

    useKioskPayloadQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        shop: {
          shopId: "loc-ybor",
          shopName: "BVRB3R Ybor",
          subtitle: "Check in or book your appointment",
          locationLabel: "Ybor City, Tampa"
        },
        services: [
          { id: "srv-cut", name: "Signature Cut", category: "Cut" }
        ],
        barbers: [
          {
            id: "barber-blaze",
            name: "Blaze King",
            liveStatusLabel: "Available",
            nextAvailableAt: "2026-03-27T15:00:00.000Z",
            acceptsWalkIns: true
          }
        ],
        queue: {
          activeCount: 1,
          averageWaitMinutes: 8,
          kioskEntriesToday: 3
        },
        defaults: {
          autoResetSeconds: 10,
          bookingMode: "next_available"
        }
      }
    });
    useKioskBookingMutationMock.mockReturnValue({
      isPending: false,
      error: null,
      mutateAsync: vi.fn()
    });
    useVerifyKioskPinMutationMock.mockReturnValue({
      isPending: false,
      error: null,
      mutateAsync: vi.fn().mockResolvedValue({ ok: true })
    });
    useKioskWaitlistMutationMock.mockReturnValue({
      isPending: false,
      error: null,
      mutateAsync: vi.fn()
    });
    useKioskDeviceStateMock.mockReturnValue({
      state: {},
      isActive: false,
      activate: vi.fn(),
      deactivate: vi.fn()
    });
  });

  it("renders the branded kiosk welcome screen", () => {
    render(<KioskModeScreen shopId="loc-ybor" />);

    expect(screen.getByText("BVRB3R Ybor")).toBeInTheDocument();
    expect(screen.getByText("Book appointment")).toBeInTheDocument();
    expect(screen.getByText("Walk-in")).toBeInTheDocument();
  });

  it("moves into the booking intake flow", () => {
    render(<KioskModeScreen shopId="loc-ybor" />);

    fireEvent.click(screen.getByText("Book appointment").closest("button") as HTMLButtonElement);

    expect(screen.getByText("Full name")).toBeInTheDocument();
    expect(screen.getByText("Preferred barber")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book appointment" })).toBeInTheDocument();
    expect(pushMock).toHaveBeenCalledWith("/kiosk/loc-ybor?mode=booking");
  });

  it("renders barber kiosk mode as a one-barber locked booking flow", () => {
    useKioskPayloadQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        shop: {
          shopId: "barber-blaze",
          shopName: "Blaze King",
          subtitle: "Book your cut with this barber",
          locationLabel: "Ybor City",
          mode: "barber"
        },
        services: [
          { id: "srv-cut", name: "Signature Cut", category: "Cut" }
        ],
        barbers: [
          {
            id: "barber-blaze",
            name: "Blaze King",
            liveStatusLabel: "Bookable",
            nextAvailableAt: "2026-03-27T15:00:00.000Z",
            acceptsWalkIns: true
          }
        ],
        queue: {
          activeCount: 0,
          averageWaitMinutes: 10,
          kioskEntriesToday: 0
        },
        defaults: {
          autoResetSeconds: 10,
          bookingMode: "next_available",
          appointmentSource: "barber_kiosk",
          allowChooseBarber: false
        }
      }
    });

    render(<KioskModeScreen shopId="barber-blaze" scope="barber" />);

    expect(screen.getByText("Barber kiosk")).toBeInTheDocument();
    expect(screen.queryByText("Walk-in")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Book appointment").closest("button") as HTMLButtonElement);

    expect(screen.queryByText("Preferred barber")).not.toBeInTheDocument();
    expect(pushMock).toHaveBeenCalledWith("/kiosk/barber/barber-blaze?mode=booking");
  });

  it("requires kiosk PIN before staff unlock exits", async () => {
    const deactivateMock = vi.fn();
    const verifyPinMock = vi.fn().mockResolvedValue({ ok: true });
    useVerifyKioskPinMutationMock.mockReturnValue({
      isPending: false,
      error: null,
      mutateAsync: verifyPinMock
    });
    useKioskDeviceStateMock.mockReturnValue({
      state: {},
      isActive: false,
      activate: vi.fn(),
      deactivate: deactivateMock
    });
    render(<KioskModeScreen shopId="loc-ybor" />);

    fireEvent.click(screen.getByRole("button", { name: "Staff unlock" }));

    expect(screen.getByText("Exit requires the 4-digit kiosk PIN.")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Exit kiosk PIN"), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));

    expect(await screen.findByText("Exit requires the 4-digit kiosk PIN.")).toBeInTheDocument();
    expect(verifyPinMock).toHaveBeenCalledWith({ scope: "shop", targetReference: "loc-ybor", pin: "2468" });
    expect(deactivateMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/login?redirect=%2Fkiosk%2Floc-ybor&unlock=true");
  });

  it("shows clear validation if required booking fields are missing", async () => {
    render(<KioskModeScreen shopId="loc-ybor" />);

    fireEvent.click(screen.getByText("Book appointment").closest("button") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Book appointment" }));

    expect(await screen.findByText("Add your full name, phone number, and service before booking.")).toBeInTheDocument();
  });
});
