import { describe, expect, it } from "vitest";
import {
  buildOwnerReportPack,
  buildOwnerReportPackCsv
} from "@/lib/rent/report-domain";
import { createDefaultOwnerOperationsControlState } from "@/lib/owner-operations/domain";

describe("Product PR26 owner report pack", () => {
  it("ships all 16 shop-safe reports without barber money", () => {
    const controls = createDefaultOwnerOperationsControlState();
    controls.boothRent = {
      billedCents: 52_000,
      paidCents: 49_000,
      outstandingCents: 3_000,
      overdueCount: 1
    };
    controls.clientBridge = {
      offered: 10,
      consented: 8,
      invitations: 7,
      claimed: 5,
      optedOut: 2
    };
    const reports = buildOwnerReportPack({
      scope: {
        shopId: "shop-ybor",
        shopName: "BVRB3R Ybor",
        locationLabel: "Ybor City"
      },
      generatedAt: "2026-07-29T12:00:00.000Z",
      summary: {
        floorVolume: 20,
        booked: 12,
        waiting: 2,
        checkedIn: 1,
        inService: 3,
        completed: 14,
        activeBarbers: 4,
        openChairs: 1
      },
      sourceCounts: [
        { source: "bvrb3r", label: "BVRB3R", count: 12 },
        { source: "booksy", label: "Booksy", count: 8 }
      ],
      team: [],
      floor: [{
        id: "walk-1",
        kind: "walk_in",
        status: "waiting",
        clientDisplayName: "Guest",
        serviceDisplayName: "Cut",
        barberId: null,
        barberDisplayName: null,
        source: "walk_in",
        sourceLabel: "Walk-in",
        paymentOwner: "barber",
        startsAt: "2026-07-29T12:00:00.000Z",
        waitMinutes: 12,
        position: 1
      }],
      alerts: [],
      controls,
      privacyNotice: "Safe"
    }, "weekly");

    expect(reports).toHaveLength(16);
    expect(reports.every((report) => ["shop", "operational"].includes(report.ownership))).toBe(true);
    expect(reports.every((report) => (
      Object.keys(report).every((key) => (
        !/earnings|tips|payout|contact|revenue/i.test(key)
      ))
    ))).toBe(true);
    const serialized = JSON.stringify(reports);
    expect(serialized).toContain("provider-owned money never valued");

    const csv = buildOwnerReportPackCsv(reports, "weekly");
    expect(csv.split("\r\n")).toHaveLength(18);
    expect(csv).toContain("Ownership,Range");
  });
});
