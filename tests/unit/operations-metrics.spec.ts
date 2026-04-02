import { describe, expect, it } from "vitest";
import { sortOwnerDashboardAppointments } from "@/lib/operations/metrics";

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

    const ordered = sortOwnerDashboardAppointments(appointments as any, "2026-03-26");

    expect(ordered.map((appointment) => appointment.id)).toEqual([
      "in-service",
      "checked-in",
      "booked-early",
      "completed-late",
      "cancelled"
    ]);
  });
});
