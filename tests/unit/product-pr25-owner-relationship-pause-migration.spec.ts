import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260729150000_product_pr25_owner_relationship_pause.sql"
  ),
  "utf8"
).replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();

describe("Product PR25 owner relationship pause migration", () => {
  it("is transactional and adds a real paused relationship state", () => {
    expect(migration.trim().startsWith("begin;")).toBe(true);
    expect(migration.trim().endsWith("commit;")).toBe(true);
    expect(migration).toContain("'active', 'paused', 'rejected'");
    expect(migration).toContain("staff_locations_pause_state_ck");
  });

  it("keeps canonical relationship and floor eligibility in sync", () => {
    expect(migration).toContain("set status = case when p_paused then 'suspended' else 'active' end");
    expect(migration).toContain("set relationship_status = next_status");
    expect(migration).toContain("rotation_override_barber_id = null");
  });

  it("requires recorded owner authority and writes an audit", () => {
    expect(migration).toContain("soa.access_level = 'owner'");
    expect(migration).toContain("soa.status = 'active'");
    expect(migration).toContain("'owner_relationship_paused'");
    expect(migration).toContain("'owner_relationship_resumed'");
  });

  it("exposes the security-definer mutation only to service role", () => {
    expect(migration).toContain("security definer set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
