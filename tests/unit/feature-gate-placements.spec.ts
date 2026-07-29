import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GATES, type FeatureGateKey } from "@/lib/feature-gates";

const PLACEMENTS: Record<FeatureGateKey, string> = {
  "client.home.group_booking": "components/client-experience/client-home-screen.tsx",
  "culture.creator_tools": "components/client-experience/client-culture-screen.tsx",
  "barber.analytics.city_benchmarks": "components/operations/barber-earnings-workspace.tsx",
  "owner.analytics.forecasting": "components/rent/owner-report-pack.tsx",
  "kiosk.analytics.multi_device_compare": "components/operations/owner-operations-workspace.tsx",
  "client.analytics.style_history": "components/client-experience/client-activity-screen.tsx",
  "queue.smart_overbook": "components/operations/queue-workspace.tsx",
  "owner.floor.auto_rebalance": "components/operations/owner-operations-workspace.tsx",
  "rent.autopilot": "components/rent/rent-operations-workspace.tsx",
  "reports.custom_builder": "app/(platform)/reports/page.tsx",
  "owner.reports.custom_builder": "components/rent/owner-report-pack.tsx",
  "messages.broadcasts": "components/messages/messaging-inbox-screen.tsx",
  "barber.checkout.saved_cards": "components/barber-experience/barber-checkout-screen.tsx",
  "kiosk.shop.loyalty_check_in": "components/kiosk/kiosk-parity-screen.tsx",
  "kiosk.barber.loyalty_check_in": "components/kiosk/kiosk-parity-screen.tsx"
};

describe("PR28 feature gate placements", () => {
  it("places every registered closed door on its approved product surface", () => {
    expect(Object.keys(PLACEMENTS).sort()).toEqual(Object.keys(GATES).sort());

    for (const [key, path] of Object.entries(PLACEMENTS)) {
      expect(readFileSync(path, "utf8"), `${key} is missing from ${path}`).toContain(key);
    }
  });
});
