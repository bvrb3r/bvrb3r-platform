import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentOperationsWorkspace } from "@/components/rent/rent-operations-workspace";

const emptyPayload = {
  viewer: "barber",
  scope: { shopId: null },
  relationships: [],
  agreements: [],
  obligations: [],
  contributions: [],
  actions: [],
  autopay: [],
  paymentRequests: [],
  disputes: [],
  lifecycleRequests: [],
  warnings: []
};

describe("Product PR26 redesigned rent operations workspace", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/dashboard/barber/rent?demo=1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyPayload
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the redesign lifecycle, AutoBooth, and statement compositions", async () => {
    render(<RentOperationsWorkspace viewer="barber" />);

    expect(await screen.findByText("Rent lifecycle.")).toBeInTheDocument();
    expect(screen.getByText("$142.60")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay booth rent/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AutoPay/i })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "AutoBooth detail" }));
    expect(await screen.findByText("Five gates, all required.")).toBeInTheDocument();
    expect(screen.getByText("Native BVRB3R transaction")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rent statement" }));
    expect(await screen.findByText("Your rent week, itemized.")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download pdf/i })).toBeInTheDocument();
  });

  it("keeps one selected owner shop in the API request", async () => {
    const fetchMock = vi.mocked(fetch);
    render(
      <RentOperationsWorkspace
        viewer="owner"
        shopIds={["shop-one", "shop-two"]}
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rent?shopId=shop-one",
        { cache: "no-store" }
      );
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Choose one shop" }), {
      target: { value: "shop-two" }
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rent?shopId=shop-two",
        { cache: "no-store" }
      );
    });
  });
});
