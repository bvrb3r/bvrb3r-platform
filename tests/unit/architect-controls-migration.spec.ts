import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260729230000_product_pr29_architect_city_controls.sql"), "utf8");

describe("PR29 Architect control migration", () => {
  it("forces RLS and keeps control writes service-owned", () => {
    expect(sql).toContain("alter table public.architect_system_controls force row level security");
    expect(sql).toContain("alter table public.architect_control_audit force row level security");
    expect(sql).toContain("revoke all on public.architect_system_controls from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update on public.architect_system_controls to service_role");
  });

  it("uses optimistic versions and append-only audit evidence", () => {
    expect(sql).toContain("version bigint not null default 1");
    expect(sql).toContain("Architect control audit rows are append-only.");
    expect(sql).toContain("before update or delete on public.architect_control_audit");
    expect(sql).toContain("architect_control_audit_request_uidx");
  });
});
