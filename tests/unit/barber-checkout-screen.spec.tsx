import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarberCheckoutScreen } from "@/components/barber-experience/barber-checkout-screen";

const { useBarberOverviewQueryMock, useMarketplaceServiceCatalogMock } = vi.hoisted(() => ({
  useBarberOverviewQueryMock: vi.fn(),
  useMarketplaceServiceCatalogMock: vi.fn()
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useBarberOverviewQuery: useBarberOverviewQueryMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceServiceCatalog: useMarketplaceServiceCatalogMock
}));

describe("BarberCheckoutScreen", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    useBarberOverviewQueryMock.mockReturnValue({
      data: {
        todayAppointments: [],
        earnings: {
          grossSales: 0
        }
      },
      error: null
    });
    useMarketplaceServiceCatalogMock.mockReturnValue({
      data: {
        editableServices: [],
        readOnlyServices: []
      }
    });
  });

  it("formats keypad digits as whole-dollar checkout amounts immediately", () => {
    render(
      <BarberCheckoutScreen
        barberName="Blaze King"
        barberRole="booth_rent_barber"
      />
    );

    expect(screen.getByText("$0.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByText("$1.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /2\s*ABC/ }));
    expect(screen.getByText("$12.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /5\s*JKL/ }));
    expect(screen.getByText("$125.00")).toBeInTheDocument();
  });

  it("keeps paid appointments and money posture out of the Checkout tab", () => {
    render(
      <BarberCheckoutScreen
        barberName="Blaze King"
        barberRole="booth_rent_barber"
        initialSection="appointments"
      />
    );

    expect(screen.getByText("Ready to close")).toBeInTheDocument();
    expect(screen.queryByText("Paid appointments")).not.toBeInTheDocument();
    expect(screen.queryByText("Money posture")).not.toBeInTheDocument();
    expect(screen.queryByText("Paid today")).not.toBeInTheDocument();
  });
});
