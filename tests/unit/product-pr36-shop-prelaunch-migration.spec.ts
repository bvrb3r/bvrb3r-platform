import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260803073224_product_pr36_shop_prelaunch.sql"
), "utf8");

describe("Product PR36 shop prelaunch migration", () => {
  it("stores real prelaunch, waitlist, and immutable launch-event state", () => {
    expect(sql).toContain("create table if not exists public.shop_prelaunches");
    expect(sql).toContain("create table if not exists public.shop_prelaunch_waitlist");
    expect(sql).toContain("create table if not exists public.shop_prelaunch_events");
    expect(sql).toContain("constraint shop_prelaunch_waitlist_position_uidx unique (shop_id, position)");
    expect(sql).toContain("shop_prelaunch_events_immutable");
  });

  it("supports explicit consent withdrawal while preserving non-PII join order", () => {
    const withdrawalSql = sql.slice(
      sql.indexOf("create or replace function public.pr36_withdraw_prelaunch_waitlist"),
      sql.indexOf("revoke all on function public.pr36_withdraw_prelaunch_waitlist")
    );
    const deletionWithdrawalSql = sql.slice(
      sql.indexOf("create or replace function private.pr36_withdraw_deleted_account_waitlists"),
      sql.indexOf("revoke all on function private.pr36_withdraw_deleted_account_waitlists")
    );
    expect(sql).toContain("p_consent is distinct from true");
    expect(sql).toContain("status in ('active', 'notified', 'converted', 'withdrawn')");
    expect(sql).toContain("create or replace function public.pr36_withdraw_prelaunch_waitlist");
    expect(sql).toContain("opening_notification_consent = false");
    expect(sql).toContain("contact_anonymized_at = timezone('utc', now())");
    expect(sql).toContain("set profile_id = null,\n        email = null,\n        phone = null");
    expect(sql).toContain("PR36 withdrawn waitlist history is immutable");
    expect(sql).toContain("'waitlistCount', v_count");
    expect(withdrawalSql.match(/'waitlistCount', v_count/g)).toHaveLength(2);
    expect(withdrawalSql).toContain("'waitlist_withdrawn',\n    null,");
    expect(sql).toContain("private.pr36_withdraw_deleted_account_waitlists");
    expect(sql).toContain("order by entry.shop_id, entry.position, entry.id");
    expect(sql).toContain("'source', 'account_deletion'");
    expect(deletionWithdrawalSql).toContain("on conflict (shop_id, event_type, idempotency_key) do nothing");
    expect(deletionWithdrawalSql).toContain("profile_id = null");
    expect(deletionWithdrawalSql).toContain("email = null");
    expect(deletionWithdrawalSql).toContain("phone = null");
    expect(deletionWithdrawalSql).not.toContain("position =");
  });

  it("keeps direct reads owner/self scoped and mutations server-owned", () => {
    expect(sql).toContain("alter table public.shop_prelaunches force row level security");
    expect(sql).toContain("alter table public.shop_prelaunch_waitlist force row level security");
    expect(sql).toContain("shop.owner_profile_id = (select auth.uid())");
    expect(sql).toContain("using (profile_id = (select auth.uid()))");
    expect(sql).toContain("grant execute on function public.pr36_go_live_shop(text, uuid, integer, text)");
    expect(sql).toContain("to service_role");
  });

  it("recomputes all six readiness families on the server before launch", () => {
    expect(sql).toContain("private.pr36_shop_launch_readiness(p_shop_id)");
    expect(sql).toContain("v_identity and v_stripe and v_policies and v_hours and v_team and v_kiosk");
    expect(sql).toContain("All six PR36 launch checks must be green");
    expect(sql).toContain("v_founding_chairs >= v_config.chair_capacity");
  });

  it("serializes first configuration and rejects NULL optimistic versions", () => {
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("'bvrb3r.pr36.prelaunch:' || p_shop_id");
    expect(sql).toContain("p_expected_version is null or p_expected_version < 0");
    expect(sql).toContain("p_expected_version is null or p_expected_version < 1");
  });

  it("enforces the 24-hour waitlist booking window from stored join order", () => {
    expect(sql).toContain("v_config.opening_at - interval '24 hours'");
    expect(sql).toContain("create or replace function public.pr36_shop_booking_access");
    expect(sql).toContain("return 'waitlist_only'");
    expect(sql).toContain("order by entry.position");
    expect(sql).toContain("before insert on public.booking_slot_holds");
    expect(sql).toContain("before insert on public.appointments");
  });

  it("blocks payment authorization and capture before the stored opening time", () => {
    expect(sql).toContain("create or replace function private.pr36_preopening_payment_guard()");
    expect(sql).toContain("before insert or update on public.payments");
    expect(sql).toContain("No payment may be authorized or captured before the PR36 shop opening");
    expect(sql).toContain("timezone('utc', now()) < launch.opening_at");
    expect(sql).toContain("Refund states are corrective and must remain writable");
    expect(sql).not.toContain("in ('authorized', 'captured', 'partially_refunded')");
  });

  it("also blocks shop-scoped gift funding and gift redemption before opening", () => {
    expect(sql).toContain("private.pr36_prelaunch_gift_purchase_guard");
    expect(sql).toContain("before insert or update on public.gift_card_purchase_attempts");
    expect(sql).toContain("No shop-scoped gift-card payment may start before the PR36 shop opening");
    expect(sql).toContain("private.pr36_prelaunch_gift_redemption_guard");
    expect(sql).toContain("before insert on public.gift_card_applications");
    expect(sql).toContain("No gift-card value may be applied before the PR36 shop opening");
  });
});
