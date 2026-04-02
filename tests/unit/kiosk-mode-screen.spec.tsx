import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  replaceMock,
  searchParamsState,
  useKioskPayloadQueryMock,
  useKioskBookingMutationMock,
  useKioskWaitlistMutationMock,
  useKioskDeviceStateMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsState: { value: "" },
  useKioskPayloadQueryMock: vi.fn(),
  useKioskBookingMutationMock: vi.fn(),
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

  it("routes staff unlock through login", () => {
    render(<KioskModeScreen shopId="loc-ybor" />);

    fireEvent.click(screen.getByRole("button", { name: "Staff unlock" }));

    expect(pushMock).toHaveBeenCalledWith("/login?redirect=%2Fkiosk%2Floc-ybor&unlock=true");
  });

  it("shows clear validation if required booking fields are missing", async () => {
    render(<KioskModeScreen shopId="loc-ybor" />);

    fireEvent.click(screen.getByText("Book appointment").closest("button") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Book appointment" }));

    expect(await screen.findByText("Add your full name, phone number, and service before booking.")).toBeInTheDocument();
  });
});
