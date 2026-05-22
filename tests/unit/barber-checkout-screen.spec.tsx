import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarberCheckoutScreen } from "@/components/barber-experience/barber-checkout-screen";

const { overviewRefetchMock, useBarberOverviewQueryMock, useMarketplaceServiceCatalogMock } = vi.hoisted(() => ({
  overviewRefetchMock: vi.fn(),
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
    overviewRefetchMock.mockReset();
    overviewRefetchMock.mockResolvedValue({});
    useBarberOverviewQueryMock.mockReturnValue({
      data: {
        todayAppointments: [],
        earnings: {
          grossSales: 0
        }
      },
      error: null,
      refetch: overviewRefetchMock
    });
    useMarketplaceServiceCatalogMock.mockReturnValue({
      data: {
        editableServices: [],
        readOnlyServices: []
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("opens a POS sale review quote from the standalone keypad", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      quote: {
        subtotalCents: 500,
        platformFeeCents: 25,
        clientFeeCents: 0,
        discountCents: 0,
        tipCents: 0,
        totalCents: 500,
        barberPayoutCents: 475,
        shopSplitCents: 0,
        relationshipType: "freelance"
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BarberCheckoutScreen
        barberName="Blaze King"
        barberRole="booth_rent_barber"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /5\s*JKL/ }));
    fireEvent.click(screen.getByRole("button", { name: /Review Sale/ }));

    expect(await screen.findByText("Estimated barber payout")).toBeInTheDocument();
    expect(screen.getByText("$4.75")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Charge $5.00" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/barber/pos-sales/quote", expect.objectContaining({
      method: "POST"
    }));
  });

  it("charges a POS sale and refreshes checkout state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        quote: {
          subtotalCents: 3500,
          platformFeeCents: 175,
          clientFeeCents: 0,
          discountCents: 0,
          tipCents: 0,
          totalCents: 3500,
          barberPayoutCents: 3325,
          shopSplitCents: 0,
          relationshipType: "freelance"
        }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        sale: { id: "sale-1" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        payment: { id: "payment-1", posSaleId: "sale-1" },
        routing: { pos_sale_id: "sale-1", payout_readiness_status: "ready" }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BarberCheckoutScreen
        barberName="Blaze King"
        barberRole="booth_rent_barber"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "$35.00" }));
    fireEvent.click(screen.getByRole("button", { name: /Review Sale/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Charge $35.00" }));

    await waitFor(() => expect(screen.getByText("POS sale paid. Payout is now eligible.")).toBeInTheDocument());
    expect(overviewRefetchMock).toHaveBeenCalled();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
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
