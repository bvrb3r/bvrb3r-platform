import { beforeEach, describe, expect, it } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";
import {
  applyPlatformAdminAction,
  getPlatformAdminConsolePayload,
  readPlatformShopControlState,
  resetPlatformAdminStateForTests,
  stagePlatformAdminDirectoryRowsForTests
} from "@/lib/platform-admin/service";

describe("platform admin service", () => {
  const founder = makePlatformAdminUser();

  beforeEach(() => {
    resetPlatformAdminStateForTests();
    stagePlatformAdminDirectoryRowsForTests({
      profiles: [
        {
          id: "user-client",
          role: "client",
          full_name: "Client One",
          email: "client@example.com",
          phone: null,
          primary_onboarding_role: "client",
          onboarding_state: "active",
          created_at: "2026-04-01T12:00:00.000Z"
        },
        {
          id: "owner-profile",
          role: "shop_owner",
          full_name: "Owner One",
          email: "owner@example.com",
          phone: null,
          primary_onboarding_role: "shop_owner",
          onboarding_state: "active",
          created_at: "2026-04-01T12:00:00.000Z"
        }
      ],
      clients: [
        {
          id: "client-1",
          reference_code: "client-ref",
          profile_id: "user-client",
          loyalty_points: 0,
          retention_tag: "new",
          created_at: "2026-04-01T12:00:00.000Z"
        }
      ],
      shops: [
        {
          id: "shop-bvrb3r",
          name: "BVRB3R Studio",
          owner_profile_id: "owner-profile",
          app_approval_status: "pending",
          neighborhood: "Downtown",
          city: "Tampa",
          state: "FL",
          phone: null,
          address: null,
          created_at: "2026-04-01T12:00:00.000Z"
        }
      ],
      locations: [
        {
          id: "location-1",
          reference_code: "shop-bvrb3r",
          name: "BVRB3R Studio",
          neighborhood: "Downtown",
          city: "Tampa",
          state: "FL"
        }
      ]
    });
  });

  it("persists account interventions and writes them into the audit log", async () => {
    await applyPlatformAdminAction(founder, {
      type: "set_user_status",
      userId: "user-client",
      nextStatus: "deactivated",
      note: "Support requested a temporary account hold."
    });

    const payload = await getPlatformAdminConsolePayload(founder);
    const targetUser = payload.users.find((user) => user.id === "user-client");
    const auditEntry = payload.auditLog[0];

    expect(targetUser?.accountStatus).toBe("deactivated");
    expect(auditEntry.actionType).toBe("set_user_status");
    expect(auditEntry.targetId).toBe("user-client");
    expect(auditEntry.note).toMatch(/temporary account hold/i);
    expect(payload.warnings).toEqual([]);
  });

  it("persists shop control changes through the canonical founder control state", async () => {
    await applyPlatformAdminAction(founder, {
      type: "set_shop_control",
      shopId: "shop-bvrb3r",
      controlKey: "ai_manager_enabled",
      enabled: false,
      note: "Manual review mode while validating live floor recommendations."
    });

    const controlState = await readPlatformShopControlState("shop-bvrb3r");
    const payload = await getPlatformAdminConsolePayload(founder);
    const shopControl = payload.controls.shops.find((shop) => shop.shopId === "shop-bvrb3r");

    expect(controlState.aiManagerEnabled).toBe(false);
    expect(shopControl?.aiManagerEnabled).toBe(false);
    expect(payload.warnings).toEqual([]);
  });
});
