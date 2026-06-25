import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260625133000_architect_rls_evidence_view.sql"
);
const sql = readFileSync(migrationPath, "utf8");
const normalizedSql = sql.toLowerCase();

describe("architect RLS evidence metadata view migration", () => {
  it("creates the expected read-only architect_rls_evidence surface", () => {
    expect(migrationPath).toMatch(/20260625133000_architect_rls_evidence_view\.sql$/);
    expect(normalizedSql).toContain("create or replace view public.architect_rls_evidence");
    expect(normalizedSql).toContain("with (security_invoker = true)");
    expect(normalizedSql).toContain("private.rls_batch_5_is_platform_admin()");
    expect(normalizedSql).toContain("from pg_catalog.pg_class");
    expect(normalizedSql).toContain("join pg_catalog.pg_namespace");
    expect(normalizedSql).toContain("from pg_catalog.pg_policy");
    expect(normalizedSql).toContain("where n.nspname = 'public'");
    expect(normalizedSql).toContain("and c.relkind = 'r'");
  });

  it("exposes only safe table-level metadata columns expected by Mission Control", () => {
    for (const column of [
      "id",
      "schema_name",
      "table_name",
      "rls_enabled",
      "policy_count",
      "policy_names",
      "total_public_tables_inspected",
      "checked_at",
      "last_verified_at",
      "evidence_current"
    ]) {
      expect(normalizedSql).toContain(column);
    }

    expect(normalizedSql).toContain("content_exposed=false");
    expect(normalizedSql).toContain("no user, business, money, source vault, or private row contents are exposed");
  });

  it("does not select row contents from user, business, money, or Source Vault tables", () => {
    expect(normalizedSql).not.toMatch(/\bfrom\s+public\.(profiles|clients|barbers|shops|appointments|payments|refunds|payout_executions|payment_routing_records|source_vault)\b/);
    expect(normalizedSql).not.toMatch(/\bjoin\s+public\.(profiles|clients|barbers|shops|appointments|payments|refunds|payout_executions|payment_routing_records|source_vault)\b/);
    expect(normalizedSql).not.toContain("select *");
  });

  it("does not grant anon or broad public access", () => {
    expect(normalizedSql).toContain("revoke all on public.architect_rls_evidence from public");
    expect(normalizedSql).toContain("revoke all on public.architect_rls_evidence from anon");
    expect(normalizedSql).toContain("grant select on public.architect_rls_evidence to authenticated");
    expect(normalizedSql).not.toMatch(/grant\s+select\s+on\s+public\.architect_rls_evidence\s+to\s+(public|anon)/);
  });

  it("does not mutate production data or edit user-facing RLS policies", () => {
    expect(normalizedSql).not.toMatch(/\b(insert|update|delete|truncate|merge)\b/);
    expect(normalizedSql).not.toMatch(/\b(alter table|create policy|alter policy|drop policy|enable row level security|disable row level security)\b/);
    expect(normalizedSql).not.toMatch(/\bcreate\s+table\b/);
    expect(normalizedSql).not.toMatch(/\bdrop\s+table\b/);
  });
});
