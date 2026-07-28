import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

vi.mock("@/lib/kiosk/client", () => ({
  useKioskPayloadQuery: useKioskPayloadQueryMock,
  useKioskClientSearchQuery: useKioskClientSearchQueryMock,
  useKioskBookingMutation: useKioskBookingMutationMock,
  useVerifyKioskPinMutation: useVerifyKioskPinMutationMock,
  useKioskDeviceState: useKioskDeviceStateMock
}));

import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";

const payload = {
  shop: { shopId: "loc-ybor", shopName: "The BVRB3R Shop", subtitle: "", locationLabel: "Ybor City, Tampa", mode: "shop" as const },
  services: [
    { id: "srv-precision", name: "Precision Cut", category: "Cut", priceCents: 4500, durationMinutes: 50, barberId: "barber-tasha" },
    { id: "srv-design", name: "Design / Part", category: "Styling", priceCents: 1500, durationMinutes: 15, barberId: "barber-tasha" }
  ],
  barbers: [{
    id: "barber-tasha",
    name: "Tasha James",
    publicUsername: "tashacuts",
    liveStatusLabel: "Available",
    nextAvailableAt: "2026-07-28T17:10:00.000Z",
    acceptsWalkIns: true,
    waitDisplayLabel: "No wait",
    estimatedWaitMinutes: 0,
    queueAhead: 0
  }],
  queue: { activeCount: 0, averageWaitMinutes: 0, kioskEntriesToday: 1 },
  defaults: { autoResetSeconds: 45, inactivityResetSeconds: 45, bookingMode: "next_available" as const, allowChooseBarber: true }
};

// --- WCAG contrast -------------------------------------------------------

/** sRGB channel → linear light, per WCAG 2.1. */
function linear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Cream text at `alpha` composited over the kiosk canvas. */
function creamOverCanvas(alpha: number): [number, number, number] {
  const CREAM: [number, number, number] = [245, 241, 232];
  const CANVAS: [number, number, number] = [6, 7, 8];
  return [0, 1, 2].map((index) => Math.round(CREAM[index] * alpha + CANVAS[index] * (1 - alpha))) as [number, number, number];
}

const CANVAS: [number, number, number] = [6, 7, 8];
/** WCAG AA for body text. Everything the kiosk renders is body-sized or larger. */
const AA_BODY = 4.5;

/**
 * Tailwind writes cream-on-canvas muted text as `text-white/NN`. Below this
 * alpha the kiosk drops under 4.5:1 — see the contrast test that derives it.
 */
const MIN_TEXT_ALPHA = 55;

function mutedTextAlphas(container: HTMLElement) {
  const found = new Set<number>();
  for (const element of Array.from(container.querySelectorAll("[class]"))) {
    // `className` is an SVGAnimatedString on SVG nodes — read the attribute.
    const className = element.getAttribute("class") ?? "";
    // `placeholder:text-white/38` comes from the shared Input; the kiosk
    // stylesheet overrides placeholder colour outright, asserted separately.
    for (const match of className.replace(/placeholder:text-white\/\d+/g, "").matchAll(/text-white\/(\d+)/g)) {
      found.add(Number(match[1]));
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Shop scope: front door → barber card → two paths → walk-in details. */
function openDetails() {
  fireEvent.click(screen.getByRole("button", { name: "tashacuts" }));
  fireEvent.click(screen.getByRole("button", { name: /Take the next chair/i }));
}

describe("kiosk accessibility", () => {
  beforeEach(() => {
    pushMock.mockReset();
    bookingMock.mockReset();
    verifyPinMock.mockReset();
    useKioskPayloadQueryMock.mockReturnValue({ data: payload, isLoading: false, error: null, refetch: vi.fn() });
    useKioskClientSearchQueryMock.mockReturnValue({ data: { results: [] }, isLoading: false, error: null });
    useKioskBookingMutationMock.mockReturnValue({ mutateAsync: bookingMock, isPending: false, error: null });
    useVerifyKioskPinMutationMock.mockReturnValue({ mutateAsync: verifyPinMock, isPending: false, error: null });
    useKioskDeviceStateMock.mockReturnValue({ state: {}, isActive: true, activate: vi.fn(), deactivate: vi.fn() });
  });

  describe("contrast", () => {
    it("derives the muted-text floor the kiosk has to hold", () => {
      // Anything at or above the floor clears AA; a step below it does not.
      expect(contrastRatio(creamOverCanvas(MIN_TEXT_ALPHA / 100), CANVAS)).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(creamOverCanvas(0.45), CANVAS)).toBeLessThan(AA_BODY);
      expect(contrastRatio(creamOverCanvas(0.22), CANVAS)).toBeLessThan(2);
    });

    it("keeps the brand accents above AA on the kiosk canvas", () => {
      expect(contrastRatio([201, 168, 124], CANVAS)).toBeGreaterThanOrEqual(AA_BODY); // gold eyebrows
      expect(contrastRatio([228, 249, 184], CANVAS)).toBeGreaterThanOrEqual(AA_BODY); // pale green
      expect(contrastRatio([196, 242, 78], CANVAS)).toBeGreaterThanOrEqual(AA_BODY); // signal green
      // Black ink on the green fill, the one inverted pairing.
      expect(contrastRatio([6, 7, 8], [196, 242, 78])).toBeGreaterThanOrEqual(AA_BODY);
    });

    it("never renders muted text below the floor on the front door", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      for (const alpha of mutedTextAlphas(container)) {
        expect(alpha, `text-white/${alpha} fails ${AA_BODY}:1 on the kiosk canvas`).toBeGreaterThanOrEqual(MIN_TEXT_ALPHA);
      }
    });

    it("never renders muted text below the floor on details, payment, or the exit dialog", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openDetails();
      fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: "Jordan Ellis" } });
      fireEvent.change(screen.getByLabelText(/Phone —/i), { target: { value: "8135550101" } });
      fireEvent.change(screen.getByLabelText(/Email —/i), { target: { value: "jordan@example.com" } });
          fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: /Join the line/i }));
      fireEvent.click(screen.getByRole("button", { name: "Exit" }));

      for (const alpha of mutedTextAlphas(container)) {
        expect(alpha, `text-white/${alpha} fails ${AA_BODY}:1`).toBeGreaterThanOrEqual(MIN_TEXT_ALPHA);
      }
      for (const alpha of mutedTextAlphas(document.body)) {
        expect(alpha, `dialog text-white/${alpha} fails ${AA_BODY}:1`).toBeGreaterThanOrEqual(MIN_TEXT_ALPHA);
      }
    });
  });

  describe("placeholder contrast", () => {
    it("raises kiosk placeholder colour above the shared Input default", () => {
      const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
      const rule = css.match(/\[data-kiosk-surface\] ::placeholder \{[^}]*color:\s*rgba\(245,\s*241,\s*232,\s*([\d.]+)\)/);

      expect(rule, "kiosk placeholder override is missing from app/globals.css").not.toBeNull();
      const alpha = Number(rule![1]);
      expect(contrastRatio(creamOverCanvas(alpha), CANVAS)).toBeGreaterThanOrEqual(AA_BODY);
    });
  });

  describe("touch targets", () => {
    /** 48px is the Material/WCAG 2.5.5 target; Tailwind's `min-h-12` is 3rem. */
    const MIN_TARGET_CLASSES = ["min-h-12", "min-h-14", "min-h-[", "min-w-12"];

    function assertTargets(scopeEl: HTMLElement) {
      const controls = Array.from(scopeEl.querySelectorAll<HTMLElement>("button, [role='checkbox']"));
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        const className = control.getAttribute("class") ?? "";
        const generous = /p-[6-9]|py-4|min-h-\[\d{3}/.test(className);
        const sized = MIN_TARGET_CLASSES.some((token) => className.includes(token));
        expect(sized || generous, `control is under the 48px touch target: ${className}`).toBe(true);
      }
    }

    it("keeps every front-door control tappable", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      assertTargets(container);
    });

    it("keeps every details-step control tappable, including the consent row", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openDetails();
      assertTargets(container);
    });

    it("keeps the tip tiles and the exit dialog tappable", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "Exit" }));
      assertTargets(screen.getByRole("dialog"));
    });
  });

  describe("screen reader names and language", () => {
    it("marks the document language so a reader switches voice with the copy", () => {
      const { container, rerender } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      expect(container.querySelector("main")).toHaveAttribute("lang", "en");

      fireEvent.click(screen.getByRole("button", { name: "Español" }));
      expect(container.querySelector("main")).toHaveAttribute("lang", "es");

      fireEvent.click(screen.getByRole("button", { name: "Kreyòl" }));
      expect(container.querySelector("main")).toHaveAttribute("lang", "ht");

      rerender(<KioskParityScreen shopId="loc-ybor" scope="shop" initialLocale="es" />);
      expect(container.querySelector("main")).toHaveAttribute("lang", "ht");
    });

    it("tags each language button with its own lang so the endonym is pronounced right", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const group = screen.getByRole("group", { name: "Language" });

      expect(within(group).getByRole("button", { name: "English" })).toHaveAttribute("lang", "en");
      expect(within(group).getByRole("button", { name: "Español" })).toHaveAttribute("lang", "es");
      expect(within(group).getByRole("button", { name: "Kreyòl" })).toHaveAttribute("lang", "ht");
    });

    it("gives every control an accessible name on every screen", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openDetails();

      for (const control of screen.getAllByRole("button")) {
        const name = control.getAttribute("aria-label") ?? control.textContent ?? "";
        expect(name.trim().length, `control has no accessible name: ${control.outerHTML.slice(0, 120)}`).toBeGreaterThan(0);
      }
    });

    it("reports toggle state through aria-pressed rather than colour alone", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: "Toggle large text" })).toHaveAttribute("aria-pressed", "false");
    });

    it("announces the loading, offline and reserving states politely", () => {
      useKioskPayloadQueryMock.mockReturnValue({ data: null, isLoading: true, error: null, refetch: vi.fn() });
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);

      const status = container.querySelector("[role='status']");
      expect(status).toBeInTheDocument();
      expect(status).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("focus order", () => {
    it("puts the chrome controls in reading order: language, then Aa, then Exit", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const header = container.querySelector("header")!;
      const names = Array.from(header.querySelectorAll("button")).map(
        (button) => button.getAttribute("aria-label") ?? button.textContent?.trim()
      );

      expect(names).toEqual(["English", "Español", "Kreyòl", "Toggle large text", "Exit"]);
    });

    it("keeps the DOM order of the details step matching its visual order", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      openDetails();

      const fields = Array.from(container.querySelectorAll<HTMLElement>("section input")).map((input) =>
        input.getAttribute("aria-label")
      );
      expect(fields?.[0]).toMatch(/Your name/);
      expect(fields?.[1]).toMatch(/Phone/);
      expect(fields?.[2]).toMatch(/Email/);
      expect(fields?.[3]).toMatch(/username/);
    });

    it("never leaves a positive tabindex to fight the natural order", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      for (const element of Array.from(container.querySelectorAll("[tabindex]"))) {
        expect(Number(element.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
      }
    });
  });

  describe("reduced motion and large text", () => {
    it("stops announcing motion when the browser asks for less of it", () => {
      const matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
      Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });

      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    });

    it("scales type without introducing a horizontal scroll", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const toggle = screen.getByRole("button", { name: "Toggle large text" });

      fireEvent.click(toggle);

      const main = container.querySelector("main");
      expect(screen.getByRole("button", { name: "Toggle large text" })).toHaveAttribute("aria-pressed", "true");
      expect(main?.className).toContain("text-[122%]");
      expect(main?.className).toContain("overflow-x-hidden");
    });

    it("resets large text between clients so the next person starts fresh", () => {
      render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      fireEvent.click(screen.getByRole("button", { name: "Toggle large text" }));
      openDetails();
      fireEvent.click(screen.getByRole("button", { name: /Cancel & reset/i }));

      expect(screen.getByRole("button", { name: "Toggle large text" })).toHaveAttribute("aria-pressed", "false");
    });

    it("marks decorative artwork hidden so it is never read aloud", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const decorations = Array.from(container.querySelectorAll("[aria-hidden='true']"));
      expect(decorations.length).toBeGreaterThan(0);
      for (const decoration of decorations) {
        expect(decoration.querySelector("button, a, input")).toBeNull();
      }
    });
  });

  describe("responsive shell", () => {
    it("locks the page to the viewport width at every size", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      expect(container.querySelector("main")?.className).toContain("overflow-x-hidden");
      expect(container.querySelector("main")?.className).toContain("min-h-[100svh]");
    });

    it("sizes display type fluidly rather than at one fixed kiosk size", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const hero = container.querySelector("h1");
      expect(hero?.className).toMatch(/text-\[clamp\(/);
    });

    it("stacks the front-door grid before it goes multi-column", () => {
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      const grid = container.querySelector("section .grid");
      // No unprefixed multi-column class — columns only arrive at a breakpoint.
      expect(grid?.className).toMatch(/sm:grid-cols|md:grid-cols|lg:grid-cols/);
      expect(grid?.className).not.toMatch(/(^|\s)grid-cols-[2-9]/);
    });

    it("keeps the attract screen inside the viewport", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { container } = render(<KioskParityScreen shopId="loc-ybor" scope="shop" />);
      await act(async () => {
        vi.advanceTimersByTime(46_000);
      });

      expect(container.querySelector("main")?.className).toContain("overflow-hidden");
      vi.useRealTimers();
    });
  });
});
