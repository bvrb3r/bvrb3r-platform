import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(
  process.cwd(),
  "supabase/migrations/20260728215000_pr23_retired_model_execution_cleanup.sql"
);
const sql = readFileSync(path, "utf8");
const activationStart = sql.indexOf(
  "create or replace function public.activate_shop_barber_relationship_internal"
);
const activationEnd = sql.indexOf(
  "-- 3. Remove the unreachable dead synchronizer."
);
const activation = sql.slice(activationStart, activationEnd);

describe("PR23 retired-model execution cleanup", () => {
  it("keeps the existing activation RPC signature while allowing only rent models", () => {
    expect(activationStart).toBeGreaterThan(-1);
    expect(activation).toContain(
      "relationship_type_value not in ('booth_rent', 'autobooth_rent')"
    );
    expect(activation).toContain(
      "A shop relationship must explicitly choose Full Booth Rent or AutoBooth Rent."
    );
    expect(activation).not.toContain("relationship_type_value = 'commission'");
  });

  it("requires real rent terms and an owner-approved AutoBooth portion", () => {
    expect(activation).toContain("booth_rent_cents_value <= 0");
    expect(activation).toContain(
      "invite_row.booth_rent_frequency not in ('daily', 'weekly', 'monthly')"
    );
    expect(activation).toContain("relationship_type_value = 'autobooth_rent'");
    expect(activation).toContain("autobooth_percent_value > 1");
  });

  it("writes supported terms and nulls every retired percentage field", () => {
    expect(activation).toContain("commission_rate = null");
    expect(activation).toContain("barber_percent = null");
    expect(activation).toContain("shop_percent = null");
    expect(activation).toContain("commission_cap_amount = null");
    expect(activation).toContain("commission_cap_frequency = null");
    expect(activation).toContain("autobooth_percent = excluded.autobooth_percent");
  });

  it("preserves immutable history while removing the dead synchronizer", () => {
    expect(sql).toContain(
      "drop function if exists private.sync_commission_ledger_from_routing()"
    );
    expect(sql).not.toContain("drop table public.commission_ledger");
    expect(sql).toContain("reject_commission_ledger_writes");
  });

  it("adds a release truth snapshot and service-only execution", () => {
    expect(sql).toContain("public.bvrb3r_pr23_retired_model_snapshot()");
    expect(sql).toContain("'certifiable', check_count = 8 and passed_count = 8");
    expect(sql).toContain(
      "grant execute on function public.bvrb3r_pr23_retired_model_snapshot()"
    );
    expect(sql).toContain("to service_role");
  });
});
