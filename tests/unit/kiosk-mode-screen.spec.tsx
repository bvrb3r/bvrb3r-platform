import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  replaceMock,
  searchParamsState,
  useKioskPayloadQueryMock,
  useKioskClientSearchQueryMock,
  useKioskBookingMutationMock,
  useVerifyKioskPinMutationMock,
  useKioskWaitlistMutationMock,
  useKioskDeviceStateMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsState: { value: "" },
  useKioskPayloadQueryMock: vi.fn(),
  useKioskClientSearchQueryMock: vi.fn(),
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
  useKioskClientSearchQuery: useKioskClientSearchQueryMock,
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
    useKioskClientSearchQueryMock.mockReset();
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
    useKioskClientSearchQueryMock.mockReturnValue({
      data: { results: [] },
      isLoading: false,
      error: null
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
    expect(screen.getByText("Next available barber")).toBeInTheDocument();
    expect(screen.getByText("I already have a barber")).toBeInTheDocument();
    expect(screen.getByText("I already have an appointment")).toBeInTheDocument();
  });

  it("moves into the booking intake flow", () => {
    render(<KioskModeScreen shopId="loc-ybor" />);

    fireEvent.click(screen.getByText("Next available barber").closest("button") as HTMLButtonElement);

    expect(screen.getByText("BVRB3R Username")).toBeInTheDocument();
    expect(screen.getByText("Full name")).toBeInTheDocument();
    expect(screen.getByText("Preferred barber")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book next opening" })).toBeInTheDocument();
    expect(pushMock).toHaveBeenCalledWith("/kiosk/loc-ybor?mode=booking");
  });

  it("renders username before private intake fields", () => {
    render(<KioskModeScreen shopId="loc-ybor" />);

    fireEvent.click(screen.getByText("Next available barber").closest("button") as HTMLButtonElement);

    const username = screen.getByText("BVRB3R Username");
    const fullName = screen.getByText("Full name");
    const phone = screen.getByText("Phone number");
    const email = screen.getByText("Email");
    const service = screen.getByText("Service");

    expect(username.compareDocumentPosition(fullName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(username.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(username.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(email.compareDocumentPosition(service) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows public-safe autosuggest results and selects an existing profile", async () => {
    const bookingMock = vi.fn().mockResolvedValue({
      appointmentId: "appt-1",
      confirmationCode: "BVR123",
      barberId: "barber-blaze",
      barberName: "Blaze King",
      serviceId: "srv-cut",
      serviceName: "Signature Cut",
      startsAt: "2026-03-27T15:00:00.000Z",
      shopLabel: "BVRB3R Ybor",
      clientPublicUsername: "phillipmcgee",
      waitDisplayLabel: "About 10 min"
    });
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
    useKioskBookingMutationMock.mockReturnValue({
      isPending: false,
      error: null,
      mutateAsync: bookingMock
    });

    render(<KioskModeScreen shopId="loc-ybor" />);

    fireEvent.click(screen.getByText("Next available barber").closest("button") as HTMLButtonElement);

    expect(screen.getByText("@phillipmcgee")).toBeInTheDocument();
    expect(screen.getByText("Phillip McGee - Tampa, FL - CLIENT")).toBeInTheDocument();
    expect(screen.queryByText("8135550101")).not.toBeInTheDocument();
    expect(screen.queryByText("phillip@example.com")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("This is me").closest("button") as HTMLButtonElement);
    expect(screen.getByText("Welcome back, @phillipmcgee.")).toBeInTheDocument();
    expect(screen.getByText("Saved phone and email will be used privately for booking updates.")).toBeInTheDocument();
    expect(screen.queryByText("(813) 555-0101")).not.toBeInTheDocument();
    expect(screen.queryByText("name@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Phone number")).not.toBeInTheDocument();
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
    expect(screen.getByText("Service")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Book next opening" }));

    await waitFor(() => {
      expect(bookingMock).toHaveBeenCalledWith(expect.objectContaining({
        selectedProfileId: "profile-client",
        publicUsername: "@phillipmcgee",
        serviceId: "srv-cut"
      }));
    });
    expect(bookingMock).toHaveBeenCalledWith(expect.not.objectContaining({
      phone: "(813) 555-0101",
      email: "name@example.com"
    }));
    expect(bookingMock).toHaveBeenCalledWith(expect.not.objectContaining({
      phone: expect.any(String),
      email: expect.any(String)
    }));
  });

  it("shows loading and no-match username states", () => {
    useKioskClientSearchQueryMock.mockReturnValue({
      data: { results: [] },
      isLoading: true,
      error: null
    });

    const { rerender } = render(<KioskModeScreen shopId="loc-ybor" />);
    fireEvent.click(screen.getByText("Next available barber").closest("button") as HTMLButtonElement);
    fireEvent.change(screen.getByLabelText("BVRB3R Username"), { target: { value: "@zz" } });

    expect(screen.getByText("Searching BVRB3R profiles...")).toBeInTheDocument();

    useKioskClientSearchQueryMock.mockReturnValue({
      data: { results: [] },
      isLoading: false,
      error: null
    });
    rerender(<KioskModeScreen shopId="loc-ybor" />);

    expect(screen.getByText("No profile found for @zz. New here? Keep this username and finish your info below.")).toBeInTheDocument();
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
    expect(screen.queryByText("I already have a barber")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Book next opening").closest("button") as HTMLButtonElement);

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

    fireEvent.click(screen.getByText("Next available barber").closest("button") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Book next opening" }));

    expect(await screen.findByText("Choose your BVRB3R username before confirming.")).toBeInTheDocument();
  });
});
