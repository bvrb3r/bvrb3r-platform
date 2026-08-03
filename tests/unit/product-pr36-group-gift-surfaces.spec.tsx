import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupBookingWorkspace } from "@/components/group-booking/group-booking-workspace";
import { GiftCardWorkspace } from "@/components/gift-cards/gift-card-workspace";

describe("Product PR36 group and gift surfaces", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the two-to-six group builder with both payer contracts", () => {
    render(<GroupBookingWorkspace />);
    expect(screen.getByRole("heading", { name: "Who's coming?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I've got it all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Everyone pays their own" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add a person · 2 of 6/ })).toBeInTheDocument();
    expect(screen.getByText(/No card is charged by this button/)).toBeInTheDocument();
  });

  it("binds the kiosk group branch to its paired shop and does not load the public catalog", () => {
    render(<GroupBookingWorkspace kioskOnly kioskShopId="shop-pr36" />);
    expect(screen.getByRole("heading", { name: "How many in your group?" })).toBeInTheDocument();
    expect(screen.getByText("shop-pr36")).toBeInTheDocument();
    expect(screen.queryByLabelText("Shop kiosk ID")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to kiosk" })).toHaveAttribute("href", "/kiosk/shop/shop-pr36");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders Stripe buy/send, claim, and real wallet rules without a fake balance", () => {
    render(<GiftCardWorkspace authenticated={false} initialWallet={null} />);
    expect(screen.getByRole("heading", { name: "Give somebody a good day." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Any chair" })).toBeInTheDocument();
    expect(screen.getByText(/Paid via Stripe · never expires · services only/)).toBeInTheDocument();
    expect(screen.queryByText("$10.00")).not.toBeInTheDocument();
  });
});
