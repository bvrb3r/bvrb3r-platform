import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarberCheckoutScreen } from "@/components/barber-experience/barber-checkout-screen";

const TEST_CLIENT_ID = "6607bce8-3636-46e8-9bbd-eabd9e5ad065";

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
        quickClients: [{
          clientId: TEST_CLIENT_ID,
          clientName: "Jordan Client",
          email: "jordan@example.com",
          phone: "8135550101",
          retentionTag: "repeat",
          totalAppointments: 2,
          completedAppointments: 1,
          activeAppointments: 0,
          cancelledAppointments: 0,
          lastVisitAt: null,
          nextVisitAt: null,
          latestServiceName: null,
          latestServiceId: null,
          lifetimeGrossSales: 70,
          averageTicket: 35,
          relationshipLabel: "Repeat",
          favoriteRelationship: false,
          intelligence: {
            rebookingWindow: "building",
            churnRisk: "low",
            loyaltySegment: "repeat",
            nextBestAction: "Invite back"
          },
          canMessage: true,
          messageAppointmentId: null
        }],
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

  it("opens payment method selection after reviewing a POS sale", async () => {
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

    expect(await screen.findByRole("dialog", { name: "Choose payment method" })).toBeInTheDocument();
    expect(screen.getByText("Tap to Pay")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Card on File")).toBeInTheDocument();
    expect(screen.queryByText("Invoice / Payment Link")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps Tap to Pay setup-required without creating a POS sale", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
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
    fireEvent.click(await screen.findByRole("button", { name: /Tap to Pay/ }));

    expect(await screen.findByText("Tap to Pay is not connected yet. Use Cash or Card on File.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records a cash sale and resets the keypad without platform payout", async () => {
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
        sale: { id: "sale-1", status: "paid", payment_method: "cash" },
        payment: null,
        routing: null
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
    fireEvent.click(await screen.findByRole("button", { name: /Cash/ }));

    await waitFor(() => expect(screen.getByText("Cash sale recorded. No platform payout created.")).toBeInTheDocument());
    expect(overviewRefetchMock).toHaveBeenCalled();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/barber/pos-sales", expect.objectContaining({
      method: "POST"
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/barber/pos-sales/sale-1/cash", expect.objectContaining({
      method: "POST"
    }));
  });

  it("requires a selected client before charging card on file", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
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
    fireEvent.click(await screen.findByRole("button", { name: /Card on File/ }));

    expect(await screen.findByText("Select a client before charging card on file.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("searches clients and sends canonical client id for card on file", async () => {
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
        sale: { id: "sale-card-1" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        sale: { id: "sale-card-1", status: "paid", payment_method: "card_on_file" },
        payment: { id: "payment-card-1", posSaleId: "sale-card-1" },
        routing: { pos_sale_id: "sale-card-1", payout_readiness_status: "ready" }
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
    const search = await screen.findByPlaceholderText("Search clients by name, phone, or email");
    fireEvent.change(search, { target: { value: "Jordan" } });
    fireEvent.click(await screen.findByRole("button", { name: /Jordan Client/ }));
    fireEvent.click(screen.getByRole("button", { name: /Card on File/ }));

    await waitFor(() => expect(screen.getByText("Payment successful. Payout is now eligible.")).toBeInTheDocument());
    const salePayload = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(salePayload).toMatchObject({
      amountCents: 3500,
      subtotalCents: 3500,
      paymentMethod: "card_on_file",
      clientId: TEST_CLIENT_ID,
      customerName: "Jordan Client"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/barber/pos-sales/sale-card-1/charge", expect.objectContaining({
      method: "POST"
    }));
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
