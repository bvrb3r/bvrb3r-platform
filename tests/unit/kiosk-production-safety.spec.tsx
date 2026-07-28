import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveKioskPublicHandle } from "@/lib/kiosk/identity";
import { KIOSK_COPY, KIOSK_LOCALES } from "@/lib/kiosk/locale";
import { isKioskFixtureTarget, KIOSK_FIXTURE_BARBER_ID, KIOSK_FIXTURE_SHOP_ID } from "@/lib/kiosk/local-fixture";

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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

vi.mock("@/lib/kiosk/client", () => ({
  useKioskPayloadQuery: useKioskPayloadQueryMock,
  useKioskClientSearchQuery: useKioskClientSearchQueryMock,
  useKioskBookingMutation: useKioskBookingMutationMock,
  useVerifyKioskPinMutation: useVerifyKioskPinMutationMock,
  useKioskDeviceState: useKioskDeviceStateMock
}));

import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";

const REAL_NAME = "Phillip McGee";

/** A barber with NO public handle — the case that used to leak a real name. */
function payloadWithoutHandle(scope: "shop" | "barber") {
  return {
    shop: {
      shopId: scope === "barber" ? "barber-nohandle" : "loc-ybor",
      // The service layer emits an empty public label rather than the name.
      shopName: scope === "barber" ? "" : "The BVRB3R Shop",
      subtitle: "",
      locationLabel: "Ybor City, Tampa",
      mode: scope
    },
    services: [
      { id: "srv-cut", name: "Signature Cut", category: "Cut", priceCents: 4000, durationMinutes: 45, barberId: "barber-nohandle" }
    ],
    barbers: [{
      id: "barber-nohandle",
      name: REAL_NAME,
      publicUsername: null,
      liveStatusLabel: "Available",
      nextAvailableAt: "2026-07-28T17:10:00.000Z",
      acceptsWalkIns: true,
      waitDisplayLabel: "No wait",
      estimatedWaitMinutes: 0,
      queueAhead: 0
    }],
    queue: { activeCount: 0, averageWaitMinutes: 0, kioskEntriesToday: 0 },
    defaults: { autoResetSeconds: 45, inactivityResetSeconds: 45, bookingMode: "next_available" as const, allowChooseBarber: true }
  };
}

const bookingResult = {
  appointmentId: "appt-1",
  confirmationCode: "BVR-9001",
  barberId: "barber-nohandle",
  barberName: REAL_NAME,
  serviceId: "srv-cut",
  serviceName: "Signature Cut",
  startsAt: "2026-07-28T17:10:00.000Z",
  shopLabel: "The BVRB3R Shop",
  estimatedWaitMinutes: 0
};

function fillDetails() {
  fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: "Jordan Ellis" } });
  fireEvent.change(screen.getByLabelText(/Phone —/i), { target: { value: "8135550101" } });
  fireEvent.change(screen.getByLabelText(/Email —/i), { target: { value: "jordan@example.com" } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("kiosk production safety", () => {
  beforeEach(() => {
    pushMock.mockReset();
    bookingMock.mockReset();
    verifyPinMock.mockReset();
    bookingMock.mockResolvedValue(bookingResult);
    useKioskClientSearchQueryMock.mockReturnValue({ data: { results: [] }, isLoading: false, error: null });
    useKioskBookingMutationMock.mockReturnValue({ mutateAsync: bookingMock, isPending: false, error: null });
    useVerifyKioskPinMutationMock.mockReturnValue({ mutateAsync: verifyPinMock, isPending: false, error: null });
    useKioskDeviceStateMock.mockReturnValue({ state: {}, isActive: true, activate: vi.fn(), deactivate: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -----------------------------------------------------------------------
  // 1. Privacy: a missing handle must never fall back to the real name
  // -----------------------------------------------------------------------

  describe("public identity resolution", () => {
    it("returns a genuine handle when one exists", () => {
      expect(resolveKioskPublicHandle("tashacuts")).toBe("tashacuts");
      expect(resolveKioskPublicHandle("@tashacuts")).toBe("tashacuts");
      expect(resolveKioskPublicHandle(null, "", "marcusfade")).toBe("marcusfade");
    });

    it("refuses internal references that are identifiers, not names", () => {
      expect(resolveKioskPublicHandle("barber-blaze")).toBeNull();
      expect(resolveKioskPublicHandle("client-42")).toBeNull();
      expect(resolveKioskPublicHandle("independent-barber-7")).toBeNull();
      expect(resolveKioskPublicHandle("srv-cut")).toBeNull();
      expect(resolveKioskPublicHandle("shop_ybor")).toBeNull();
      expect(resolveKioskPublicHandle("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBeNull();
    });

    it("returns null when there is no handle instead of falling back", () => {
      expect(resolveKioskPublicHandle(null, undefined, "")).toBeNull();
      expect(resolveKioskPublicHandle()).toBeNull();
      expect(resolveKioskPublicHandle("   ")).toBeNull();
      expect(resolveKioskPublicHandle("@")).toBeNull();
    });

    it("differs from the app-wide helper, which does fall back to a name", async () => {
      const { getClientFacingBarberName } = await import("@/lib/marketplace/client-facing");

      // The shared helper is right for signed-in surfaces and wrong for a
      // kiosk: with no handle it happily returns the real name.
      expect(getClientFacingBarberName({ name: REAL_NAME })).toBe(REAL_NAME);
      // The kiosk resolver, given the same absence of a handle, returns null.
      expect(resolveKioskPublicHandle(null)).toBeNull();
    });
  });

  describe("a barber with no public handle", () => {
    it("labels the barber front door without naming the barber", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: payloadWithoutHandle("barber"), isLoading: false, error: null, refetch: vi.fn() });
      const { container } = render(<KioskParityScreen shopId="barber-nohandle" scope="barber" />);

      expect(container.textContent).not.toContain(REAL_NAME);
      expect(screen.getByText("This chair")).toBeInTheDocument();
    });

    it("labels a handleless shop chair as Chair N, never as the person", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: payloadWithoutHandle("shop"), isLoading: false, error: null, refetch: vi.fn() });
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(container.textContent).not.toContain(REAL_NAME);
      expect(screen.getByRole("button", { name: "Chair 1" })).toBeInTheDocument();
    });

    it("keeps the real name off every screen from the front door to payment", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: payloadWithoutHandle("shop"), isLoading: false, error: null, refetch: vi.fn() });
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      fireEvent.click(screen.getByRole("button", { name: "Chair 1" }));
      expect(container.textContent).not.toContain(REAL_NAME);

      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      expect(container.textContent).not.toContain(REAL_NAME);

      fillDetails();
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
      expect(container.textContent).not.toContain(REAL_NAME);
    });

    it("reveals the real name only after the booking is confirmed", async () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: payloadWithoutHandle("shop"), isLoading: false, error: null, refetch: vi.fn() });
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      fireEvent.click(screen.getByRole("button", { name: "Chair 1" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails();
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
      fireEvent.click(screen.getByRole("button", { name: /Pay at the chair/i }));

      expect(await screen.findByText("Appointment set")).toBeInTheDocument();
      // Now, and only now.
      expect(within(screen.getByText("Your barber").closest("div")!).getByText(REAL_NAME)).toBeInTheDocument();
      // And with no handle there is no "@" line to print.
      expect(container.textContent).not.toContain("@This chair");
      expect(container.textContent).not.toContain("@Chair 1");
    });

    it("names the chair in the client's language", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: payloadWithoutHandle("shop"), isLoading: false, error: null, refetch: vi.fn() });
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      fireEvent.click(screen.getByRole("button", { name: "Español" }));
      expect(screen.getByRole("button", { name: "Silla 1" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Kreyòl" }));
      expect(screen.getByRole("button", { name: "Chèz 1" })).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Payment honesty: no simulated card success in production
  // -----------------------------------------------------------------------

  describe("card payment in production", () => {
    function reachPayment() {
      useKioskPayloadQueryMock.mockReturnValue({ data: payloadWithoutHandle("shop"), isLoading: false, error: null, refetch: vi.fn() });
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "Chair 1" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails();
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
    }

    it("defaults to card simulation OFF when the prop is not supplied", () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));

      expect(screen.getByText("Card isn’t set up at this kiosk yet")).toBeInTheDocument();
    });

    it("never calls the booking action when card is chosen", () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));

      expect(bookingMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Appointment set")).not.toBeInTheDocument();
    });

    it("never shows a reader, a tip step, or a charged total", () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));

      expect(screen.queryByText("Reserving your chair")).not.toBeInTheDocument();
      expect(screen.queryByText(/Add a tip/)).not.toBeInTheDocument();
      expect(screen.queryByText("Total $40")).not.toBeInTheDocument();
      expect(screen.queryByText(/Paid/)).not.toBeInTheDocument();
    });

    it("states plainly that nothing was charged and nothing is booked", () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));

      expect(screen.getByText(/Nothing was charged and nothing is booked yet/)).toBeInTheDocument();
    });

    it("offers a real next step: reserve now and settle at the chair", async () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));
      fireEvent.click(screen.getByRole("button", { name: /Choose cash/i }));

      await waitFor(() => expect(bookingMock).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("Appointment set")).toBeInTheDocument();
      expect(screen.getByText("Cash after the service")).toBeInTheDocument();
    });

    it("lets the client back out to the payment choice", () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));
      fireEvent.click(screen.getByRole("button", { name: "← Back" }));

      expect(screen.getByText("Card — after the cut")).toBeInTheDocument();
      expect(bookingMock).not.toHaveBeenCalled();
    });

    it("localizes the unavailable state", () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: "Español" }));
      fireEvent.click(screen.getByRole("button", { name: /Acerca, inserta o desliza/i }));
      expect(screen.getByText("La tarjeta aún no está activa en este kiosco")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Kreyòl" }));
      expect(screen.getByText("Kat la poko aktive nan kyòs sa a")).toBeInTheDocument();
    });

    it("translates the unavailable copy in every supported language", () => {
      for (const locale of KIOSK_LOCALES.filter((item) => item !== "en")) {
        expect(KIOSK_COPY[locale].cardUnavailable).not.toBe(KIOSK_COPY.en.cardUnavailable);
        expect(KIOSK_COPY[locale].cardUnavailableBody).not.toBe(KIOSK_COPY.en.cardUnavailableBody);
      }
    });

    it("still lets cash book through the real path", async () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Pay at the chair/i }));

      await waitFor(() => expect(bookingMock).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("Appointment set")).toBeInTheDocument();
    });
  });

  describe("card simulation is fixture-only", () => {
    function reachPaymentWithSimulation() {
      useKioskPayloadQueryMock.mockReturnValue({ data: payloadWithoutHandle("shop"), isLoading: false, error: null, refetch: vi.fn() });
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" cardSimulationEnabled />);
      fireEvent.click(screen.getByRole("button", { name: "Chair 1" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails();
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
    }

    it("reaches the tip step only when the server switched simulation on", () => {
      reachPaymentWithSimulation();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));

      expect(screen.getByText(/Add a tip/)).toBeInTheDocument();
      expect(screen.queryByText("Card isn’t set up at this kiosk yet")).not.toBeInTheDocument();
    });

    it("cannot be switched on by the flag alone once NODE_ENV is production", () => {
      vi.stubEnv("KIOSK_LOCAL_FIXTURE", "true");
      vi.stubEnv("NODE_ENV", "production");

      // This is exactly what the kiosk pages pass to the screen.
      expect(isKioskFixtureTarget("shop", KIOSK_FIXTURE_SHOP_ID)).toBe(false);
      expect(isKioskFixtureTarget("barber", KIOSK_FIXTURE_BARBER_ID)).toBe(false);
    });

    it("is never enabled for a real shop or barber, flag on or off", () => {
      vi.stubEnv("KIOSK_LOCAL_FIXTURE", "true");
      vi.stubEnv("NODE_ENV", "development");

      expect(isKioskFixtureTarget("shop", KIOSK_FIXTURE_SHOP_ID)).toBe(true);
      // A real shop never gets the simulation, even with the flag on.
      expect(isKioskFixtureTarget("shop", "loc-ybor")).toBe(false);
      expect(isKioskFixtureTarget("barber", "barber-blaze")).toBe(false);
    });

    it("is off when the fixture flag is unset", () => {
      vi.stubEnv("KIOSK_LOCAL_FIXTURE", "");
      expect(isKioskFixtureTarget("shop", KIOSK_FIXTURE_SHOP_ID)).toBe(false);
    });
  });
});
