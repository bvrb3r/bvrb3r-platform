import { describe, expect, it } from "vitest";
import {
  buildOwnerOperationsPayload,
  findForbiddenOwnerOperationsKeys,
  resolveOwnerOperationsShopId
} from "@/lib/owner-operations/domain";

function dashboardFixture() {
  return {
    summary: { businessDate: "2026-07-29", revenueToday: 999 },
    locations: [
      { id: "shop-one", name: "Shop One", label: "Shop One · Detroit", neighborhood: "", city: "Detroit", state: "MI" },
      { id: "shop-two", name: "Shop Two", label: "Shop Two · Chicago", neighborhood: "", city: "Chicago", state: "IL" }
    ],
    activeBarbers: [{
      id: "barber-one", name: "Alex", compensationModel: "booth_rent",
      activeAppointmentCount: 1, liveAppointmentCount: 0, bookedCount: 1,
      completedCount: 0, utilization: 50, nextAppointmentStart: "2026-07-29T15:00:00.000Z"
    }],
    barbers: [{
      id: "barber-one", name: "Alex", compensationModel: "booth_rent",
      activeAppointmentCount: 1, liveAppointmentCount: 0, bookedCount: 1,
      completedCount: 0, utilization: 50, nextAppointmentStart: "2026-07-29T15:00:00.000Z"
    }],
    appointments: [{
      id: "appointment-one", locationId: "shop-one", shopId: "shop-one",
      barberId: "barber-one", clientId: "private-client-id", serviceId: "cut",
      status: "booked" as const, start: "2026-07-29T15:00:00.000Z",
      end: "2026-07-29T15:30:00.000Z", chair: "1", addOnIds: [],
      depositAmount: 20, totalAmount: 100, balanceDue: 80, tipAmount: 500,
      note: "private note", internalNotes: "more private", source: "booking" as const,
      bookingSource: "square", revision: 1, updatedAt: "2026-07-29T14:00:00.000Z",
      display: {
        clientName: "Guest A", barberName: "Alex", serviceName: "Cut",
        locationName: "Shop One", locationLabel: "Shop One · Detroit", statusLabel: "Booked"
      }
    }, {
      id: "appointment-other", locationId: "shop-two", shopId: "shop-two",
      barberId: "barber-two", clientId: "other-client", serviceId: "cut",
      status: "booked" as const, start: "2026-07-29T16:00:00.000Z",
      end: "2026-07-29T16:30:00.000Z", chair: "2", addOnIds: [],
      depositAmount: 0, totalAmount: 70, balanceDue: 70, tipAmount: 0,
      note: "", source: "booking" as const, revision: 1,
      updatedAt: "2026-07-29T14:00:00.000Z",
      display: {
        clientName: "Other Guest", barberName: "Blair", serviceName: "Cut",
        locationName: "Shop Two", locationLabel: "Shop Two · Chicago", statusLabel: "Booked"
      }
    }],
    ownerAnalytics: [{
      locationReference: "shop-one", businessDate: "2026-07-29",
      bookedCount: 1, completedServicesCount: 0, paidAppointmentsCount: 0,
      revenueTotal: 999, tipTotal: 500, outstandingBalance: 80,
      updatedAt: "2026-07-29T14:00:00.000Z"
    }],
    walkIns: [],
    workflowEvents: []
  };
}

describe("Product PR25 owner operations projection", () => {
  it("requires an explicit allowed shop when owner scope has multiple shops", () => {
    const user = { ownedShopId: undefined, locationIds: ["shop-one", "shop-two"] };
    expect(resolveOwnerOperationsShopId(user)).toBeNull();
    expect(resolveOwnerOperationsShopId(user, "shop-one")).toBe("shop-one");
    expect(resolveOwnerOperationsShopId(user, "shop-three")).toBeNull();
  });

  it("never pools records from another shop", () => {
    const payload = buildOwnerOperationsPayload({
      shopId: "shop-one",
      dashboard: dashboardFixture()
    });
    expect(payload.scope.shopId).toBe("shop-one");
    expect(payload.floor).toHaveLength(1);
    expect(payload.floor[0]?.id).toBe("appointment-one");
    expect(JSON.stringify(payload)).not.toContain("appointment-other");
    expect(JSON.stringify(payload)).not.toContain("Other Guest");
  });

  it("labels external ownership without exposing external money", () => {
    const payload = buildOwnerOperationsPayload({
      shopId: "shop-one",
      dashboard: dashboardFixture()
    });
    expect(payload.floor[0]).toMatchObject({
      source: "square",
      sourceLabel: "Square",
      paymentOwner: "external_provider"
    });
  });

  it("contains no barber-money, contact, or private-note keys", () => {
    const payload = buildOwnerOperationsPayload({
      shopId: "shop-one",
      dashboard: dashboardFixture()
    });
    expect(findForbiddenOwnerOperationsKeys(payload)).toEqual([]);
    const serialized = JSON.stringify(payload).toLowerCase();
    for (const secret of ["999", "500", "private note", "more private", "private-client-id"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("detects a future accidental privacy regression recursively", () => {
    expect(findForbiddenOwnerOperationsKeys({
      safe: { rows: [{ tipAmount: 10 }, { client_email: "private@example.com" }] }
    })).toEqual(["$.safe.rows[0].tipAmount", "$.safe.rows[1].client_email"]);
  });
});
