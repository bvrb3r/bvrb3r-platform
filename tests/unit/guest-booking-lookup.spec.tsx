import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuestBookingLookup } from "@/components/booking/guest-booking-lookup";

describe("guest booking lookup", () => {
  it("uses a generic failed lookup state and a safe support path", () => {
    render(<GuestBookingLookup initialConfirmation="BVRGUEST1" />);

    expect(screen.getByText("Find booking support without exposing private data.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("BVRGUEST1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email or phone"), { target: { value: "guest@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Check booking" }));

    expect(screen.getByText("We could not verify that booking from this screen. Check your confirmation code or contact support with the name, phone, email, and time used when booking.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", expect.stringContaining("mailto:support@bvrb3r.app"));
    expect(screen.queryByText(/appointment confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payment_intent/i)).not.toBeInTheDocument();
  });
});
