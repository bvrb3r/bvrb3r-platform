import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260729210000_product_pr28_feature_gates.sql",
  "utf8"
);

describe("PR28 feature gate migration", () => {
  it("creates the exact four-reason flag contract with RLS", () => {
    expect(migration).toContain("create table if not exists public.feature_flags");
    expect(migration).toContain("'building', 'plan', 'debug', 'staged'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
  });

  it("keeps runtime reads public-safe and mutations service-role-only", () => {
    expect(migration).toContain("for select");
    expect(migration).toContain("to anon, authenticated");
    expect(migration).toContain("revoke all on table public.feature_flags from public, anon, authenticated");
    expect(migration).toContain("grant select on table public.feature_flags to anon, authenticated");
    expect(migration).toContain("grant all on table public.feature_flags to service_role");
  });

  it("seeds every registered closed door as fail-closed", () => {
    const seedBlock = migration.match(
      /insert into public\.feature_flags[\s\S]*?on conflict \(key\) do nothing;/
    )?.[0];

    expect(seedBlock).toBeDefined();
    expect(seedBlock?.match(/\('[^']+', '[^']+', false,/g)).toHaveLength(15);
    expect(migration).toContain("'kiosk.shop.loyalty_check_in', 'staged', false");
    expect(migration).toContain("'kiosk.barber.loyalty_check_in', 'staged', false");
  });
});
