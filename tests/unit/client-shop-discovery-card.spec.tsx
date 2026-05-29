import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/booking/client", () => ({
  useSaveFavoriteShopMutation: () => ({
    isPending: false,
    isSuccess: false,
    mutateAsync: vi.fn()
  })
}));

import { ClientShopDiscoveryCard } from "@/components/client-experience/client-shop-discovery-card";

describe("client shop discovery card", () => {
  it("uses real shop profile data and active team count instead of placeholders", () => {
    render(
      <ClientShopDiscoveryCard
        location={{
          id: "shop-the-bvrb3r-shop-universi-a02c68",
          name: "The BVRB3R Shop (University Mall)",
          brandLine: "Premium cuts by campus.",
          address: "2200 E Fowler Ave",
          neighborhood: "University",
          city: "Tampa",
          state: "FL",
          profilePhotoUrl: "https://cdn.example.com/shop.png",
          verifiedLabel: "Verified shop",
          activeBarbersCount: 2
        }}
      />
    );

    const card = screen.getByTestId("compact-shop-card");
    expect(within(card).getByText("The BVRB3R Shop (University Mall)")).toBeInTheDocument();
    expect(within(card).getByText("2200 E Fowler Ave")).toBeInTheDocument();
    expect(within(card).getByText("Premium cuts by campus.")).toBeInTheDocument();
    expect(within(card).getByText("2 barbers")).toBeInTheDocument();
    expect(within(card).getAllByText("Verified shop").length).toBeGreaterThan(0);
    expect(within(card).queryByText("New shop")).not.toBeInTheDocument();
    expect(within(card).queryByText("No barbers")).not.toBeInTheDocument();
    expect(within(card).queryByText("Pending, Pending, Pending")).not.toBeInTheDocument();
  });

  it("only says no active barbers when the real active count is zero", () => {
    render(
      <ClientShopDiscoveryCard
        location={{
          id: "shop-empty",
          name: "BVRB3R Studio",
          brandLine: "Downtown cuts.",
          neighborhood: "Downtown",
          city: "Tampa",
          state: "FL",
          activeBarbersCount: 0
        }}
      />
    );

    expect(screen.getByText("No active barbers yet")).toBeInTheDocument();
  });
});
