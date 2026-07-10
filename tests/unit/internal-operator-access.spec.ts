import { describe, expect, it } from "vitest";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import {
  applyInternalOperatorAccessRecord,
  hasFullArchitectAccess,
  type InternalOperatorAccessRecord
} from "@/lib/auth/internal-operator";
import type { UserAccount } from "@/types/domain";

function createUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "profile-test-1",
    role: "client_user",
    email: "operator@example.test",
    password: "",
    name: "Operator Test",
    title: "Client",
    locationIds: [],
    accountStatus: "active",
    ...overrides
  };
}

function record(
  accessLevel: InternalOperatorAccessRecord["access_level"],
  status: InternalOperatorAccessRecord["status"] = "active"
): InternalOperatorAccessRecord {
  return {
    access_level: accessLevel,
    status
  };
}

describe("internal operator access", () => {
  it("grants full Architect authority only to active architect-prime and operator records", () => {
    expect(hasFullArchitectAccess(record("architect_prime"))).toBe(true);
    expect(hasFullArchitectAccess(record("operator"))).toBe(true);
    expect(hasFullArchitectAccess(record("viewer"))).toBe(false);
    expect(hasFullArchitectAccess(record("architect_prime", "suspended"))).toBe(false);
    expect(hasFullArchitectAccess(record("operator", "revoked"))).toBe(false);
    expect(hasFullArchitectAccess(null)).toBe(false);
  });

  it("authorizes an operator independently from the public account role", () => {
    const resolved = applyInternalOperatorAccessRecord(
      createUser({ role: "client_user" }),
      record("architect_prime")
    );

    expect(resolved.role).toBe("client_user");
    expect(resolved.platformAdmin).toBe(true);
    expect(isPlatformAdminUser(resolved)).toBe(true);
  });

  it("canonicalizes a legacy Architect identity while preserving protected authority", () => {
    const resolved = applyInternalOperatorAccessRecord(
      createUser({
        role: "platform_admin",
        primaryOnboardingRole: "platform_admin",
        title: "Platform Admin"
      }),
      record("architect_prime")
    );

    expect(resolved).toMatchObject({
      role: "client_user",
      title: "BVRB3R Architect",
      platformAdmin: true
    });
    expect(resolved.primaryOnboardingRole).toBeUndefined();
    expect(isPlatformAdminUser(resolved)).toBe(true);
  });

  it("fails closed and removes legacy public identity when the protected operator record is absent", () => {
    const resolved = applyInternalOperatorAccessRecord(
      createUser({
        role: "platform_admin",
        primaryOnboardingRole: "platform_admin",
        title: "Platform Admin"
      }),
      null
    );

    expect(resolved).toMatchObject({
      role: "client_user",
      title: "Client",
      platformAdmin: false
    });
    expect(resolved.primaryOnboardingRole).toBeUndefined();
    expect(isPlatformAdminUser(resolved)).toBe(false);
  });

  it("does not grant full Architect authority to viewer-only records", () => {
    const resolved = applyInternalOperatorAccessRecord(
      createUser({ role: "shop_owner_user" }),
      record("viewer")
    );

    expect(resolved.platformAdmin).toBe(false);
    expect(isPlatformAdminUser(resolved)).toBe(false);
  });

  it("requires the account itself to remain active", () => {
    const resolved = applyInternalOperatorAccessRecord(
      createUser({ accountStatus: "suspended" }),
      record("architect_prime")
    );

    expect(resolved.platformAdmin).toBe(false);
    expect(isPlatformAdminUser({ ...resolved, platformAdmin: true })).toBe(false);
  });
});
