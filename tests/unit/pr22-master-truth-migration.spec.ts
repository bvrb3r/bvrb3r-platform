import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260721105858_pr22_master_truth_relationships_rent_kiosk.sql"
), "utf8");

describe("PR22 updated master-truth migration", () => {
  it("keeps identity separate from bilateral money relationships", () => {
    expect(sql).toContain("relationship_type in ('booth_rent', 'commission')");
    expect(sql).toContain("('three_account_roles'");
    expect(sql).toContain("('client_user', 'barber_user', 'shop_owner_user')");
    expect(sql).toContain("approved_by_owner_at is not null");
    expect(sql).toContain("approved_by_barber_at is not null");
  });

  it("versions accepted compensation instead of rewriting it", () => {
    expect(sql).toContain("unique (relationship_id, version)");
    expect(sql).toContain("Compensation rule versions must be sequential.");
    expect(sql).toContain("Active compensation facts are immutable; create the next version.");
    expect(sql).toContain("Appointment compensation snapshots are immutable.");
  });

  it("activates and ends the whole relationship lifecycle atomically", () => {
    expect(sql).toContain("public.activate_shop_barber_relationship_internal");
    expect(sql).toContain("A membership must never become active without its bilateral");
    expect(sql).toContain("insert into public.shop_barber_relationships");
    expect(sql).toContain("insert into public.compensation_rules");
    expect(sql).toContain("public.end_shop_barber_relationship_internal");
    expect(sql).toContain("set is_active = false");
    expect(sql).toContain("'effective_routing_model', 'freelance'");
  });

  it("keeps tips with the barber and rent outside appointment splits", () => {
    expect(sql).toContain("greatest(new.service_amount - new.platform_fee_amount, 0)");
    expect(sql).toContain("expected_barber_service + new.tip_amount");
    expect(sql).toContain("where p.routing_model = 'booth_rent' and p.shop_split_amount <> 0");
    expect(sql).toContain("public.booth_rent_charges");
    expect(sql).toContain("period_paid + new.amount_paid_cents > new.max_charge_cents");
    expect(sql).toContain("appointment_reference_value");
  });

  it("uses controlled kiosk sessions and advances only next-available rotation", () => {
    expect(sql).toContain("session_timeout_seconds between 60 and 90");
    expect(sql).toContain("session_token_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("routing_type in ('next_available_rotation', 'picked_barber', 'direct_barber')");
    expect(sql).toContain("Direct barber selection must not advance rotation.");
    expect(sql).toContain("private.advance_confirmed_walkin_rotation()");
    expect(sql).toContain("old.status = 'confirmed'");
  });

  it("fails closed at the Data API boundary", () => {
    for (const table of [
      "shop_barber_relationships",
      "compensation_rules",
      "booth_rent_charges",
      "commission_ledger",
      "kiosk_sessions",
      "shop_walkin_rotation",
      "kiosk_rotation_assignments"
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
    expect(sql).toContain("grant execute on function public.bvrb3r_pr22_master_truth_snapshot() to service_role");
  });
});
