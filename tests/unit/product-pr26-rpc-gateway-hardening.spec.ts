import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260729172000_product_pr26_rpc_gateway_hardening.sql"
  ),
  "utf8"
).replace(/\s+/g, " ").toLowerCase();

describe("Product PR26 RPC gateway hardening", () => {
  it("isolates implementations outside the exposed public schema", () => {
    expect(migration).toContain("create schema if not exists rent_private");
    expect(migration).toContain("grant usage on schema rent_private to authenticated");
    expect(migration).not.toContain("grant usage on schema private");
    expect(migration).not.toMatch(/security definer\s+set search_path/);
    expect(migration.match(/security invoker/g)).toHaveLength(5);
    expect(migration).toContain(
      "from public, anon, authenticated, service_role"
    );
  });

  it("grants authenticated execution only on the isolated implementation and public gateway", () => {
    expect(migration).toMatch(
      /grant execute on function public\.pr26_request_rent_payment\(\s*uuid, text, integer, text\s*\) to authenticated/
    );
    expect(migration).toMatch(
      /grant execute on function public\.pr26_apply_relationship_lifecycle\(\s*uuid, text, text, timestamptz, text, jsonb\s*\) to authenticated/
    );
    expect(migration).toMatch(
      /grant execute on function rent_private\.pr26_request_rent_payment\(\s*uuid, text, integer, text\s*\) to authenticated/
    );
  });
});
