import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyStripeConnectWebhookEvent } from "@/lib/fintech/service";

const ACCOUNT_EVENTS = [
  "account.updated",
  "capability.updated",
  "person.created",
  "person.updated",
  "person.deleted",
  "account.external_account.created",
  "account.external_account.updated",
  "account.external_account.deleted"
];

const PAYOUT_EVENTS = [
  "payout.created",
  "payout.updated",
  "payout.paid",
  "payout.failed",
  "payout.canceled"
];

describe("Stripe Connect webhook event contract", () => {
  it.each(ACCOUNT_EVENTS)("routes %s through the connected-account readiness handler", (eventType) => {
    expect(classifyStripeConnectWebhookEvent(eventType)).toBe("account_state");
  });

  it.each(PAYOUT_EVENTS)("routes %s through the bank-payout lifecycle handler", (eventType) => {
    expect(classifyStripeConnectWebhookEvent(eventType)).toBe("bank_payout");
  });

  it("audits unselected Connect events without routing them into a money handler", () => {
    expect(classifyStripeConnectWebhookEvent("balance.available")).toBe("unsupported");
  });

  it("stores connected bank payouts separately from platform Transfer executions", () => {
    const migration = readFileSync(
      "supabase/migrations/20260812162720_stripe_webhook_destination_isolation.sql",
      "utf8"
    );

    expect(migration).toContain("create table if not exists public.connected_account_payouts");
    expect(migration).toContain("unique (connected_account_id, provider_payout_id)");
    expect(migration).toContain("alter table public.connected_account_payouts enable row level security");
    expect(migration).toContain("revoke all on table public.connected_account_payouts from anon, authenticated");
    expect(migration).toContain("protect_connected_account_provider_payout_fields");
    expect(migration).toContain("connected-account provider and readiness fields are server-managed");
    expect(migration).toContain("an active provider payout block requires blocked payout readiness");
    expect(migration).toContain("current_user::text in ('anon', 'authenticated')");
    expect(migration).toContain("preserve_connected_account_payout_event_order");
    expect(migration).toContain("apply_connected_account_payout_block");
    expect(migration).toContain("clear_connected_account_payout_block");
    expect(migration).toContain("and (case old.payout_status");
    expect(migration).toContain("end) > (case new.payout_status");
    expect(migration).toContain("new.paid_at := coalesce(new.paid_at, old.paid_at)");
    expect(migration).toContain("grant select, insert, update on table public.stripe_webhook_events");
    expect(migration).toContain("grant select, insert, update on table public.connected_accounts");
    expect(migration).not.toContain("references public.payout_executions");
  });
});
