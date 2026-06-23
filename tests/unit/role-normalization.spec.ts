import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
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

function readApiFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return readApiFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

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
    const linkedOwnerDecision = decideRoleNormalization({
      profileId: "profile-owner-safe",
      currentRole: "owner",
      hasOwnedShopRecord: true
    });
    const blockedOwnerDecision = decideRoleNormalization({
      profileId: "profile-owner-blocked",
      currentRole: "owner",
      hasOwnedShopRecord: false
    });

    expect(linkedOwnerDecision).toMatchObject({
      action: "normalize_account_role",
      status: "eligible",
      targetRole: "shop_owner_user"
    });

    expect(blockedOwnerDecision).toMatchObject({
      action: "manual_review",
      status: "blocked",
      targetRole: "shop_owner_user"
    });
    expect(linkedOwnerDecision.targetRole).not.toBe("shop_owner");
    expect(blockedOwnerDecision.targetRole).not.toBe("shop_owner");
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

  it("keeps the approved eligible-only migration candidate guarded, reversible, and canonical-only", () => {
    const migrationPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260623183000_approved_eligible_only_role_normalization.sql"
    );
    const sql = readFileSync(migrationPath, "utf8");
    const normalizedSql = sql.toLowerCase();
    const apiSource = readApiFiles(join(process.cwd(), "app", "api")).map((file) => readFileSync(file, "utf8")).join("\n");

    expect(sql).toContain("PR #29 Approved Eligible-Only Role Normalization Migration Candidate");
    expect(sql).toContain("v_expected_total_profiles_inspected constant integer := 27");
    expect(sql).toContain("v_expected_eligible_count constant integer := 16");
    expect(sql).toContain("v_expected_blocked_count constant integer := 2");
    expect(sql).toContain("v_expected_manual_review_count constant integer := 5");
    expect(sql).toContain("v_expected_no_op_count constant integer := 4");
    expect(sql).toContain("v_expected_affected_count constant integer := 23");
    expect(sql).toContain("if to_regtype('public.app_role') is null then");
    expect(sql).toContain("public.app_role is missing required role labels");
    expect(sql).toContain("profile_role_inputs as");
    expect(sql).toContain("eligible_profiles as");
    expect(sql).toContain("blocked_profiles as");
    expect(sql).toContain("manual_review_profiles as");
    expect(sql).toContain("no_op_profiles as");
    expect(sql).toContain("approval_packet_counts as");
    expect(sql).toContain("nullif(btrim(coalesce(p.role::text, '')), '') as old_role");
    expect(sql).toContain("nullif(btrim(coalesce(p.role::text, '')), '') = backup.old_role");
    expect(sql).toContain("raise exception 'PR29 role normalization aborted: expected % total profiles inspected, found %.'");
    expect(sql).toContain("raise exception 'PR29 role normalization aborted: expected % eligible rows, found %.'");
    expect(sql).toContain("raise exception 'PR29 role normalization aborted: expected % blocked rows, found %.'");
    expect(sql).toContain("raise exception 'PR29 role normalization aborted: expected % manual-review rows, found %.'");
    expect(sql).toContain("raise exception 'PR29 role normalization aborted: expected % no-op rows, found %.'");
    expect(sql).toContain("raise exception 'PR29 role normalization aborted: expected % affected rows, found %.'");
    expect(sql).toContain("private.role_normalization_profile_backups");
    expect(sql).toContain("primary key (migration_key, profile_id)");
    expect(sql).toContain("Rollback instructions for founder-approved manual rollback only");
    expect(sql).toContain("backup.old_role::public.app_role");
    expect(sql).toContain("when old_role = 'client' and has_client_record then 'client_user'");
    expect(sql).toContain("when old_role = 'booth_rent_barber' and has_barber_record then 'barber_user'");
    expect(sql).toContain("when old_role = 'commission_barber' and has_barber_record then 'barber_user'");
    expect(sql).toContain("when old_role = 'owner' and has_owned_shop_record then 'shop_owner_user'");
    expect(sql).toContain("old_role = 'client' and has_client_record");
    expect(sql).toContain("old_role = 'booth_rent_barber' and has_barber_record");
    expect(sql).toContain("old_role = 'commission_barber' and has_barber_record");
    expect(sql).toContain("old_role = 'owner' and has_owned_shop_record");
    expect(sql).toContain("old_role in ('front_desk', 'manager', 'platform_admin')");
    expect(sql).toContain("backup.new_role in ('client_user', 'barber_user', 'shop_owner_user')");
    expect(sql).toContain("backup.new_role <> 'shop_owner'");
    expect(sql).toContain("updated_at = now()");
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(normalizedSql).not.toContain("auth.users");
    expect(normalizedSql).not.toContain("payment_routing_records");
    expect(normalizedSql).not.toContain("payout_executions");
    expect(normalizedSql).not.toContain("stripe");
    expect(normalizedSql).not.toContain("create policy");
    expect(normalizedSql).not.toContain("alter table public.profiles");
    expect(apiSource).not.toMatch(/role[-_ ]normalization[\s\S]{0,160}(update|execute|mutation)/i);
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
      affectedCount: 9,
      eligibleCount: 4,
      blockedCount: 2,
      manualReviewCount: 3,
      noOpCount: 1,
      currentRoleCounts: {
        client: 2,
        booth_rent_barber: 1,
        commission_barber: 1,
        owner: 1,
        front_desk: 1,
        manager: 1,
        platform_admin: 1,
        mystery_role: 1,
        client_user: 1
      },
      proposedRoleCounts: {
        client_user: 3,
        barber_user: 2,
        shop_owner_user: 1
      },
      blockedRoleCounts: {
        client: 1,
        mystery_role: 1
      },
      manualReviewRoleCounts: {
        front_desk: 1,
        manager: 1,
        platform_admin: 1
      },
      canonicalOutputOnly: true,
      rollbackPacketPresent: true,
      publicOutputRedacted: true
    });
    expect(packet.rows.find((row) => row.currentRole === "front_desk")).toMatchObject({
      decision: "manual_review",
      proposedRole: null,
      safeToNormalize: false
    });
    expect(packet.rows.find((row) => row.currentRole === "mystery_role")).toMatchObject({
      decision: "blocked",
      safeToNormalize: false
    });
    expect(packet.rows.filter((row) => row.decision === "eligible").every((row) =>
      row.safeToNormalize && row.rollbackInstructions.includes("snapshot profile_id and old_role")
    )).toBe(true);
    expect(packet.rows.some((row) => String(row.proposedRole) === "shop_owner")).toBe(false);
    expect(packet.rows.every((row) => row.redactedProfileId.startsWith("profile_redacted_"))).toBe(true);
    expect(publicJson).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(publicJson).not.toContain("front-desk-private-id");
    expect(publicJson).not.toContain("\"proposedRole\":\"shop_owner\"");
    expect(publicJson).not.toContain("update public.profiles");
    expect(publicJson).not.toContain("delete from");
  });
});
