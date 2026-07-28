import { describe, expect, it } from "vitest";

import {
  NON_SELF_ASSIGNABLE_ROLES,
  evaluateRoleActivation,
  isNonSelfAssignableRole,
  isRoleActivationAllowed
} from "@/lib/auth/role-activation";

/**
 * Role activation policy.
 *
 * The requested lane can arrive from a cookie or from `user_metadata`, both of
 * which the account holder controls. These cases pin what that request is
 * allowed to achieve.
 */
describe("role activation: first activation", () => {
  it("activates each of the three public lanes from a clean profile", () => {
    expect(evaluateRoleActivation("client", null)).toEqual({
      allowed: true,
      outcome: "activated",
      role: "client_user",
      intent: "client"
    });
    expect(evaluateRoleActivation("barber", null)).toMatchObject({ allowed: true, role: "barber_user" });
    expect(evaluateRoleActivation("shop_owner", null)).toMatchObject({ allowed: true, role: "shop_owner_user" });
  });

  it("rejects a request that names no recognised lane", () => {
    for (const value of [null, undefined, "", "wizard", 42, {}, ["client"]]) {
      const decision = evaluateRoleActivation(value, null);
      expect(decision.allowed, `${JSON.stringify(value)} should not activate`).toBe(false);
      expect(decision.outcome).toBe("invalid_request");
    }
  });
});

describe("role activation: no self-escalation", () => {
  it("never lets a request name an operator or internal role", () => {
    for (const role of NON_SELF_ASSIGNABLE_ROLES) {
      const decision = evaluateRoleActivation(role, null);
      expect(decision.allowed, `${role} must not be self-assignable`).toBe(false);
      expect(decision.outcome).toBe("escalation_blocked");
    }
  });

  it("blocks the Architect role by every spelling the codebase uses", () => {
    for (const role of ["platform_admin", "architect"]) {
      expect(evaluateRoleActivation(role, null).outcome).toBe("escalation_blocked");
      expect(evaluateRoleActivation(role, "client_user").outcome).toBe("escalation_blocked");
    }
  });

  it("blocks the legacy privileged operator roles the 0001 policies key on", () => {
    // profiles.role = 'owner' unlocks blanket access in the initial schema, so
    // it is exactly as dangerous as platform_admin here.
    for (const role of ["owner", "manager", "front_desk"]) {
      expect(evaluateRoleActivation(role, null).outcome).toBe("escalation_blocked");
    }
  });

  it("never re-lanes an account that already holds internal access", () => {
    const decision = evaluateRoleActivation("client", "platform_admin");
    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("lane_change_blocked");
  });

  it("identifies non-self-assignable roles consistently", () => {
    expect(isNonSelfAssignableRole("platform_admin")).toBe(true);
    expect(isNonSelfAssignableRole("owner")).toBe(true);
    expect(isNonSelfAssignableRole("client_user")).toBe(false);
    expect(isNonSelfAssignableRole("shop_owner_user")).toBe(false);
    expect(isNonSelfAssignableRole(null)).toBe(false);
  });
});

describe("role activation: idempotency and duplicate submits", () => {
  it("treats a repeated activation as success, not an error", () => {
    const decision = evaluateRoleActivation("barber", "barber_user");
    expect(decision.allowed).toBe(true);
    expect(decision.outcome).toBe("already_active");
  });

  it("is stable across repeated identical submissions", () => {
    const first = evaluateRoleActivation("client", null);
    const second = evaluateRoleActivation("client", "client_user");
    const third = evaluateRoleActivation("client", "client_user");

    expect(first.allowed && second.allowed && third.allowed).toBe(true);
    expect(second).toEqual(third);
  });

  it("recognises a legacy stored role as already being the same lane", () => {
    // Pre-doctrine rows store "client"/"barber"; re-submitting the matching
    // intent must not read as a lane change.
    expect(evaluateRoleActivation("client", "client").outcome).toBe("already_active");
    expect(evaluateRoleActivation("barber", "barber").outcome).toBe("already_active");
    expect(evaluateRoleActivation("barber", "booth_rent_barber").outcome).toBe("already_active");
  });
});

describe("role activation: lane changes", () => {
  it("refuses to switch an activated account to a different lane", () => {
    const decision = evaluateRoleActivation("shop_owner", "client_user");
    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("lane_change_blocked");
    expect(decision).toMatchObject({ currentRole: "client_user" });
  });

  it("refuses the client-to-owner upgrade specifically", () => {
    expect(isRoleActivationAllowed("shop_owner", "client_user")).toBe(false);
    expect(isRoleActivationAllowed("shop_owner", "barber_user")).toBe(false);
  });

  it("gives a reason a UI can show rather than failing silently", () => {
    const decision = evaluateRoleActivation("shop_owner", "client_user");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason.length).toBeGreaterThan(0);
    }
  });
});
