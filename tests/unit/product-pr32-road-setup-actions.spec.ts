import { describe, expect, it } from "vitest";
import { ROAD_SETUP_ACTIONS, getRoadSetupAction } from "@/lib/road/setup";

describe("Product PR32 Road setup actions", () => {
  it("provides a corrective route for every governed setup achievement", () => {
    expect(Object.keys(ROAD_SETUP_ACTIONS.client_user)).toHaveLength(6);
    expect(Object.keys(ROAD_SETUP_ACTIONS.barber_user)).toHaveLength(8);
    expect(Object.keys(ROAD_SETUP_ACTIONS.shop_owner_user)).toHaveLength(8);
    for (const actions of Object.values(ROAD_SETUP_ACTIONS)) {
      for (const action of Object.values(actions)) {
        expect(action.href).toMatch(/^\//);
        expect(action.actionLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses the safest reason-specific Client CTA and pending labels", () => {
    expect(getRoadSetupAction("client_user", "client.profile_completed", "add_client_profile_photo")).toMatchObject({
      href: "/dashboard/client/public-profile",
      actionLabel: "Add profile photo"
    });
    expect(getRoadSetupAction("barber_user", "barber.license_verified")).toMatchObject({
      pendingLabel: "View review status"
    });
    expect(getRoadSetupAction(
      "barber_user",
      "barber.profile_published",
      "complete_marketplace_eligibility_photo_and_three_portfolio_posts"
    )).toMatchObject({
      href: "/dashboard/barber/setup",
      actionLabel: "Finish marketplace setup"
    });
    expect(getRoadSetupAction("shop_owner_user", "owner.shop_profile_published")).toMatchObject({
      pendingHref: "/activation-status"
    });
  });
});
