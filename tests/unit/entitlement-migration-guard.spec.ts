import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260729043000_standard_plan_entitlement_truth.sql"
);

function migrationSql() {
  return readFileSync(migrationPath, "utf8");
}

describe("entitlement migration guard", () => {
  it("creates the server-owned account_entitlements truth whether the legacy candidate exists or not", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table if not exists public.account_entitlements");
    expect(sql).toContain("profile_id uuid not null references public.profiles(id)");
    expect(sql).toContain("account_role in ('client_user', 'barber_user', 'shop_owner_user')");
    expect(sql).toContain("tier text not null default 'standard'");
    expect(sql).not.toContain("'weekly'");
  });

  it("uses canonical tier and billing interval constraints", () => {
    const sql = migrationSql();

    expect(sql).toContain("tier in ('standard', 'pro', 'elite')");
    expect(sql).toContain("billing_interval in ('none', 'monthly', 'yearly')");
    expect(sql).toContain("(tier = 'standard' and billing_interval = 'none')");
    expect(sql).toContain("(tier in ('pro', 'elite') and billing_interval in ('monthly', 'yearly'))");
  });

  it("makes Standard non-billable and normalizes legacy free rows", () => {
    const sql = migrationSql();

    expect(sql).toContain("where tier = 'free'");
    expect(sql).toContain("where entitlement_status = 'free'");
    expect(sql).toContain("account_entitlements_standard_zero_check");
    expect(sql).toContain("stripe_subscription_id is null");
    expect(sql).toContain("stripe_price_id is null");
    expect(sql).toContain("Standard is $0 and is never billed");
  });

  it("enables RLS and does not expose raw entitlement rows to anon", () => {
    const sql = migrationSql();

    expect(sql).toContain("alter table public.account_entitlements enable row level security");
    expect(sql).toContain("revoke all on table public.account_entitlements from anon");
    expect(sql).not.toMatch(/grant\s+select\s+on\s+table\s+public\.account_entitlements\s+to\s+anon/i);
    expect(sql).not.toMatch(/to\s+anon/i);
  });

  it("does not create authenticated write policies", () => {
    const sql = migrationSql();

    expect(sql).toContain("No authenticated insert/update/delete policies are created");
    expect(sql).not.toMatch(/for\s+insert\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/for\s+update\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/for\s+delete\s+to\s+authenticated/i);
  });

  it("documents existing webhook idempotency as stripe_webhook_events", () => {
    const sql = migrationSql();

    expect(sql).toContain("Webhook idempotency remains anchored by public.stripe_webhook_events");
    expect(sql).toContain("last_stripe_event_id");
  });
});
