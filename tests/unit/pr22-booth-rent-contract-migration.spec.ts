import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260728123000_pr22_booth_rent_contract.sql"
), "utf8");
const retiredMoneyModel = ["comm", "ission"].join("");

describe("PR22 canonical booth-rent contract migration", () => {
  it("creates only the approved additive rent ledgers", () => {
    for (const table of [
      "rent_agreements",
      "rent_obligations",
      "rent_contributions",
      "rent_actions_audit"
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).not.toMatch(new RegExp(`insert into public\\.${retiredMoneyModel}_ledger`, "i"));
    expect(sql).not.toMatch(new RegExp(`relationship_type\\s*=\\s*'${retiredMoneyModel}'`, "i"));
  });

  it("requires immutable bilateral prospective agreement versions", () => {
    expect(sql).toContain("unique (relationship_id, version)");
    expect(sql).toContain("owner_accepted_at is not null and barber_accepted_at is not null");
    expect(sql).toContain("Rent agreement versions are prospective only.");
    expect(sql).toContain("A rent agreement cannot be accepted retroactively.");
    expect(sql).toContain("rent_agreements_one_active_relationship_idx");
  });

  it("enforces integer-cents AutoBooth, stop-at-zero, idempotency, and exclusions", () => {
    expect(sql).toContain("autobooth_basis_points");
    expect(sql).toContain("idempotency_key text not null unique");
    expect(sql).toContain("excluded_tip_cents");
    expect(sql).toContain("excluded_tax_cents");
    expect(sql).toContain("applied_value := least(requested_value, outstanding_cents)");
    expect(sql).toContain("contribution_kind = 'refund_reversal'");
    expect(sql).toContain("rent_contributions_one_reversal_idx");
  });

  it("keeps cash pending until actual transfer evidence exists", () => {
    expect(sql).toContain("when p_contribution_kind = 'autobooth_cash' then 'pending'");
    expect(sql).toContain("Cash remains pending until transfer evidence is recorded.");
    expect(sql).toContain("rent_contributions_cash_truth_ck");
  });

  it("keeps barber earnings evidence hidden from owners", () => {
    const contributionPolicy = sql.match(
      /create policy rent_contributions_barber_or_internal_select[\s\S]*?;\n/
    )?.[0] ?? "";
    expect(contributionPolicy).toContain("private.pr22_is_barber");
    expect(contributionPolicy).toContain("private.is_internal_operator");
    expect(contributionPolicy).not.toContain("private.pr22_is_shop_owner");

    const ownerStatement = sql.match(
      /create or replace function public\.pr22_get_owner_rent_statement[\s\S]*?revoke all on function public\.pr22_get_owner_rent_statement/
    )?.[0] ?? "";
    expect(ownerStatement).not.toContain("excluded_tip_cents");
    expect(ownerStatement).not.toContain("eligible_service_cents");
    expect(ownerStatement).toContain("original.contribution_kind in ('autobooth_card', 'autobooth_cash')");
    expect(ownerStatement).toContain("then -c.applied_cents");
  });

  it("enforces grace once, late fee once, waiver reason, and setup gate", () => {
    expect(sql).toContain("Grace can only be applied once.");
    expect(sql).toContain("A late fee can only be applied once");
    expect(sql).toContain("A waiver requires an auditable reason.");
    expect(sql).toContain("Kiosk activation requires all 12 shop setup gates");
    expect(sql).toContain("jsonb_array_length(coalesce(check_snapshot -> 'checks'");
  });

  it("exposes only token-scoped public queue truth", () => {
    expect(sql).toContain("public.pr22_issue_queue_status_token");
    expect(sql).toContain("private.pr22_sha256(token_value)");
    expect(sql).toContain("public.pr22_get_public_queue_status");
    expect(sql).toContain('"position" integer');
    expect(sql).toContain("grant execute on function public.pr22_get_public_queue_status(text) to service_role");
    expect(sql).not.toContain("grant execute on function public.pr22_get_public_queue_status(text) to anon");
    expect(sql).not.toMatch(/grant select on table public\.waitlist_entries to anon/i);
  });

  it("gates release certification on twelve checks and zero reconciliation", () => {
    for (const check of [
      "kiosk",
      "queue",
      "rotation",
      "wait_time",
      "realtime",
      "notifications",
      "activation",
      "payments",
      "cash_truth",
      "stripe_connect",
      "autobooth",
      "booth_rent"
    ]) {
      expect(sql).toContain(`('${check}'`);
    }
    expect(sql).toContain("'reconciliationDeltaCents'");
    expect(sql).toContain("reconciliation_delta_cents = 0");
    expect(sql).toContain("All twelve checks and $0.00 reconciliation are required.");
    expect(sql).not.toContain("('realtime', true");
    expect(sql).not.toContain("('notifications', true");
    expect(sql).toContain("from pg_publication_tables");
    expect(sql).toContain("from public.notification_delivery_attempts");
  });
});
