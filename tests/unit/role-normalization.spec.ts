import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isClientRole,
  isShopOwnerRole,
  isBarberAccountRole,
  isRoleAllowed,
  getCanonicalAccountRole,
  normalizeAccountRole,
  normalizeBarberSubtype,
  subtypeFromLegacyBarberRole
} from "@/lib/auth/roles";
import {
  buildRoleNormalizationApprovalPacket,
  decideRoleNormalization,
  summarizeRoleNormalizationPlan
} from "@/lib/auth/role-normalization-plan";

describe("barber account role normalization", () => {
  it("normalizes legacy account roles to master-truth identity roles", () => {
    expect(getCanonicalAccountRole("client")).toBe("client_user");
    expect(normalizeAccountRole("client_user")).toBe("client_user");
    expect(normalizeAccountRole("booth_rent_barber")).toBe("barber_user");
    expect(normalizeAccountRole("commission_barber")).toBe("barber_user");
    expect(normalizeAccountRole("freelance_barber")).toBe("barber_user");
    expect(normalizeAccountRole("barber")).toBe("barber_user");
    expect(normalizeAccountRole("barber_user")).toBe("barber_user");
    expect(normalizeAccountRole("owner")).toBe("shop_owner_user");
    expect(normalizeAccountRole("shop_owner")).toBe("shop_owner_user");
    expect(normalizeAccountRole("shop_owner_user")).toBe("shop_owner_user");
  });

  it("keeps business relationship subtype separate from account role", () => {
    expect(normalizeBarberSubtype("blueprint")).toBe("booth_rent");
    expect(normalizeBarberSubtype("booth_rent")).toBe("booth_rent");
    expect(normalizeBarberSubtype("commission")).toBe("commission");
    expect(normalizeBarberSubtype("freelance")).toBe("freelance");
    expect(subtypeFromLegacyBarberRole("booth_rent_barber")).toBe("booth_rent");
    expect(subtypeFromLegacyBarberRole("commission_barber")).toBe("commission");
  });

  it("allows canonical barber users through legacy barber gates while data migrates", () => {
    expect(isClientRole("client_user")).toBe(true);
    expect(isClientRole("client")).toBe(true);
    expect(isShopOwnerRole("shop_owner_user")).toBe(true);
    expect(isShopOwnerRole("owner")).toBe(true);
    expect(isBarberAccountRole("barber_user")).toBe(true);
    expect(isBarberAccountRole("barber")).toBe(true);
    expect(isRoleAllowed("barber_user", ["booth_rent_barber"])).toBe(true);
    expect(isRoleAllowed("booth_rent_barber", ["barber_user"])).toBe(true);
    expect(isRoleAllowed("commission_barber", ["barber_user"])).toBe(true);
    expect(isRoleAllowed("shop_owner_user", ["owner"])).toBe(true);
    expect(isRoleAllowed("client_user", ["client"])).toBe(true);
  });
});

describe("role normalization migration plan", () => {
  it("maps client to client_user only when linked client evidence exists", () => {
    expect(decideRoleNormalization({
      profileId: "profile-client-safe",
      currentRole: "client",
      hasClientRecord: true
    })).toMatchObject({
      action: "normalize_account_role",
      status: "eligible",
      targetRole: "client_user",
      rollbackSql: "update public.profiles set role = 'client'::public.app_role where id = 'profile-client-safe';"
    });

    expect(decideRoleNormalization({
      profileId: "profile-client-blocked",
      currentRole: "client",
      hasClientRecord: false
    })).toMatchObject({
      action: "manual_review",
      status: "blocked",
      targetRole: "client_user"
    });
  });

  it("maps barber relationship account-role drift to barber_user only as account role", () => {
    expect(decideRoleNormalization({
      profileId: "profile-booth",
      currentRole: "booth_rent_barber",
      hasBarberRecord: true
    })).toMatchObject({
      action: "normalize_account_role",
      status: "eligible",
      targetRole: "barber_user",
      relationshipMetadataPreserved: true,
      proposedBarberSubtype: "booth_rent"
    });

    expect(decideRoleNormalization({
      profileId: "profile-commission",
      currentRole: "commission_barber",
      hasBarberRecord: true
    })).toMatchObject({
      action: "normalize_account_role",
      status: "eligible",
      targetRole: "barber_user",
      relationshipMetadataPreserved: true,
      proposedBarberSubtype: "commission"
    });

    expect(decideRoleNormalization({
      profileId: "profile-commission-missing",
      currentRole: "commission_barber",
      hasBarberRecord: false
    })).toMatchObject({
      action: "manual_review",
      status: "blocked",
      targetRole: "barber_user"
    });
  });

  it("maps owner to shop_owner_user only when owned shop evidence exists", () => {
    expect(decideRoleNormalization({
      profileId: "profile-owner-safe",
      currentRole: "owner",
      hasOwnedShopRecord: true
    })).toMatchObject({
      action: "normalize_account_role",
      status: "eligible",
      targetRole: "shop_owner_user"
    });

    expect(decideRoleNormalization({
      profileId: "profile-owner-blocked",
      currentRole: "owner",
      hasOwnedShopRecord: false
    })).toMatchObject({
      action: "manual_review",
      status: "blocked",
      targetRole: "shop_owner_user"
    });
  });

  it("blocks operational and internal roles instead of blindly converting them", () => {
    for (const role of ["front_desk", "manager", "platform_admin"]) {
      expect(decideRoleNormalization({
        profileId: `profile-${role}`,
        currentRole: role,
        primaryOnboardingRole: role === "platform_admin" ? "platform_admin" : null
      })).toMatchObject({
        action: "manual_review",
        status: "blocked",
        targetRole: role
      });
    }
  });

  it("keeps unsupported roles blocked and reports rollback coverage for eligible rows", () => {
    const summary = summarizeRoleNormalizationPlan([
      { profileId: "client-safe", currentRole: "client", hasClientRecord: true },
      { profileId: "booth-safe", currentRole: "booth_rent_barber", hasBarberRecord: true },
      { profileId: "owner-safe", currentRole: "owner", hasOwnedShopRecord: true },
      { profileId: "manager-blocked", currentRole: "manager" },
      { profileId: "mystery-blocked", currentRole: "mystery_role" },
      { profileId: "canonical", currentRole: "client_user" }
    ]);

    expect(summary).toMatchObject({
      totalProfilesInspected: 6,
      eligibleCount: 3,
      blockedCount: 2,
      noChangeCount: 1,
      rollbackPlanPresent: true,
      unsupportedRoles: ["mystery_role"]
    });
    expect(summary.ambiguousRoles).toEqual(["manager", "mystery_role"]);
    expect(summary.decisions.every((decision) =>
      decision.status !== "eligible" || decision.rollbackSql?.startsWith("update public.profiles set role = ")
    )).toBe(true);
  });

  it("keeps the migration-ready SQL plan reversible and approval-gated", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migration-plans", "role_normalization_migration_plan.sql"), "utf8");

    expect(sql).toContain("Status: migration-ready plan only. Do not run against production until founder approval.");
    expect(sql).toContain("Dry-run affected row preview");
    expect(sql).toContain("create table if not exists public.role_normalization_profile_backup_20260623");
    expect(sql).toContain("Rollback plan");
    expect(sql).toContain("update public.profiles p");
    expect(sql).toContain("front_desk");
    expect(sql).toContain("manager");
    expect(sql).toContain("platform_admin");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("alter table");
    expect(sql).not.toContain("create policy");
  });

  it("builds a redacted dry-run approval packet without raw private identifiers", () => {
    const packet = buildRoleNormalizationApprovalPacket([
      { profileId: "11111111-2222-3333-4444-555555555555", currentRole: "client", hasClientRecord: true },
      { profileId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", currentRole: "booth_rent_barber", hasBarberRecord: true },
      { profileId: "ffffffff-1111-2222-3333-444444444444", currentRole: "commission_barber", hasBarberRecord: true },
      { profileId: "99999999-8888-7777-6666-555555555555", currentRole: "owner", hasOwnedShopRecord: true },
      { profileId: "front-desk-private-id", currentRole: "front_desk" },
      { profileId: "manager-private-id", currentRole: "manager" },
      { profileId: "admin-private-id", currentRole: "platform_admin", primaryOnboardingRole: "platform_admin" },
      { profileId: "missing-linkage-private-id", currentRole: "client", hasClientRecord: false },
      { profileId: "unsupported-private-id", currentRole: "mystery_role" },
      { profileId: "canonical-private-id", currentRole: "client_user" }
    ]);
    const publicJson = JSON.stringify(packet);

    expect(packet).toMatchObject({
      approvalRequired: true,
      rawMutationExecuted: false,
      totalAffectedCount: 9,
      eligibleCount: 4,
      blockedCount: 2,
      manualReviewCount: 3,
      noOpCount: 1,
      rollbackPacketPresent: true,
      publicOutputRedacted: true
    });
    expect(packet.rows.find((row) => row.currentRole === "front_desk")).toMatchObject({
      decision: "manual_review",
      safeToNormalize: false
    });
    expect(packet.rows.find((row) => row.currentRole === "mystery_role")).toMatchObject({
      decision: "blocked",
      safeToNormalize: false
    });
    expect(packet.rows.filter((row) => row.decision === "eligible").every((row) =>
      row.safeToNormalize && row.rollbackInstructions.includes("snapshot profile_id and old_role")
    )).toBe(true);
    expect(packet.rows.every((row) => row.redactedProfileId.startsWith("profile_redacted_"))).toBe(true);
    expect(publicJson).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(publicJson).not.toContain("front-desk-private-id");
    expect(publicJson).not.toContain("update public.profiles");
    expect(publicJson).not.toContain("delete from");
  });
});
