import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260414120000_owner_location_bootstrap_rls.sql"
);

describe("owner location bootstrap RLS migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("keeps locations protected by RLS while allowing only the authenticated shop owner bootstrap path", () => {
    expect(sql).toContain("alter table public.locations enable row level security");
    expect(sql).toContain('create policy "locations owner bootstrap insert"');
    expect(sql).toContain("s.id = reference_code");
    expect(sql).toContain("s.owner_profile_id = auth.uid()");
    expect(sql).toContain("p.primary_onboarding_role::text = 'shop_owner'");
    expect(sql).toContain("p.role::text in ('owner', 'shop_owner')");
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it("keeps owner staff-location membership scoped to the authenticated owner and linked shop", () => {
    expect(sql).toContain('create policy "staff locations owner bootstrap insert"');
    expect(sql).toContain("profile_id = auth.uid()");
    expect(sql).toContain("join public.shops s on s.id = l.reference_code");
    expect(sql).toContain("s.owner_profile_id = auth.uid()");
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});
