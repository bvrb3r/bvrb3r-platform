import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Product PR34 cross-surface balance gates", () => {
  it("redirects canonical authenticated shells to the recoverable global lock", () => {
    const layout = source("app/(platform)/layout.tsx");

    expect(layout).toContain("assertPr34BillingRiskAction");
    expect(layout).toContain('action: "booking"');
    expect(layout).toContain('redirect("/locked")');
    expect(layout).toContain("roleToEntitlementRole(canonicalRole)");
  });

  it("checks balance truth on every direct account booking mutation", () => {
    for (const route of [
      "app/api/bookings/route.ts",
      "app/api/operations/bookings/route.ts"
    ]) {
      const body = source(route);
      expect(body, route).toContain("assertPr34BillingRiskAction");
      expect(body, route).toContain('action: "booking"');
      expect(body, route).toContain("account_balance_locked");
      expect(body, route).toContain('recoveryHref: locked ? "/billing" : "mailto:support@bvrb3r.app"');
    }
  });

  it("checks balance truth again when either reschedule surface mutates a booking", () => {
    const engineRoute = source("app/api/booking/appointments/[appointmentId]/reschedule/route.ts");
    const legacyRoute = source("app/api/bookings/[id]/reschedule/route.ts");

    expect(engineRoute.indexOf("assertBookingBillingAccess(routeContext)"))
      .toBeLessThan(engineRoute.indexOf("rescheduleBooking({"));
    expect(legacyRoute.indexOf("await assertPr34BillingRiskAction"))
      .toBeLessThan(legacyRoute.indexOf("provider.rescheduleAppointment({"));
    expect(legacyRoute).toContain("account_balance_locked");
  });

  it("rechecks both kiosk owner/barber truth and a selected client before booking", () => {
    const sessionService = source("lib/kiosk/session-service.ts");
    const kioskService = source("lib/kiosk/service.ts");

    expect(sessionService).toContain("billingProfileId");
    expect(sessionService).toContain("await assertKioskBalanceClear");
    expect(sessionService).toContain("This kiosk session predates balance-lock verification");
    expect(kioskService).toContain("await assertKioskClientBalanceClear(client.profileId)");
  });
});
