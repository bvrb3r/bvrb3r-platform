import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  readFintechTaxSummaryExportMock,
  readPayoutExportMock,
  readRevenueExportMock,
  readIncentivesExportMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  readFintechTaxSummaryExportMock: vi.fn(),
  readPayoutExportMock: vi.fn(),
  readRevenueExportMock: vi.fn(),
  readIncentivesExportMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/fintech/exports", () => ({
  readFintechTaxSummaryExport: readFintechTaxSummaryExportMock,
  readPayoutExport: readPayoutExportMock,
  readRevenueExport: readRevenueExportMock,
  readIncentivesExport: readIncentivesExportMock
}));

import { GET as getTaxSummary } from "@/app/api/fintech/tax-summary/route";
import { GET as getPayoutExport } from "@/app/api/fintech/export/payouts/route";
import { GET as getRevenueExport } from "@/app/api/fintech/export/revenue/route";
import { GET as getIncentivesExport } from "@/app/api/fintech/export/incentives/route";

describe("fintech export routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    readFintechTaxSummaryExportMock.mockReset();
    readPayoutExportMock.mockReset();
    readRevenueExportMock.mockReset();
    readIncentivesExportMock.mockReset();
  });

  it("allows barber-safe payout, incentive, and tax exports but blocks revenue export", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-blaze",
      role: "barber_user",
      email: "blaze@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    });
    readFintechTaxSummaryExportMock.mockResolvedValue({ year: 2026, gross: 5000, fees: 300, net: 4700, payouts: 4600 });
    readPayoutExportMock.mockResolvedValue({ rows: [{ id: "payout-1" }], summary: { count: 1 } });
    readIncentivesExportMock.mockResolvedValue({ rows: [{ id: "points-1" }], summary: { issued: 10 } });

    const [taxResponse, payoutResponse, incentivesResponse, revenueResponse] = await Promise.all([
      getTaxSummary(new NextRequest("https://bvrb3r.demo/api/fintech/tax-summary?year=2025")),
      getPayoutExport(new NextRequest("https://bvrb3r.demo/api/fintech/export/payouts?year=2025")),
      getIncentivesExport(new NextRequest("https://bvrb3r.demo/api/fintech/export/incentives?year=2025")),
      getRevenueExport(new NextRequest("https://bvrb3r.demo/api/fintech/export/revenue?year=2025"))
    ]);

    expect(taxResponse.status).toBe(200);
    expect(payoutResponse.status).toBe(200);
    expect(incentivesResponse.status).toBe(200);
    expect(revenueResponse.status).toBe(403);

    expect(readFintechTaxSummaryExportMock).toHaveBeenCalledWith({
      user: expect.objectContaining({ role: "barber_user" }),
      year: 2025
    });
    expect(readPayoutExportMock).toHaveBeenCalledWith({
      user: expect.objectContaining({ role: "barber_user" }),
      year: 2025
    });
    expect(readIncentivesExportMock).toHaveBeenCalledWith({
      user: expect.objectContaining({ role: "barber_user" }),
      year: 2025
    });
    expect(readRevenueExportMock).not.toHaveBeenCalled();
  });

  it("allows owner revenue export and passes canonical year filters through", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-owner",
      role: "owner",
      email: "owner@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    });
    readRevenueExportMock.mockResolvedValue({
      rows: [{ id: "booking-1", gross: 40 }],
      summary: { gross: 40, fees: 2, net: 38 }
    });

    const response = await getRevenueExport(new NextRequest("https://bvrb3r.demo/api/fintech/export/revenue?year=2024"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readRevenueExportMock).toHaveBeenCalledWith({
      user: expect.objectContaining({ role: "owner" }),
      year: 2024
    });
    expect(body.export.summary.gross).toBe(40);
  });
});
