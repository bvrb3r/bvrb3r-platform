import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  bookingMock,
  verifyPinMock,
  deactivateMock,
  useKioskPayloadQueryMock,
  useKioskClientSearchQueryMock,
  useKioskBookingMutationMock,
  useVerifyKioskPinMutationMock,
  useKioskDeviceStateMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  bookingMock: vi.fn(),
  verifyPinMock: vi.fn(),
  deactivateMock: vi.fn(),
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

const shopPayload = {
  shop: {
    shopId: "loc-ybor",
    shopName: "The BVRB3R Shop",
    subtitle: "Check in or book your appointment",
    locationLabel: "Ybor City, Tampa",
    mode: "shop" as const
  },
  services: [
    { id: "srv-signature", name: "Signature Cut", category: "Cut", priceCents: 4000, durationMinutes: 45, barberId: "barber-marcus" },
    { id: "srv-lineup", name: "Line Up", category: "Grooming", priceCents: 2000, durationMinutes: 20, barberId: "barber-marcus" },
    { id: "srv-precision", name: "Precision Cut", category: "Cut", priceCents: 4500, durationMinutes: 50, barberId: "barber-tasha" },
    { id: "srv-design", name: "Design / Part", category: "Styling", priceCents: 1500, durationMinutes: 15, barberId: "barber-tasha" }
  ],
  barbers: [
    {
      id: "barber-marcus",
      name: "Marcus Fade",
      publicUsername: "marcusfade",
      liveStatusLabel: "Available",
      nextAvailableAt: "2026-07-28T18:00:00.000Z",
      acceptsWalkIns: true,
      waitDisplayLabel: "About 35 min",
      estimatedWaitMinutes: 35,
      queueAhead: 2
    },
    {
      id: "barber-tasha",
      name: "Tasha James",
      publicUsername: "tashacuts",
      liveStatusLabel: "Available",
      nextAvailableAt: "2026-07-28T17:10:00.000Z",
      acceptsWalkIns: true,
      // Deliberately a free chair, so the zero-wait copy branch is covered
      // alongside marcusfade's 35-minute queue.
      waitDisplayLabel: "No wait",
      estimatedWaitMinutes: 0,
      queueAhead: 0
    },
    {
      id: "barber-andre",
      name: "Andre Rivera",
      publicUsername: "andre_clips",
      liveStatusLabel: "Not available today",
      nextAvailableAt: null,
      acceptsWalkIns: false,
      waitDisplayLabel: "Not available today",
      estimatedWaitMinutes: null,
      queueAhead: 4
    }
  ],
  queue: { activeCount: 2, averageWaitMinutes: 10, kioskEntriesToday: 3 },
  defaults: {
    autoResetSeconds: 45,
    inactivityResetSeconds: 45,
    bookingMode: "next_available" as const,
    allowChooseBarber: true
  }
};

const barberPayload = {
  ...shopPayload,
  shop: { ...shopPayload.shop, shopId: "barber-marcus", shopName: "marcusfade", mode: "barber" as const },
  services: shopPayload.services.slice(0, 2),
  barbers: [shopPayload.barbers[0]]
};

const bookingResult = {
  appointmentId: "appt-1",
  confirmationCode: "BVR-4821",
  barberId: "barber-tasha",
  barberName: "Tasha James",
  serviceId: "srv-precision",
  serviceName: "Precision Cut",
  startsAt: "2026-07-28T17:10:00.000Z",
  shopLabel: "The BVRB3R Shop",
  estimatedWaitMinutes: 10,
  waitDisplayLabel: "About 10 min"
};

/** Fills the details step for the currently selected barber. */
function fillDetails({ service }: { service?: RegExp } = {}) {
  fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: "Jordan Ellis" } });
  fireEvent.change(screen.getByLabelText(/Phone —/i), { target: { value: "8135550101" } });
  fireEvent.change(screen.getByLabelText(/Email —/i), { target: { value: "jordan@example.com" } });
  if (service) {
    fireEvent.click(screen.getByRole("button", { name: service }));
  }
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("kiosk parity screen", () => {
  beforeEach(() => {
    vi.useRealTimers();
    pushMock.mockReset();
    bookingMock.mockReset();
    verifyPinMock.mockReset();
    deactivateMock.mockReset();
    bookingMock.mockResolvedValue(bookingResult);
    verifyPinMock.mockResolvedValue({ ok: true });
    useKioskPayloadQueryMock.mockReturnValue({ data: shopPayload, isLoading: false, error: null, refetch: vi.fn() });
    useKioskClientSearchQueryMock.mockReturnValue({ data: { results: [] }, isLoading: false, error: null });
    useKioskBookingMutationMock.mockReturnValue({ mutateAsync: bookingMock, isPending: false, error: null });
    useVerifyKioskPinMutationMock.mockReturnValue({ mutateAsync: verifyPinMock, isPending: false, error: null });
    useKioskDeviceStateMock.mockReturnValue({ state: {}, isActive: true, activate: vi.fn(), deactivate: deactivateMock });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Privacy-first front door
  // -----------------------------------------------------------------------

  describe("privacy-first front door", () => {
    it("shows the shop name, the fast lane, and one card per barber", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(screen.getByText("The BVRB3R Shop")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Next available chair/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "marcusfade" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "tashacuts" })).toBeInTheDocument();
    });

    it("never shows a barber's real name before the booking is confirmed", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(screen.queryByText(/Marcus Fade/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tasha James/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Andre Rivera/)).not.toBeInTheDocument();
    });

    it("leads the fast lane with the genuinely shortest wait", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      // tashacuts has a free chair against marcusfade's 35-minute queue.
      const fastLane = screen.getByRole("button", { name: /Next available chair/i });
      expect(within(fastLane).getByText(/tashacuts · no wait/)).toBeInTheDocument();
    });

    it("prices each barber card from that barber's own cheapest service", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      // marcusfade's Line Up is $20; tashacuts' Design / Part is $15.
      expect(within(screen.getByRole("button", { name: "marcusfade" })).getByText("From $20")).toBeInTheDocument();
      expect(within(screen.getByRole("button", { name: "tashacuts" })).getByText("From $15")).toBeInTheDocument();
    });

    it("renders wait chips per barber, with No wait when a chair is free", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(within(screen.getByRole("button", { name: "marcusfade" })).getByText("2 ahead · ~35 min")).toBeInTheDocument();
      expect(within(screen.getByRole("button", { name: "tashacuts" })).getByText("No wait")).toBeInTheDocument();
    });

    it("pauses a chair that is not taking bookings instead of dead-ending on it", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      const paused = screen.getByRole("button", { name: "andre_clips" });
      expect(paused).toBeDisabled();
      expect(within(paused).getByText("Chair paused")).toBeInTheDocument();
    });

    it("gives the barber kiosk its two path cards straight away", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: barberPayload, isLoading: false, error: null, refetch: vi.fn() });
      render(<KioskParityScreen shopId="barber-marcus" scope="barber" />);

      expect(screen.getByText("You’re at the chair of")).toBeInTheDocument();
      expect(screen.getByText("marcusfade")).toBeInTheDocument();
      expect(screen.getByText("2 ahead · ~35 min")).toBeInTheDocument();
      expect(screen.queryByText("2 ahead · ~10 min")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Take the next chair/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Pick a future time/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Next available chair/i })).not.toBeInTheDocument();
    });

    it("routes a picked shop barber through the two-path screen", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));

      expect(screen.getByText("You picked")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Take the next chair/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /← Different barber/i })).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Details, consent, per-barber prices
  // -----------------------------------------------------------------------

  describe("details step", () => {
    function openDetailsForTasha() {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
    }

    it("shows only the chosen barber's services, at that barber's prices", () => {
      openDetailsForTasha();

      expect(screen.getByText("Pick your service — tashacuts’s prices")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Precision Cut/ })).toBeInTheDocument();
      expect(screen.getByText("$45")).toBeInTheDocument();
      expect(screen.getByText("$15")).toBeInTheDocument();
      // Marcus's menu must not leak into Tasha's rail.
      expect(screen.queryByRole("button", { name: /Signature Cut/ })).not.toBeInTheDocument();
    });

    it("keeps the confirm action disabled until name, phone, email, service and consent are set", () => {
      openDetailsForTasha();
      const confirm = screen.getByRole("button", { name: /Join the line/i });
      expect(confirm).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: "Jordan Ellis" } });
      fireEvent.change(screen.getByLabelText(/Phone —/i), { target: { value: "8135550101" } });
      fireEvent.change(screen.getByLabelText(/Email —/i), { target: { value: "jordan@example.com" } });
      expect(screen.getByRole("button", { name: /Join the line/i })).toBeDisabled();

      // The booking API rejects a new client with no public username, so the
      // kiosk must not offer a route to that error.
          expect(screen.getByRole("button", { name: /Join the line/i })).toBeDisabled();

      fireEvent.click(screen.getByRole("checkbox"));
      expect(screen.getByRole("button", { name: /Join the line/i })).toBeEnabled();
    });

    it("lets a walk-in book without ever supplying a public username", () => {
      openDetailsForTasha();
      fillDetails({ service: /Precision Cut/ });

      expect(screen.getByLabelText(/BVRB3R username/i)).toHaveValue("");
      expect(screen.getByRole("button", { name: /Join the line/i })).toBeEnabled();
      expect(screen.getByLabelText(/BVRB3R username/i).getAttribute("aria-label")).toMatch(/optional/i);
    });

    it("omits the username from the booking payload when the client leaves it blank", async () => {
      openDetailsForTasha();
      fillDetails({ service: /Precision Cut/ });
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
      fireEvent.click(screen.getByRole("button", { name: /Pay at the chair/i }));

      await waitFor(() => expect(bookingMock).toHaveBeenCalled());
      expect(bookingMock.mock.calls[0][0].publicUsername).toBeUndefined();
    });

    it("exposes consent as a real checkbox with the policy sentence as its name", () => {
      openDetailsForTasha();

      const consent = screen.getByRole("checkbox");
      expect(consent).toHaveAttribute("aria-checked", "false");
      expect(consent.getAttribute("aria-label")).toMatch(/for this booking only/i);

      fireEvent.click(consent);
      expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    });

    it("recognises a returning client without exposing their private contact fields", () => {
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

      openDetailsForTasha();
      fireEvent.change(screen.getByLabelText(/BVRB3R username/i), { target: { value: "phillipmcgee" } });
      fireEvent.click(screen.getByRole("button", { name: /@phillipmcgee/i }));

      expect(screen.getByText("Welcome back,")).toBeInTheDocument();
      expect(screen.queryByText(/McGee/)).not.toBeInTheDocument();
      // A recognised profile satisfies the API on its own — name, phone and
      // email stay empty and the client can still confirm.
      fireEvent.click(screen.getByRole("checkbox"));
      expect(screen.getByRole("button", { name: /Join the line/i })).toBeEnabled();
    });

    it("labels the walk-in wait and the scheduled slot differently in the when-card", () => {
      openDetailsForTasha();
      expect(screen.getByText("Estimated wait")).toBeInTheDocument();
      // tashacuts' chair is free, so the when-card says so rather than "~0 min".
      expect(screen.getAllByText("No wait").length).toBeGreaterThan(0);
    });

    it("routes schedule-ahead through the time step first", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Pick a future time/i }));

      expect(screen.getByText(/Step 1 of 2 — pick a time with tashacuts/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Continue/i })).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/When should the chair be yours/i), {
        target: { value: "2026-08-01T15:30" }
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      expect(screen.getByText(/Step 2 of 2 — your details/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Confirm this slot/i })).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Payment choice, tip, reserving, decline
  // -----------------------------------------------------------------------

  describe("payment, tip and recovery", () => {
    /** Card simulation on: this describe covers the seeded-fixture QA path. */
    function reachPayment() {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" cardSimulationEnabled />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails({ service: /Precision Cut/ });
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
    }

    it("offers card and cash, and never claims the kiosk took the money", () => {
      reachPayment();

      expect(screen.getByText("How would you like to pay, Jordan?")).toBeInTheDocument();
      expect(screen.getByText("Card — after the cut")).toBeInTheDocument();
      expect(screen.getByText("Cash — after the cut")).toBeInTheDocument();
      expect(screen.queryByText(/Paid \$/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Payment successful/i)).not.toBeInTheDocument();
    });

    it("books cash immediately and skips the tip step entirely", async () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Pay at the chair/i }));

      await waitFor(() => expect(bookingMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(/Add a tip/)).not.toBeInTheDocument();
      expect(await screen.findByText("Appointment set")).toBeInTheDocument();
      expect(screen.getByText("Cash after the service")).toBeInTheDocument();
    });

    it("offers four tip tiles with correct amounts and totals", () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));

      expect(screen.getByText("Add a tip for tashacuts?")).toBeInTheDocument();
      expect(screen.getByText("Your Precision Cut is $45.")).toBeInTheDocument();
      expect(screen.getByText("100% of the tip goes to your barber.")).toBeInTheDocument();

      // $45 subtotal: 15% → $6.75, 20% → $9, 25% → $11.25.
      expect(screen.getByText("No tip")).toBeInTheDocument();
      expect(screen.getByText("Total $45")).toBeInTheDocument();
      expect(screen.getByText("+$6.75 tip")).toBeInTheDocument();
      expect(screen.getByText("Total $51.75")).toBeInTheDocument();
      expect(screen.getByText("+$9 tip")).toBeInTheDocument();
      expect(screen.getByText("Total $54")).toBeInTheDocument();
      expect(screen.getByText("+$11.25 tip")).toBeInTheDocument();
      expect(screen.getByText("Total $56.25")).toBeInTheDocument();
    });

    it("shows the reserving state while the booking is in flight", async () => {
      let release: ((value: typeof bookingResult) => void) | undefined;
      bookingMock.mockImplementation(() => new Promise((resolve) => {
        release = resolve;
      }));

      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));
      fireEvent.click(screen.getByRole("button", { name: /20% · Total \$54/ }));

      expect(await screen.findByText("Reserving your chair")).toBeInTheDocument();
      expect(screen.getByText("Working…")).toBeInTheDocument();
      expect(screen.getByText("$54")).toBeInTheDocument();

      await act(async () => {
        release?.(bookingResult);
      });
      expect(await screen.findByText("Appointment set")).toBeInTheDocument();
    });

    it("recovers from a failed booking with retry or cash, and never books twice", async () => {
      bookingMock.mockRejectedValueOnce(new Error("Card declined — no charge was made."));

      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));
      fireEvent.click(screen.getByRole("button", { name: /20% · Total \$54/ }));

      expect(await screen.findByText(/no charge was made/i)).toBeInTheDocument();
      expect(screen.queryByText("Appointment set")).not.toBeInTheDocument();
      expect(bookingMock).toHaveBeenCalledTimes(1);

      // The recovery banner offers both routes out.
      expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Choose cash/i }));

      await waitFor(() => expect(bookingMock).toHaveBeenCalledTimes(2));
      expect(await screen.findByText("Appointment set")).toBeInTheDocument();
      expect(screen.getByText("Cash after the service")).toBeInTheDocument();
    });

    it("sends the real booking payload the API expects", async () => {
      reachPayment();
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));
      fireEvent.click(screen.getByRole("button", { name: /20% · Total \$54/ }));

      await waitFor(() => {
        expect(bookingMock).toHaveBeenCalledWith(expect.objectContaining({
          fullName: "Jordan Ellis",
          phone: "8135550101",
          email: "jordan@example.com",
          serviceId: "srv-precision",
          preferredBarberId: "barber-tasha",
          kioskAction: "book_next_opening"
        }));
      });
    });
  });

  // -----------------------------------------------------------------------
  // Celebration
  // -----------------------------------------------------------------------

  describe("celebration", () => {
    async function bookWithCard() {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" cardSimulationEnabled />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails({ service: /Precision Cut/ });
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
      fireEvent.click(screen.getByRole("button", { name: /Tap, insert, or swipe/i }));
      fireEvent.click(screen.getByRole("button", { name: /20% · Total \$54/ }));
      await screen.findByText("Appointment set");
    }

    it("greets the client by first name and states where they stand", async () => {
      await bookWithCard();

      expect(screen.getByText("You’re in, Jordan")).toBeInTheDocument();
      expect(screen.getByText(/You’re on tashacuts’s line at The BVRB3R Shop/)).toBeInTheDocument();
    });

    it("reveals the barber's real name here and only here", async () => {
      await bookWithCard();

      expect(screen.getByText("Your barber")).toBeInTheDocument();
      expect(screen.getByText("Tasha James")).toBeInTheDocument();
      expect(screen.getByText("@tashacuts")).toBeInTheDocument();
    });

    it("states the payment plan truthfully, including the tip", async () => {
      await bookWithCard();

      expect(screen.getByText("Card after the service · $54 · inc. $9 tip")).toBeInTheDocument();
      expect(screen.queryByText(/^Paid /)).not.toBeInTheDocument();
    });

    it("previews the confirmation text with the real reference code", async () => {
      await bookWithCard();

      expect(screen.getByText(/Your confirmation text · BVRB3R · just now/)).toBeInTheDocument();
      expect(screen.getByText(/BVRB3R: You’re in, Jordan! Precision Cut with tashacuts/)).toBeInTheDocument();
      expect(screen.getByText(/Ref BVR-4821/)).toBeInTheDocument();
    });

    it("renders a scannable QR of the booking reference", async () => {
      await bookWithCard();

      const qr = screen.getByRole("img", { name: "Scan to save your booking" });
      expect(qr).toBeInTheDocument();
      // A real symbol, not a placeholder: version 1 is 21x21 at minimum.
      expect(qr.querySelectorAll("rect").length).toBeGreaterThan(50);
      expect(screen.getByText("BVR-4821")).toBeInTheDocument();
    });

    it("tells the client which number the reminder goes to", async () => {
      await bookWithCard();

      expect(screen.getByText(/We’ll text 8135550101 when the chair is almost yours/)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Attract loop
  // -----------------------------------------------------------------------

  describe("idle attract loop", () => {
    it("wipes client data and shows the attract deck after the inactivity window", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails();

      await act(async () => {
        vi.advanceTimersByTime(46_000);
      });

      expect(screen.getByRole("button", { name: "Tap anywhere to begin" })).toBeInTheDocument();
      expect(screen.getByText(/Resets between clients/)).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Jordan Ellis")).not.toBeInTheDocument();
    });

    it("never fires while a booking is in flight", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let release: ((value: typeof bookingResult) => void) | undefined;
      bookingMock.mockImplementation(() => new Promise((resolve) => {
        release = resolve;
      }));

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails({ service: /Precision Cut/ });
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
      fireEvent.click(screen.getByRole("button", { name: /Pay at the chair/i }));

      await screen.findByText("Reserving your chair");
      await act(async () => {
        vi.advanceTimersByTime(120_000);
      });

      // Still reserving — the wipe must not have interrupted the request.
      expect(screen.getByText("Reserving your chair")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Tap anywhere to begin" })).not.toBeInTheDocument();

      await act(async () => {
        release?.(bookingResult);
      });
      expect(await screen.findByText("Appointment set")).toBeInTheDocument();
    });

    it("rotates through four slides and wakes on a tap", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      await act(async () => {
        vi.advanceTimersByTime(46_000);
      });
      expect(screen.getByText("Welcome to")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(4_300);
      });
      expect(screen.getByText("Your call")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Tap anywhere to begin" }));
      expect(screen.getByRole("button", { name: /Next available chair/i })).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Privacy reset
  // -----------------------------------------------------------------------

  describe("privacy reset", () => {
    async function bookThen() {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails({ service: /Precision Cut/ });
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
      fireEvent.click(screen.getByRole("button", { name: /Pay at the chair/i }));
      await screen.findByText("Appointment set");
      // Settle the commit before any timer advance: the booking resolves in a
      // microtask, and the idle interval must be re-armed from the *done*
      // render before the clock moves, or the advance replays the stale
      // charging-state closure and nothing resets.
      await act(async () => {});
    }

    function expectNoClientData() {
      expect(screen.queryByDisplayValue("Jordan Ellis")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("8135550101")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("jordan@example.com")).not.toBeInTheDocument();
      expect(screen.queryByText("BVR-4821")).not.toBeInTheDocument();
      expect(screen.queryByText("Tasha James")).not.toBeInTheDocument();
      expect(screen.queryByText(/Cash after the service/)).not.toBeInTheDocument();
    }

    it("clears identity, payment and appointment state after completion", async () => {
      await bookThen();
      fireEvent.click(screen.getByRole("button", { name: /Done — next client/i }));

      expectNoClientData();
      // Re-entering the flow finds empty fields, not the last client's.
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      expect(screen.getByLabelText(/Your name/i)).toHaveValue("");
      expect(screen.getByLabelText(/Phone —/i)).toHaveValue("");
      expect(screen.getByLabelText(/Email —/i)).toHaveValue("");
      expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    });

    it("clears everything on the inactivity timeout too", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      await bookThen();

      await act(async () => {
        vi.advanceTimersByTime(50_000);
      });

      expectNoClientData();
    });

    it("clears everything when staff exit with the PIN, and drops the device session", async () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
      fillDetails({ service: /Precision Cut/ });

      fireEvent.click(screen.getByRole("button", { name: "Exit" }));
      fireEvent.change(screen.getByLabelText("Kiosk PIN"), { target: { value: "2468" } });
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Exit" }));

      await waitFor(() => expect(pushMock).toHaveBeenCalled());
      expect(deactivateMock).toHaveBeenCalledTimes(1);
      expectNoClientData();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("keeps the owner's device and language configuration across a reset", async () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" initialLocale="es" />);
      // A client switches to Kreyòl mid-session.
      fireEvent.click(screen.getByRole("button", { name: "Kreyòl" }));
      expect(screen.getByText("Byenveni nan")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
      fireEvent.click(screen.getByRole("button", { name: /Pran pwochen chèz la/i }));
      fireEvent.click(screen.getByRole("button", { name: /Anile epi rekòmanse/i }));

      // Back to the language the kiosk was launched in — the owner's setting,
      // not English and not the last client's pick.
      expect(screen.getByText("Bienvenido a")).toBeInTheDocument();
      expect(deactivateMock).not.toHaveBeenCalled();
    });

    it("clears the entered PIN when the exit dialog is dismissed", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "Exit" }));
      fireEvent.change(screen.getByLabelText("Kiosk PIN"), { target: { value: "1234" } });
      fireEvent.click(screen.getByRole("button", { name: "Stay in kiosk" }));
      fireEvent.click(screen.getByRole("button", { name: "Exit" }));

      expect(screen.getByLabelText("Kiosk PIN")).toHaveValue("");
    });
  });

  // -----------------------------------------------------------------------
  // Staff exit dialog keyboard contract
  // -----------------------------------------------------------------------

  describe("staff exit dialog keyboard contract", () => {
    function openExitDialog() {
      const trigger = screen.getByRole("button", { name: "Exit" });
      trigger.focus();
      fireEvent.click(trigger);
      return trigger;
    }

    it("moves focus into the dialog when it opens", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openExitDialog();

      expect(screen.getByRole("dialog", { name: /Owner PIN to exit/i })).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByLabelText("Kiosk PIN"));
    });

    it("titles the prompt for the scope that owns the kiosk", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: barberPayload, isLoading: false, error: null, refetch: vi.fn() });
      render(<KioskParityScreen shopId="barber-marcus" scope="barber" />);
      openExitDialog();

      expect(screen.getByRole("dialog", { name: /Barber PIN to exit/i })).toBeInTheDocument();
    });

    it("closes on Escape and restores focus to the exact trigger", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const trigger = openExitDialog();

      fireEvent.keyDown(screen.getByLabelText("Kiosk PIN"), { key: "Escape" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it("restores focus to the exact trigger when the dialog is dismissed", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const trigger = openExitDialog();

      fireEvent.click(screen.getByRole("button", { name: "Stay in kiosk" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it("traps Tab inside the dialog so the kiosk behind it stays unreachable", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openExitDialog();

      const pinInput = screen.getByLabelText("Kiosk PIN");
      fireEvent.change(pinInput, { target: { value: "1234" } });
      const dialog = screen.getByRole("dialog");
      const submit = within(dialog).getByRole("button", { name: "Exit" });

      fireEvent.keyDown(pinInput, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(submit);

      fireEvent.keyDown(submit, { key: "Tab" });
      expect(document.activeElement).toBe(pinInput);
    });

    it("masks the PIN so a shoulder-surfer cannot read it off a public screen", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openExitDialog();

      expect(screen.getByLabelText("Kiosk PIN")).toHaveAttribute("type", "password");
    });

    it("reaches the staff exit from the denied state too", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("Access denied"), refetch: vi.fn() });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const trigger = openExitDialog();

      expect(document.activeElement).toBe(screen.getByLabelText("Kiosk PIN"));
      fireEvent.keyDown(screen.getByLabelText("Kiosk PIN"), { key: "Escape" });
      expect(document.activeElement).toBe(trigger);
    });

    it("surfaces a wrong PIN without leaving the dialog", async () => {
      verifyPinMock.mockRejectedValue(new Error("Wrong PIN — try again."));
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openExitDialog();

      fireEvent.change(screen.getByLabelText("Kiosk PIN"), { target: { value: "0000" } });
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Exit" }));

      expect(await screen.findByText(/Wrong PIN/i)).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(pushMock).not.toHaveBeenCalled();
      expect(deactivateMock).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Fallback states
  // -----------------------------------------------------------------------

  describe("fallback states", () => {
    it("renders the denial state with a retry", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("Access denied"), refetch: vi.fn() });
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(screen.getByText("Access denied")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("shows an offline state when the browser loses connectivity", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });

      expect(screen.getByText("You’re offline")).toBeInTheDocument();
    });

    it("shows a recovery state while Retry is in flight and clears it afterwards", async () => {
      let releaseRefetch: (() => void) | undefined;
      const refetch = vi.fn(() => new Promise<void>((resolve) => {
        releaseRefetch = () => resolve();
      }));
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("Access denied"), refetch });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      expect(refetch).toHaveBeenCalledTimes(1);
      expect(screen.getByText("We’re resetting the kiosk")).toBeInTheDocument();

      await act(async () => {
        releaseRefetch?.();
      });
      expect(screen.getByText("Access denied")).toBeInTheDocument();
    });

    it("shows an empty state rather than an unusable front door", () => {
      useKioskPayloadQueryMock.mockReturnValue({
        data: { ...shopPayload, services: [], barbers: [] },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      });
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(screen.getByText("No kiosk options available")).toBeInTheDocument();
    });

    it("shows a loading state before the first payload lands", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: true, error: null, refetch: vi.fn() });
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(screen.getByText("Loading kiosk…")).toBeInTheDocument();
    });
  });
});
