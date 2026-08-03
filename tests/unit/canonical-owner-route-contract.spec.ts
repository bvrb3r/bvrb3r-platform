import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const staticOwnerRoutes = {
  ai: "createCanonicalOwnerRouteGate",
  analytics: "createCanonicalOwnerRouteGate",
  bridge: "createCanonicalOwnerRouteGate",
  chairs: "OwnerOperationsWorkspace",
  chairfill: "createCanonicalOwnerRouteGate",
  floor: "dashboard/owner/schedule/page",
  home: "dashboard/owner/page",
  identity: "OwnerSettingsPage",
  kiosk: "dashboard/owner/kiosk/page",
  messages: "dashboard/owner/messages/page",
  money: "dashboard/owner/money/page",
  more: "dashboard/owner/more/page",
  policies: "OwnerSettingsPage",
  rent: "dashboard/owner/rent/page",
  reports: "dashboard/owner/reports/page",
  schedule: "OwnerScheduleWorkspace",
  switch: "createCanonicalOwnerRouteGate",
  sync: "createCanonicalOwnerRouteGate",
  team: "dashboard/owner/team/page",
  verify: "OwnerSettingsPage"
} as const;

describe("canonical owner route contract", () => {
  it.each(Object.entries(staticOwnerRoutes))(
    "reserves /shop/%s ahead of the public shop slug route",
    (segment, implementationMarker) => {
      const routeFile = resolve(process.cwd(), "app", "shop", segment, "page.tsx");
      expect(existsSync(routeFile)).toBe(true);
      expect(readFileSync(routeFile, "utf8")).toContain(implementationMarker);
    }
  );

  it("keeps the dynamic public shop profile route available for real slugs", () => {
    const publicRoute = resolve(process.cwd(), "app", "shop", "[shopId]", "page.tsx");
    expect(existsSync(publicRoute)).toBe(true);
    expect(readFileSync(publicRoute, "utf8")).toContain("PublicShopProfile");
  });

  it("reserves the shared kiosk check-in entry ahead of the legacy kiosk id route", () => {
    const canonicalRoute = resolve(process.cwd(), "app", "kiosk", "checkin", "page.tsx");
    const legacyRoute = resolve(process.cwd(), "app", "kiosk", "[shopId]", "page.tsx");
    expect(existsSync(canonicalRoute)).toBe(true);
    expect(readFileSync(canonicalRoute, "utf8")).toContain("KIOSK_DEVICE_COOKIE");
    expect(existsSync(legacyRoute)).toBe(true);
  });

  it("reserves the kiosk family roots and owner run route instead of treating them as ids", () => {
    for (const routeFile of [
      resolve(process.cwd(), "app", "kiosk", "shop", "page.tsx"),
      resolve(process.cwd(), "app", "kiosk", "barber", "page.tsx"),
      resolve(process.cwd(), "app", "shop", "kiosk", "run", "page.tsx")
    ]) {
      expect(existsSync(routeFile)).toBe(true);
    }
  });
});
