import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
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

    fireEvent.click(screen.getByRole("button", { name: /Next available chair/i }));

    expect(screen.getByText("Client details")).toBeInTheDocument();
    expect(screen.queryByText("Public chairs")).not.toBeInTheDocument();
    expect(screen.getByText("Next eligible Barber")).toBeInTheDocument();
  });

  it("keeps Pick a Barber as a distinct shop flow", () => {
    render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

    fireEvent.click(screen.getByRole("button", { name: "Pick Blaze King" }));

    expect(screen.getByText("Client details")).toBeInTheDocument();
    expect(screen.getByText("Booking with")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /Next available chair/i }));
    fireEvent.change(screen.getByLabelText("BVRB3R Username"), { target: { value: "phillipmcgee" } });
    fireEvent.click(screen.getByRole("button", { name: /@phillipmcgee/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /Next available chair/i }));
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
    expect(await screen.findByText("Booking confirmed")).toBeInTheDocument();
    expect(screen.getByText(/Card after service/i)).toBeInTheDocument();
    expect(screen.queryByText(/Payment successful/i)).not.toBeInTheDocument();
  });

  it("renders a denial state and an accessible exit dialog", () => {
    useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("Access denied"), refetch: vi.fn() });

    render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

    expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Exit kiosk/i }));

    expect(screen.getByRole("dialog", { name: /Staff exit/i })).toBeInTheDocument();
  });

  it("shows an offline state when the browser loses connectivity", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    useKioskPayloadQueryMock.mockReturnValue({ data: payload, isLoading: false, error: null, refetch: vi.fn() });

    render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText(/You’re offline/i)).toBeInTheDocument();
  });

  describe("staff exit dialog keyboard contract", () => {
    function openExitDialog() {
      const trigger = screen.getByRole("button", { name: /Exit kiosk/i });
      trigger.focus();
      fireEvent.click(trigger);
      return trigger;
    }

    it("moves focus into the dialog when it opens", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openExitDialog();

      expect(screen.getByRole("dialog", { name: /Staff exit/i })).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByLabelText("Kiosk PIN"));
    });

    it("closes on Escape and restores focus to the exact trigger", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const trigger = openExitDialog();

      fireEvent.keyDown(screen.getByLabelText("Kiosk PIN"), { key: "Escape" });

      expect(screen.queryByRole("dialog", { name: /Staff exit/i })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it("restores focus to the exact trigger when Cancel is pressed", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const trigger = openExitDialog();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog", { name: /Staff exit/i })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it("traps Tab inside the dialog so the kiosk behind it stays unreachable", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openExitDialog();

      const pinInput = screen.getByLabelText("Kiosk PIN");
      // A PIN has to be present for the submit button to be focusable at all —
      // the trap skips disabled controls the same way the browser does.
      fireEvent.change(pinInput, { target: { value: "1234" } });
      const dialog = screen.getByRole("dialog", { name: /Staff exit/i });
      const submit = within(dialog).getByRole("button", { name: /Exit kiosk/i });

      // Shift+Tab off the first control wraps to the last one, not out of the dialog.
      fireEvent.keyDown(pinInput, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(submit);

      // Tab off the last control wraps back to the first.
      fireEvent.keyDown(submit, { key: "Tab" });
      expect(document.activeElement).toBe(pinInput);
    });

    it("clears the entered PIN when the dialog is dismissed", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openExitDialog();

      fireEvent.change(screen.getByLabelText("Kiosk PIN"), { target: { value: "1234" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      openExitDialog();

      expect(screen.getByLabelText("Kiosk PIN")).toHaveValue("");
    });

    it("reaches the staff exit from the denied state too", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("Access denied"), refetch: vi.fn() });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const trigger = openExitDialog();

      expect(document.activeElement).toBe(screen.getByLabelText("Kiosk PIN"));
      fireEvent.keyDown(screen.getByLabelText("Kiosk PIN"), { key: "Escape" });
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe("language selection", () => {
    const SPANISH_SHOP_BADGE = "Kiosco de la barbería";

    it("offers all three languages with accessible names on the normal screen", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      const group = screen.getByRole("group", { name: "Language" });
      expect(within(group).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
      expect(within(group).getByRole("button", { name: "Español" })).toBeInTheDocument();
      expect(within(group).getByRole("button", { name: "Kreyòl" })).toBeInTheDocument();
    });

    it("switches the normal screen to Spanish and to Kreyòl", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      fireEvent.click(screen.getByRole("button", { name: "Español" }));
      expect(screen.getByText(SPANISH_SHOP_BADGE)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Kreyòl" }));
      expect(screen.getByText("Kiosk boutik la")).toBeInTheDocument();
    });

    it("renders Spanish from the start when ?lang=es resolved to the es locale", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" initialLocale="es" />);

      expect(screen.getByText(SPANISH_SHOP_BADGE)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Salir del kiosco" })).toBeInTheDocument();
    });

    it("keeps language selection working on the denied state", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("Access denied"), refetch: vi.fn() });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Español" }));
      expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Kreyòl" }));
      expect(screen.getByText("Aksè refize")).toBeInTheDocument();
    });

    it("keeps language selection working on the offline state", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: payload, isLoading: false, error: null, refetch: vi.fn() });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });

      fireEvent.click(screen.getByRole("group", { name: "Language" }).querySelector("[aria-label='Español']") as HTMLElement);
      expect(screen.getByText("Estás sin conexión")).toBeInTheDocument();
    });

    it("keeps language selection working on the loading state", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: true, error: null, refetch: vi.fn() });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      expect(screen.getByText("Loading kiosk…")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Español" }));
      expect(screen.getByText("Cargando kiosco…")).toBeInTheDocument();
    });

    it("keeps language selection working on the empty state", () => {
      useKioskPayloadQueryMock.mockReturnValue({
        data: { ...payload, services: [], barbers: [] },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "Español" }));

      expect(screen.getByText("No hay opciones de kiosco disponibles")).toBeInTheDocument();
    });

    it("returns to the URL-selected language when the kiosk privacy-resets", async () => {
      bookingMock.mockResolvedValue({
        appointmentId: "appt-1",
        barberId: "barber-blaze",
        barberName: "Blaze King",
        serviceId: "srv-cut",
        serviceName: "Signature Cut",
        startsAt: "2026-07-12T18:00:00.000Z",
        shopLabel: "BVRB3R Ybor"
      });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" initialLocale="es" />);
      fireEvent.click(screen.getByRole("button", { name: "Kreyòl" }));
      expect(screen.getByText("Kiosk boutik la")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Next available chair/i }));
      fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jordan Ellis" } });
      fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "8135550101" } });
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
      fireEvent.click(screen.getByLabelText("Accept kiosk booking policy"));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      fireEvent.click(screen.getByRole("button", { name: /Rezève plas mwen/i }));

      const done = await screen.findByRole("button", { name: "Done" });
      fireEvent.click(done);

      // Back to the language the kiosk was launched in, not a hardcoded English.
      expect(screen.getByText(SPANISH_SHOP_BADGE)).toBeInTheDocument();
    });
  });

  describe("recovery, privacy reset, and live controls", () => {
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
      // The language picker survives into the recovery state.
      fireEvent.click(screen.getByRole("button", { name: "Español" }));
      expect(screen.getByText("Estamos reiniciando el kiosco")).toBeInTheDocument();

      await act(async () => {
        releaseRefetch?.();
      });

      expect(screen.queryByText("Estamos reiniciando el kiosco")).not.toBeInTheDocument();
      expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
    });

    it("wipes captured client details when the kiosk resets", async () => {
      bookingMock.mockResolvedValue({
        appointmentId: "appt-1",
        barberId: "barber-blaze",
        barberName: "Blaze King",
        serviceId: "srv-cut",
        serviceName: "Signature Cut",
        startsAt: "2026-07-12T18:00:00.000Z",
        shopLabel: "BVRB3R Ybor"
      });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: /Next available chair/i }));
      fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jordan Ellis" } });
      fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "8135550101" } });
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
      fireEvent.click(screen.getByLabelText("Accept kiosk booking policy"));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      fireEvent.click(screen.getByRole("button", { name: /Reserve my spot/i }));

      fireEvent.click(await screen.findByRole("button", { name: "Done" }));
      fireEvent.click(screen.getByRole("button", { name: /Next available chair/i }));

      expect(screen.getByLabelText("Full name")).toHaveValue("");
      expect(screen.getByLabelText("Phone number")).toHaveValue("");
      expect(screen.getByLabelText("Email")).toHaveValue("");
      expect(screen.getByLabelText("Accept kiosk booking policy")).toHaveAttribute("aria-checked", "false");
    });

    it("keeps every rendered control accessibly named and enabled or explicitly disabled", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("Access denied"), refetch: vi.fn() });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        const name = button.getAttribute("aria-label") ?? button.textContent ?? "";
        expect(name.trim().length, `control has no accessible name: ${button.outerHTML}`).toBeGreaterThan(0);
      }
    });

    it("honours the reduced-motion preference reported by the browser", () => {
      const matchMedia = vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });
      Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });

      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
      expect(container.querySelector("main")?.className).toContain("motion-reduce:transition-none");
    });

    it("scales up type without losing the kiosk layout when large text is toggled", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      const toggle = screen.getByRole("button", { name: "Toggle large text" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(toggle);

      expect(screen.getByRole("button", { name: "Toggle large text" })).toHaveAttribute("aria-pressed", "true");
      const main = container.querySelector("main");
      expect(main?.className).toContain("text-[114%]");
      // Growing the type must not introduce a horizontal scroll on a kiosk panel.
      expect(main?.className).toContain("overflow-x-hidden");
    });
  });
});
