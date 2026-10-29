import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SquareBookingWelcome } from "@/components/kiosk/square-booking-welcome";

describe("Square booking welcome", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hands off in the same tab to the verified shop without collecting identity or payment data", () => {
    const { container } = render(<SquareBookingWelcome />);
    const link = screen.getByRole("link", { name: "Book Appointment" });
    expect(link).toHaveAttribute("href", "https://book.squareup.com/appointments/kb47sx4fuevpak/location/LQQVQXJC0BSHF/services");
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(container.querySelector("form, input, iframe")).toBeNull();
    expect(screen.queryByText(/confirmed|payment successful|session cleared/i)).not.toBeInTheDocument();
  });

  it("blocks navigation offline and restores booking on reconnect", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<SquareBookingWelcome />);
    expect(screen.queryByRole("link", { name: "Book Appointment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiting for connection" })).toBeDisabled();
    online.mockReturnValue(true);
    act(() => { fireEvent(window, new Event("online")); });
    expect(screen.getByRole("link", { name: "Book Appointment" })).toBeVisible();
    online.mockReturnValue(false);
    act(() => { fireEvent(window, new Event("pageshow")); });
    expect(screen.getByRole("button", { name: "Waiting for connection" })).toBeDisabled();
  });
});
