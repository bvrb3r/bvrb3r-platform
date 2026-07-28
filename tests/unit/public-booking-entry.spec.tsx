import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getClientExperienceContextMock } = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn()
}));

vi.mock("@/components/client-experience/client-app-shell", () => ({
  ClientAppShell: ({
    children,
    mode
  }: {
    children: ReactNode;
    mode: "client" | "guest";
  }) => (
    <div data-mode={mode} data-testid="booking-shell">
      {children}
    </div>
  )
}));

vi.mock("@/components/booking/booking-form", () => ({
  BookingForm: ({ mode }: { mode: "client" | "guest" }) => (
    <div data-mode={mode} data-testid="booking-form">
      Booking form
    </div>
  )
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

import BookingPage from "@/app/(public-booking)/booking/new/page";

describe("public booking entry", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
  });

  it("renders the canonical booking form for an anonymous guest without a protected-layout redirect", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      isGuest: true,
      isSignedInClient: false,
      viewer: { role: "guest" }
    });

    render(await BookingPage());

    expect(screen.getByTestId("booking-shell")).toHaveAttribute("data-mode", "guest");
    expect(screen.getByTestId("booking-form")).toHaveAttribute("data-mode", "guest");
  });

  it("keeps signed-in clients on the same canonical booking route", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      isGuest: false,
      isSignedInClient: true,
      viewer: { role: "client" }
    });

    render(await BookingPage());

    expect(screen.getByTestId("booking-shell")).toHaveAttribute("data-mode", "client");
    expect(screen.getByTestId("booking-form")).toHaveAttribute("data-mode", "client");
  });
});
