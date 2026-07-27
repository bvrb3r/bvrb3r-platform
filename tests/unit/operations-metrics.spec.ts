import { describe, expect, it } from "vitest";
import { getBarberCompensationSummary, sortOwnerDashboardAppointments } from "@/lib/operations/metrics";

describe("owner operations metrics helpers", () => {
  it("orders owner floor appointments by operational urgency before time", () => {
    const appointments = [
      { id: "completed-late", status: "completed", start: "2026-03-26T15:30:00-04:00" },
      { id: "booked-early", status: "booked", start: "2026-03-26T10:00:00-04:00" },
      { id: "checked-in", status: "checked_in", start: "2026-03-26T11:00:00-04:00" },
      { id: "in-service", status: "in_service", start: "2026-03-26T12:00:00-04:00" },
      { id: "cancelled", status: "cancelled", start: "2026-03-26T09:00:00-04:00" },
      { id: "other-day", status: "booked", start: "2026-03-27T09:00:00-04:00" }
    ] as Array<{ id: string; status: string; start: string }>;

    const ordered = sortOwnerDashboardAppointments(appointments as Parameters<typeof sortOwnerDashboardAppointments>[0], "2026-03-26");

    expect(ordered.map((appointment) => appointment.id)).toEqual([
      "in-service",
      "checked-in",
      "booked-early",
      "completed-late",
      "cancelled"
    ]);
  });

  it("derives barber compensation from canonical snapshot rows without a demo rent ledger fallback", () => {
    const summary = getBarberCompensationSummary(
      "barber-blaze",
      [
        {
          id: "appt-1",
          barberId: "barber-blaze",
          status: "completed",
          start: "2026-03-26T09:00:00-04:00"
        },
        {
          id: "appt-2",
          barberId: "barber-blaze",
          status: "booked",
          start: "2026-03-26T11:00:00-04:00"
        }
      ] as Parameters<typeof getBarberCompensationSummary>[1],
      [
        {
          appointmentReference: "appt-1",
          locationReference: "loc-ybor",
          barberReference: "barber-blaze",
          barberUserReference: "profile-blaze",
          barberEmail: "blaze@example.com",
          clientReference: "client-jordan",
          clientEmail: "jordan@example.com",
          compensationModel: "booth_rent",
          businessDate: "2026-03-26",
          grossServiceAmount: 70,
          depositAmount: 0,
          collectedAmount: 70,
          tipAmount: 10,
          autoBoothPercent: null,
          autoBoothRentAppliedAmount: 0,
          boothRentAmount: 325,
          boothRentPeriodLabel: "weekly",
          rentCoverageAmount: -245,
          checkoutReference: "checkout-1",
          capturedAt: "2026-03-26T10:00:00-04:00"
        }
      ]
    );

    expect(summary.serviceRevenueToday).toBe(70);
    expect(summary.tipsToday).toBe(10);
    expect(summary.rentCoverageToday).toBe(-245);
    expect(summary.nextRent).toBeUndefined();
  });
});
