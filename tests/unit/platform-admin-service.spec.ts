import { beforeEach, describe, expect, it } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import {
  applyPlatformAdminAction,
  getPlatformAdminConsolePayload,
  readPlatformShopControlState,
  resetPlatformAdminStateForTests
} from "@/lib/platform-admin/service";

describe("platform admin service", () => {
  const founder = resolveDemoUser("architect@bvrb3r.demo");

  beforeEach(() => {
    resetPlatformAdminStateForTests();
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
