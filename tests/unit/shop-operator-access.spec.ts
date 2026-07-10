import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../supabase/migrations/20260710214500_shop_operator_authority_foundation.sql",
  import.meta.url
);
const migrationSql = readFileSync(migrationUrl, "utf8");

function functionDefinition(name: string) {
  const marker = `create or replace function private.${name}`;
  const start = migrationSql.indexOf(marker);
  expect(start, `${name} definition should exist`).toBeGreaterThanOrEqual(0);
  const end = migrationSql.indexOf("\n$$;", start);
  expect(end, `${name} definition should terminate`).toBeGreaterThan(start);
  return migrationSql.slice(start, end + 4);
}

describe("shop operator authority migration", () => {
  it("stores shop authority in a protected RLS table rather than public profile roles", () => {
    expect(migrationSql).toContain("create table if not exists public.shop_operator_access");
    expect(migrationSql).toContain("check (access_level in ('owner', 'manager', 'front_desk'))");
    expect(migrationSql).toContain("alter table public.shop_operator_access enable row level security");
    expect(migrationSql).toContain(
      "revoke all on table public.shop_operator_access from public, anon, authenticated"
    );
    expect(migrationSql).toContain("grant all on table public.shop_operator_access to service_role");
  });

  it("backfills only explicit shop ownership and does not infer manager or front-desk access", () => {
    const backfillStart = migrationSql.indexOf("insert into public.shop_operator_access");
    const helperStart = migrationSql.indexOf(
      "create or replace function private.has_shop_operator_access"
    );
    const backfill = migrationSql.slice(backfillStart, helperStart);

    expect(backfill).toContain("from public.shops s");
    expect(backfill).toContain("s.owner_profile_id");
    expect(backfill).toContain("'shops.owner_profile_id'");
    expect(backfill).not.toContain("from public.staff_locations");
    expect(backfill).not.toMatch(/p[.]role.*(?:manager|front_desk)/i);
  });

  it("cuts high-leverage shop helpers over to protected access with empty search paths", () => {
    const helpers = [
      "has_shop_operator_access",
      "is_booking_shop_operator",
      "rls_batch_4_is_shop_operator_reference",
      "rls_batch_5_is_shop_owner_reference",
      "rls_batch_5_is_shop_operator_reference",
      "rls_batch_5_can_read_barber_by_shop",
      "rls_disabled_cleanup_can_read_location_reference"
    ];

    for (const name of helpers) {
      const definition = functionDefinition(name);
      expect(definition).toContain("security definer");
      expect(definition).toContain("set search_path = ''");
    }

    for (const name of helpers.slice(1)) {
      expect(functionDefinition(name)).not.toMatch(
        /p[.]role.*(?:'owner'|'manager'|'front_desk')/i
      );
    }

    expect(functionDefinition("has_shop_operator_access")).toContain(
      "from public.shop_operator_access soa"
    );
  });

  it("keeps shop ownership synchronized and prevents cross-shop location grants", () => {
    expect(migrationSql).toContain(
      "create trigger shops_owner_operator_access_sync"
    );
    expect(migrationSql).toContain(
      "execute function private.sync_shop_owner_operator_access()"
    );
    expect(migrationSql).toContain(
      "Shop operator location must belong to the selected shop."
    );
    expect(migrationSql).toContain(
      "create unique index if not exists shop_operator_access_active_primary_owner_idx"
    );
  });

  it("publishes service-role-only evidence and removes the legacy location-membership role clause", () => {
    expect(migrationSql).toContain(
      "create or replace view public.v1_shop_operator_authority_evidence"
    );
    expect(migrationSql).toContain(
      "grant select on table public.v1_shop_operator_authority_evidence to service_role"
    );
    expect(migrationSql).toContain(
      'alter policy "location memberships self or owner"'
    );
    expect(migrationSql).toContain(
      "or private.has_shop_operator_access(null, location_id)"
    );
    expect(migrationSql).toContain("or private.is_internal_operator()");
  });
});
