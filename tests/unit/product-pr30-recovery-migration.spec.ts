import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260730003000_product_pr30_account_recovery.sql"),
  "utf8"
);
const flat = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();

describe("Product PR30 account-recovery migration", () => {
  it("stores digests and expiry evidence without plaintext secret columns", () => {
    expect(flat).toContain("code_hash text not null");
    expect(flat).toContain("reset_token_hash text");
    expect(flat).toContain("expires_at timestamptz not null");
    expect(flat).not.toMatch(/\b(code|reset_token) text/);
  });

  it("forces service-only RLS", () => {
    expect(flat).toContain("alter table public.auth_recovery_challenges force row level security");
    expect(flat).toContain("revoke all on public.auth_recovery_challenges from public, anon, authenticated");
    expect(flat).toContain("grant select, insert, update, delete on public.auth_recovery_challenges to service_role");
    expect(flat).toContain("create policy auth_recovery_service_role_only");
    expect(flat).toContain("to service_role using (true) with check (true)");
  });

  it("indexes rate-limit, profile cleanup, and one-use reset lookups", () => {
    expect(flat).toContain("auth_recovery_target_rate_idx");
    expect(flat).toContain("auth_recovery_source_rate_idx");
    expect(flat).toContain("auth_recovery_reset_token_uidx");
    expect(flat).toContain("auth_recovery_profile_idx");
    expect(flat).toContain("where reset_token_hash is not null");
  });
});
