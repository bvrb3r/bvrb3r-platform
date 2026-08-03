import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260803073210_converge_pr34_billing_balance_lock.sql"
);
const sql = readFileSync(migrationPath, "utf8");

describe("Product PR34 forward-only migration", () => {
  it("creates itemized balance, append-only event, and Stripe payment-attempt truth", () => {
    expect(sql).toContain("create table if not exists public.billing_balance_lines");
    expect(sql).toContain("create table if not exists public.billing_balance_events");
    expect(sql).toContain("create table if not exists public.billing_payment_attempts");
    expect(sql).toContain("source_type in ('subscription', 'refund_correction', 'dispute_reversal', 'no_show_fee')");
    expect(sql).toContain("provider = 'stripe'");
  });

  it("forces RLS and leaves balance tables server-owned", () => {
    expect(sql).toContain("alter table public.billing_balance_lines force row level security");
    expect(sql).toContain("alter table public.billing_balance_events force row level security");
    expect(sql).toContain("alter table public.billing_payment_attempts force row level security");
    expect(sql).toContain("revoke all on table public.billing_balance_lines from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update on table public.billing_balance_lines to service_role");
  });

  it("makes history append-only and prevents deletion of balance evidence", () => {
    expect(sql).toContain("billing_balance_events_immutable");
    expect(sql).toContain("before update or delete on public.billing_balance_events");
    expect(sql).toContain("billing_balance_lines_no_delete");
    expect(sql).toContain("billing_payment_attempts_no_delete");
    expect(sql).toContain("billing_balance_lines_guard");
    expect(sql).toContain("PR34 balance source evidence is immutable");
  });

  it("binds disputes to auth.uid and final settlement to service role only", () => {
    expect(sql).toContain("v_actor uuid := auth.uid()");
    expect(sql).toContain("and profile_id = v_actor");
    expect(sql).toContain("grant execute on function public.pr34_dispute_balance_line(uuid, text) to authenticated");
    expect(sql).toContain("revoke all on function public.pr34_finalize_balance_payment(uuid, text) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.pr34_finalize_balance_payment(uuid, text) to service_role");
  });

  it("permits only one active pay-in-full reservation and pauses disputes during it", () => {
    expect(sql).toContain("billing_payment_attempts_one_active_uidx");
    expect(sql).toContain("where status in ('initializing', 'requires_payment', 'processing')");
    expect(sql).toContain("p_line_id = any(attempt.line_ids)");
  });

  it("binds payment-attempt identity and Stripe evidence before terminal settlement", () => {
    expect(sql).toContain("create or replace function private.pr34_guard_payment_attempt_update()");
    expect(sql).toContain("PR34 payment reservation evidence is immutable");
    expect(sql).toContain("PR34 Stripe payment evidence is immutable after binding");
    expect(sql).toContain("Terminal PR34 payment attempts are immutable");
    expect(sql).toContain("billing_payment_attempts_guard");
    expect(sql).toContain("v_attempt.status not in ('requires_payment', 'processing')");
  });

  it("settles the exact reserved line set atomically without a percentage-pay execution path", () => {
    expect(sql).toContain("v_payable_count <> v_line_count");
    expect(sql).toContain("v_remaining_cents <> v_attempt.amount_cents");
    expect(sql).toContain("status = 'paid'");
    expect(sql).toContain("'balance_payment_succeeded'");
    expect(sql).toContain("Disputed balance line settled by verified Stripe payment");
    expect(sql).not.toMatch(/retained_revenue_share|compensation_rules/i);
  });
});
