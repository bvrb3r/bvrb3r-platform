import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const locationMigrationPath =
  "supabase/migrations/20260803073230_release_v22_locations_compatibility.sql";
const marketplaceMigrationPath =
  "supabase/migrations/20260803073233_product_pr39_postgis_marketplace.sql";
const securityMigrationPath =
  "supabase/migrations/20260803073900_release_v22_security_runtime_convergence.sql";
const scopeRepairMigrationPath =
  "supabase/migrations/20260803074000_release_v22_scope_and_settlement_repair.sql";

const locations = readFileSync(locationMigrationPath, "utf8").toLowerCase();
const security = readFileSync(securityMigrationPath, "utf8").toLowerCase();
const scopeRepair = readFileSync(scopeRepairMigrationPath, "utf8").toLowerCase();

describe("release v22 production convergence", () => {
  it("adds legacy production location fields before the PR39 marketplace migration", () => {
    expect(locationMigrationPath.localeCompare(marketplaceMigrationPath)).toBeLessThan(0);
    expect(locations).toContain("add column if not exists address text");
    expect(locations).toContain("add column if not exists address_line_2 text");
    expect(locations).toContain("add column if not exists postal_code text");
  });

  it("moves exposed helpers and verification storage access behind private functions", () => {
    expect(security).toContain("private.is_internal_operator(text[])");
    expect(security).toContain("alter extension btree_gist set schema extensions");
    expect(security).toContain('drop policy if exists "storage read media"');
    expect(security).toContain("private.release_current_profile_role()");
    expect(security).toContain("private.release_is_verification_document_subject");
    expect(security).toContain("private.release_can_access_verification_storage_object");
    expect(security).not.toContain("cascade");
  });

  it("scopes owner access to active shop authority instead of a global role", () => {
    for (const migration of [security, scopeRepair]) {
      expect(migration).toContain("private.release_can_read_profile");
      expect(migration).toContain("private.release_can_read_booth_rent_ledger");
      expect(migration).toContain("private.has_shop_operator_access");
      expect(migration).not.toContain("= 'owner'::public.app_role");
    }

    expect(scopeRepairMigrationPath.localeCompare(securityMigrationPath)).toBeGreaterThan(0);
  });

  it("makes both rent request identities immutable and fingerprinted", () => {
    expect(security).toContain("release_rent_lifecycle_request_fingerprint");
    expect(security).toContain("release_rent_payment_request_fingerprint");
    expect(security.match(/request_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/g)).toHaveLength(2);
    expect(security).toContain("a relationship lifecycle request identity is immutable");
    expect(security).toContain("a rent payment request identity is immutable");
  });

  it("blocks relationship closure until every rent surface is settled", () => {
    for (const migration of [security, scopeRepair]) {
      expect(migration).toContain("private.release_relationship_has_unsettled_rent");
      expect(migration).toContain("release_staff_location_settle_first_guard");
      expect(migration).toContain("release_relationship_settle_first_guard");
      expect(migration).toContain("old.ended_at is null");
      expect(migration).toContain("new.ended_at is not null");
      expect(migration).toContain("rent must settle to $0.00 before pausing or ending");
    }

    expect(security).toContain("public.rent_obligations");
    expect(security).toContain("public.rent_payment_requests");
    expect(security).toContain("public.rent_line_disputes");
    expect(security).toContain("public.booth_rent_charges");
  });
});
