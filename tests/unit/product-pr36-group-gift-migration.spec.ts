import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260803073222_product_pr36_group_booking_gift_cards.sql"),
  "utf8"
);

describe("Product PR36 group and gift migration", () => {
  it("stores group, member, trusted payer, and honest kiosk state behind service role", () => {
    expect(migration).toContain("create table if not exists public.group_bookings");
    expect(migration).toContain("create table if not exists public.group_booking_members");
    expect(migration).toContain("create table if not exists public.group_booking_payment_intents");
    expect(migration).toContain("create table if not exists public.kiosk_group_requests");
    expect(migration).toContain("status in ('planned', 'link_queued', 'ready_at_checkout', 'paid'");
    expect(migration).toContain("revoke all on public.group_bookings");
  });

  it("confirms all group members through PR20 in a rollback-safe subtransaction", () => {
    expect(migration).toContain("create or replace function public.pr36_confirm_group_booking");
    expect(migration).toContain("v_result := public.pr20_confirm_booking");
    expect(migration).toContain("exception when others then");
    expect(migration).toContain("every appointment created inside this block rolls back");
    expect(migration).toContain("select distinct hold.barber_id");
    expect(migration).toContain("order by hold.barber_id");
    expect(migration).toContain("perform private.pr20_lock_barber_timeline(v_barber_id)");
    expect(migration).toContain("'client_user'");
  });

  it("syncs only the cancelled member and keeps the remaining group intact", () => {
    expect(migration).toContain("private.pr36_sync_cancelled_group_member");
    expect(migration).toContain("when v_active = 0 then 'cancelled' else 'partially_cancelled'");
  });

  it("binds activation to Stripe verification and stores no expiration column", () => {
    expect(migration).toContain("stripe_verified_at");
    expect(migration).toContain("stripe_payment_not_verified");
    expect(migration).not.toContain("add column if not exists expires_at");
  });

  it("converges the legacy gift table without retaining bearer secrets", () => {
    expect(migration).toContain("Legacy gift cards require explicit balance/code reconciliation before PR36");
    expect(migration).toContain("private.pr22_sha256(code)");
    expect(migration).toContain("set code = 'hash:' || code_hash");
    expect(migration).toContain("gift_cards_balance_projection_ck");
    expect(migration).toContain("gift_cards_scope_shape_ck");
    expect(migration).toContain("drop policy if exists \"gift cards admin select batch 34\"");
    expect(migration).toContain("alter table public.gift_cards force row level security");
  });

  it("makes tips mathematically unreachable and creates equal barber payout obligations", () => {
    expect(migration).toContain("tip_applied_cents integer not null default 0 check (tip_applied_cents = 0)");
    expect(migration).toContain("create table if not exists public.gift_card_payout_obligations");
    expect(migration).toContain("barberPayoutObligationCents");
    expect(migration).toContain("greatest(\n           coalesce(balance_due, 0) - (v_total::numeric / 100),\n           coalesce(tip_amount, 0)");
  });

  it("keeps gift money history append-only and reverses cancelled or refunded appointments", () => {
    expect(migration).toContain("create table if not exists public.gift_card_application_reversals");
    expect(migration).toContain("create table if not exists public.gift_card_payout_obligation_events");
    expect(migration).toContain("private.pr36_reject_gift_history_change");
    expect(migration).toContain("private.pr36_reverse_gift_card_application");
    expect(migration).toContain("new.status::text not in ('cancelled', 'refunded')");
    expect(migration).toContain("when v_obligation.status = 'paid' then 'needs_review'");
    expect(migration).toContain("length(idempotency_key) between 8 and 200");
    expect(migration).toContain("key_reused_for_another_appointment");
  });

  it("anonymizes deleted-account group and gift PII without deleting financial evidence", () => {
    const deletionSql = migration.slice(
      migration.indexOf("create or replace function private.pr36_anonymize_deleted_account_group_gift"),
      migration.indexOf("revoke all on function private.pr36_anonymize_deleted_account_group_gift")
    );
    expect(migration).toContain("private.pr36_anonymize_deleted_account_group_gift");
    expect(migration).toContain("order by booking.id\n  for update");
    expect(migration).toContain("order by purchase.id\n  for update");
    expect(migration).toContain("order by card.purchased_at, card.id\n  for update");
    expect(migration).toContain("organizer_profile_id = null");
    expect(migration).toContain("destination_masked = '[deleted]'");
    expect(migration).toContain("buyer_profile_id = null");
    expect(migration).toContain("'deleted-purchase-token:'");
    expect(migration).toContain("'deleted-claim-token:'");
    expect(migration).toContain("sender_name = '[deleted]'");
    expect(migration).toContain("recipient_name = '[deleted]'");
    expect(migration).toContain("then 'needs_review'");
    expect(migration).toContain("claimed_by_profile_id = null");
    expect(migration).toContain("claim_token_hash = null");
    expect(migration).toContain("when (new.status = 'deleted' and old.status is distinct from new.status)");
    expect(deletionSql).not.toContain("stripe_payment_intent_id =");
    expect(deletionSql).not.toContain("provider_message_id =");
    expect(deletionSql).not.toContain("balance_cents =");
    expect(deletionSql).not.toContain("appointment_id =");
    expect(deletionSql).not.toContain("application_id =");
    expect(deletionSql).not.toContain("delete from");
    expect(migration).not.toContain("delete from public.gift_card_ledger");
    expect(migration).not.toContain("delete from public.gift_card_applications");
    expect(migration).not.toContain("delete from public.gift_card_payout_obligations");
  });
});
