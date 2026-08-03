import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260729170000_product_pr26_rent_operations_monitors.sql"
);
const pr22Path = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260728123000_pr22_booth_rent_contract.sql"
);
const sql = readFileSync(migrationPath, "utf8");
const pr22 = readFileSync(pr22Path, "utf8");
const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const flat = executable.replace(/\s+/g, " ").toLowerCase().trim();

describe("Product PR26 rent operations migration", () => {
  it("is forward-only and transactional", () => {
    expect(flat.startsWith("begin;")).toBe(true);
    expect(flat.endsWith("commit;")).toBe(true);
  });

  it.each([
    "rent_autopay_preferences",
    "rent_payment_requests",
    "rent_line_disputes",
    "rent_lifecycle_requests"
  ])("protects %s with RLS and server-owned writes", (table) => {
    expect(flat).toContain(`alter table public.${table} enable row level security`);
    expect(flat).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    expect(flat).toContain(`grant all on table public.${table} to service_role`);
    expect(flat).not.toMatch(new RegExp(
      `grant (?:insert|update|delete|all) on table public\\.${table} to authenticated`
    ));
  });

  it("keeps a changed agreement out of the current rent period", () => {
    expect(flat).toContain(
      "create or replace function rent_private.pr26_create_rent_agreement_version"
    );
    expect(flat).toContain("current_date between o.period_start and o.period_end");
    expect(flat).toContain("p_effective_at < (active_period_end + 1)::timestamptz");
    expect(flat).toContain("a rent change cannot take effect during a rent period already in progress");
  });

  it("creates truthful idempotent payment requests and requires cash transfer evidence", () => {
    expect(flat).toContain("idempotency_key text not null unique");
    expect(flat).toContain("for update");
    expect(flat).toContain("applied_value := least(request_row.applied_cents, remaining_cents)");
    expect(flat).toContain("cash remains pending until a transfer reference is recorded");
    expect(flat).toContain("settled_contribution_id");
    expect(flat).not.toContain("payment_rail = 'cash' then 'settled'");
  });

  it("holds only one disputed contribution line and audits either resolution", () => {
    expect(flat).toContain("contribution_id uuid not null unique");
    expect(flat).toContain("greatest(amount_settled_cents - contribution_row.applied_cents, 0)");
    expect(flat).toContain("'rent_line_disputed'");
    expect(flat).toContain("'rent_dispute_released'");
    expect(flat).toContain("'rent_dispute_reversed'");
    expect(flat).toContain("reapplied_cents + returned_cents = held_cents");
    expect(flat).not.toMatch(/delete from public\.rent_(?:contributions|line_disputes)/);
  });

  it("enforces settle-first against canonical obligations, pending money, and holds", () => {
    expect(flat).toContain("create trigger pr26_settle_first_guard");
    expect(flat).toContain("create trigger pr26_chair_settle_first_guard");
    expect(flat).toContain("from public.rent_obligations o");
    expect(flat).toContain("from public.rent_payment_requests p");
    expect(flat).toContain("from public.rent_line_disputes d");
    expect(flat).toContain("sum(greatest( o.base_rent_cents + o.late_fee_cents - o.amount_settled_cents");
    expect(flat).toContain("sum(greatest(c.amount_cents - c.amount_paid_cents, 0))");
    expect(flat).toContain("rent must settle to $0.00 before this relationship can pause, leave, or end");
    expect(flat).toContain("rent must settle to $0.00 before retiring this assigned chair");
  });

  it("preserves PR22 refund symmetry and concurrent stop-at-zero", () => {
    expect(pr22).toContain("for update");
    expect(pr22).toContain("applied_value := least(requested_value, outstanding_cents)");
    expect(pr22).toContain("reversal_of_contribution_id");
    expect(pr22).toContain("amount_settled_cents = greatest(amount_settled_cents - original_row.applied_cents, 0)");
  });

  it("uses empty search paths and narrow function grants", () => {
    const definerFunctions = executable.match(
      /create or replace function (?:private|rent_private)\.pr26_[\s\S]*?\$\$;/gi
    ) ?? [];
    expect(definerFunctions.length).toBeGreaterThanOrEqual(7);
    for (const definition of definerFunctions) {
      expect(definition.toLowerCase()).toContain("set search_path = ''");
    }
    expect(flat).not.toContain("auth.role()");
    expect(flat).toContain(
      "grant execute on function private.pr26_settle_rent_payment(uuid, text, text, text) to service_role"
    );
    expect(flat).toContain(
      "grant execute on function private.pr26_resolve_rent_line_dispute(uuid, text, text, text) to service_role"
    );
    expect(flat).toContain("grant usage on schema rent_private to authenticated");
    expect(flat).not.toContain("grant usage on schema private");
    expect(flat).not.toContain(
      "grant execute on function private.pr26_request_rent_payment"
    );
  });
});
