import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/components/operations/barber-schedule-workspace", () => ({
  BarberScheduleWorkspace: () => <div data-testid="barber-schedule-workspace-stub">Schedule workspace</div>
}));

import { BarberCalendarScreen } from "@/components/barber-experience/barber-calendar-screen";

describe("barber calendar home", () => {
  it("renders the role-scoped Culture entry after the home schedule content", () => {
    render(<BarberCalendarScreen barberName="Blaze King" barberTitle="Barber" />);

    const schedule = screen.getByTestId("barber-schedule-workspace-stub");
    const cultureEntry = screen.getByTestId("barber-home-culture-entry");

    expect(cultureEntry).toHaveTextContent("Culture Feed");
    expect(cultureEntry).toHaveTextContent("Post cuts, discover styles, follow barbers, and turn attention into bookings.");
    expect(screen.getByRole("link", { name: /Open Culture/i })).toHaveAttribute("href", "/dashboard/barber/culture");
    expect(screen.getByTestId("barber-home-culture-entry-cta")).toHaveClass("text-[#050505]");
    expect(screen.getByTestId("barber-home-culture-entry-cta")).toHaveClass("shadow-none");
    expect(screen.getByTestId("barber-home-culture-entry-cta")).toHaveClass("ring-black/10");
    expect(cultureEntry).toHaveClass("mb-4");
    expect(schedule.compareDocumentPosition(cultureEntry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
