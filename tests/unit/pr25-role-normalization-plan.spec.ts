import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const plan = readFileSync(
  join(process.cwd(), "supabase/migration-plans/role_normalization_migration_plan.sql"),
  "utf8"
);
const productionIdentity = readFileSync(
  join(process.cwd(), "lib/auth/production-identity.ts"),
  "utf8"
);

function activeSql(sql: string) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("PR25 role normalization migration plan", () => {
  it("keeps PR25 aggregate-only and non-mutating", () => {
    const executable = activeSql(plan);

    expect(executable).toContain("with profile_role_inputs as");
    expect(executable).toContain("select");
    expect(executable).not.toMatch(/\b(insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/i);
  });

  it("requires linkage evidence for every automatic mapping", () => {
    expect(plan).toContain("old_role = 'client' and has_client_record");
    expect(plan).toContain("old_role in ('booth_rent_barber', 'commission_barber') and has_barber_record");
    expect(plan).toContain("old_role = 'owner' and has_owned_shop_record");
    expect(plan).toContain("then 'manual_review'");
    expect(plan).toContain("then 'blocked_missing_linkage'");
  });

  it("uses only the protected backup spine and preserves rollback guidance", () => {
    expect(plan).toContain("private.role_normalization_profile_backups");
    expect(plan).not.toContain("public.role_normalization_profile_backup_");
    expect(plan).toContain("backup.old_role::public.app_role");
    expect(plan).toContain("PR #25 does not execute it");
  });

  it("keeps the SMS profile bootstrap inside canonical account roles", () => {
    expect(productionIdentity.match(/role: getCanonicalAccountRole\(existingProfile\?\.role\)/g)).toHaveLength(2);
    expect(productionIdentity).not.toContain('existingProfile?.role === "shop_owner" ? "owner"');
    expect(productionIdentity).not.toContain('existingProfile?.role ?? "client"');
  });
});
