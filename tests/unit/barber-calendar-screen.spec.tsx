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
  it("renders the command schedule without a duplicate lower Culture card", () => {
    render(<BarberCalendarScreen barberName="Blaze King" barberTitle="Barber" />);

    expect(screen.getByTestId("barber-schedule-workspace-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("barber-home-culture-entry")).not.toBeInTheDocument();
    expect(screen.queryByText("Culture Feed")).not.toBeInTheDocument();
    expect(screen.queryByText("Post cuts, discover styles, follow barbers, and turn attention into bookings.")).not.toBeInTheDocument();
  });
});
