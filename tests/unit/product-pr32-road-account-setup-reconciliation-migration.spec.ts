import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260814023406_road_account_setup_reconciliation.sql"
);
const migration = readFileSync(migrationPath, "utf8");

function between(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

const setupTruth = between(
  "CREATE OR REPLACE FUNCTION private.pr32_road_setup_checks",
  "CREATE OR REPLACE FUNCTION private.pr32_replay_road_events_locked"
);
const payoutTruth = between(
  "CREATE OR REPLACE FUNCTION private.pr32_payout_truth",
  "CREATE OR REPLACE FUNCTION private.pr32_road_setup_checks"
);
const replayTruth = between(
  "CREATE OR REPLACE FUNCTION private.pr32_replay_road_events_locked",
  "CREATE OR REPLACE FUNCTION private.pr32_lock_road_event_evidence"
);
const claimTruth = between(
  "CREATE OR REPLACE FUNCTION public.pr32_claim_matching_clientbridge_history",
  "CREATE OR REPLACE FUNCTION public.pr32_reconcile_road_setup"
);

const expectedSetupKeys = [
  "client.account_created",
  "client.contact_verified",
  "client.username_claimed",
  "client.guest_visits_claimed",
  "client.profile_completed",
  "client.payment_method_saved",
  "barber.account_created",
  "barber.username_claimed",
  "barber.contact_verified",
  "barber.license_verified",
  "barber.payout_connected",
  "barber.menu_built",
  "barber.availability_published",
  "barber.profile_published",
  "owner.account_created",
  "owner.contact_verified",
  "owner.shop_identity_completed",
  "owner.shop_hours_set",
  "owner.business_verified",
  "owner.stripe_connected",
  "owner.policies_published",
  "owner.shop_profile_published"
] as const;

describe("PR32 Road account-setup reconciliation migration", () => {
  it("certifies the 71-key catalog, all 22 setup checks, and exact Owner SET 0", () => {
    const emittedKeys = Array.from(
      setupTruth.matchAll(/achievement_key := '([^']+)'/g),
      (match) => match[1]
    );

    expect(emittedKeys).toEqual(expectedSetupKeys);
    expect(new Set(emittedKeys).size).toBe(22);
    expect(migration).toContain("catalog_count <> 71");
    expect(migration).toContain("setup_count <> 22");
    expect(migration).toMatch(/array\[\s*'owner\.account_created',\s*'owner\.contact_verified',\s*'owner\.shop_identity_completed',\s*'owner\.shop_hours_set'\s*\]::text\[\]/);
  });

  it("requires auth-backed canonical role rows, both contact factors, and registry agreement", () => {
    const contactTruth = between(
      "CREATE OR REPLACE FUNCTION private.pr32_contact_truth",
      "CREATE OR REPLACE FUNCTION private.pr32_valid_owner_hours"
    );

    expect(contactTruth).toContain("auth_user.email_confirmed_at is not null");
    expect(contactTruth).toContain("nullif(btrim(auth_user.email), '') is not null");
    expect(contactTruth).toContain("auth_user.phone_confirmed_at is not null");
    expect(contactTruth).toContain("profile.phone_verified_at is not null");
    expect(setupTruth.match(/achievement_key := '[^']+\.contact_verified'/g)).toHaveLength(3);
    expect(setupTruth).toMatch(/from public\.clients client[\s\S]*client\.profile_id = p_user_id/);
    expect(setupTruth).toMatch(/from public\.barbers barber[\s\S]*barber\.profile_id = p_user_id/);
    expect(setupTruth).toMatch(/from public\.shops shop[\s\S]*shop\.owner_profile_id = p_user_id/);
    expect(setupTruth).toContain("username.username = lower(btrim(profile_row.public_username))");
    expect(setupTruth).toContain("username.username = lower(btrim(barber_profile_row.username))");
    expect(setupTruth).toContain("username.username = lower(btrim(shop_row.public_username))");
  });

  it("uses current ClientBridge, onboarding, photo, and provider payment truth without self-attestation", () => {
    expect(migration).not.toContain("setup_evidence");
    expect(migration).not.toContain("shop_setup_gates");
    expect(setupTruth).toContain("invitation.expires_at > pg_catalog.now()");
    expect(setupTruth).toContain("invitation.claimed_profile_id is null");
    expect(setupTruth).toContain("onboarding.completed_steps @> '[\"client_profile\",\"client_preferences\"]'::jsonb");
    expect(setupTruth).toContain("finish_client_onboarding_profile_and_preferences");
    expect(setupTruth).toContain("add_client_profile_photo");
    expect(setupTruth).toContain("repair_client_profile_projection");
    expect(setupTruth).toContain("validated_client_onboarding_and_photo_complete");
    expect(setupTruth).toContain("method.provider in ('stripe', 'square')");
    expect(setupTruth).toContain("method.provider_payment_method_id");
    expect(setupTruth).toContain("method.exp_month >= extract(month from current_date)::integer");
    expect(setupTruth).not.toMatch(/method\.provider\s+in\s*\([^)]*(manual|mock)/);
  });

  it("requires a live bound connected account and component-scoped payout readiness", () => {
    for (const predicate of [
      "binding.binding_status = 'active'",
      "account.provider = 'stripe_connect'",
      "account.provider_environment = 'live'",
      "account.onboarding_status = 'verified'",
      "account.payout_readiness_status = 'ready'",
      "account.legal_readiness_status = 'accepted'",
      "account.tax_readiness_status = 'verified'",
      "account.charges_enabled",
      "account.payouts_enabled",
      "account.requirements_currently_due = '[]'::jsonb",
      "account.requirements_past_due = '[]'::jsonb",
      "verification.can_receive_payouts"
    ]) {
      expect(payoutTruth).toContain(predicate);
    }
    expect(payoutTruth).not.toContain("verification.overall_status");
    expect(payoutTruth).not.toContain("verification.public_verified");
    expect(setupTruth).toContain("stored_live_stripe_payout_destination_ready");
    expect(setupTruth).toContain("stored_live_shop_stripe_destination_ready");
  });

  it("scopes license and business completion and pending review to matching underlying evidence", () => {
    const licenseTruth = setupTruth.slice(
      setupTruth.indexOf("achievement_key := 'barber.contact_verified'"),
      setupTruth.indexOf("achievement_key := 'barber.license_verified'")
    );
    const licensePendingTruth = licenseTruth.slice(
      licenseTruth.indexOf("join public.barber_verifications license"),
      licenseTruth.indexOf("select max(greatest")
    );
    const businessTruth = setupTruth.slice(
      setupTruth.indexOf("achievement_key := 'owner.shop_hours_set'"),
      setupTruth.indexOf("achievement_key := 'owner.business_verified'")
    );
    const businessPendingTruth = businessTruth.slice(
      businessTruth.indexOf("join public.shop_verifications business"),
      businessTruth.indexOf("select max(greatest")
    );

    expect(setupTruth.match(/license\.category = 'license_verification'/g)).toHaveLength(3);
    expect(setupTruth.match(/license\.expiration_date >= current_date/g)).toHaveLength(2);
    expect(licensePendingTruth).toContain("license.user_id = p_user_id");
    expect(licensePendingTruth).toContain("license.barber_reference in (");
    expect(licensePendingTruth).toContain("'pending', 'in_progress', 'submitted', 'under_review'");
    expect(licensePendingTruth).not.toContain("verification.license_status");
    expect(licenseTruth).not.toContain("verification.overall_status");
    expect(licenseTruth).not.toContain("verification.public_verified");
    expect(businessTruth.match(/business\.category in \('business_verification', 'ownership_verification'\)/g)).toHaveLength(3);
    expect(businessPendingTruth).toContain("business.user_id = p_user_id");
    expect(businessPendingTruth).toContain("business.shop_reference = shop_row.id");
    expect(businessPendingTruth).toContain("'pending', 'in_progress', 'submitted', 'under_review'");
    expect(businessPendingTruth).not.toContain("verification.business_status");
    expect(businessTruth).not.toContain("verification.overall_status");
    expect(businessTruth).not.toContain("verification.public_verified");
    expect(businessTruth).not.toContain("verification.can_create_shop_listing");
  });

  it("validates service menus, both availability branches, strict hours, and real policies", () => {
    expect(setupTruth).toMatch(/service\.active[\s\S]*service\.is_bookable[\s\S]*service\.duration_min > 0[\s\S]*service\.price > 0/);
    expect(setupTruth).toContain("supporting_count >= 3");
    expect(setupTruth).toContain("membership.routing_model = 'freelance'");
    expect(setupTruth).toMatch(/membership\.relationship_status is null[\s\S]*membership\.relationship_status = 'active'/);
    expect(setupTruth).toContain("membership.shop_id is null");
    expect(setupTruth).toContain("relationship.approved_by_owner_at is not null");
    expect(setupTruth).toContain("relationship.approved_by_barber_at is not null");
    expect(migration).toContain("p_hours @> '{\"version\":1,\"source\":\"owner_settings\"}'::jsonb");
    expect(setupTruth).toContain("private.pr32_valid_owner_hours(shop_row.public_hours)");
    expect(setupTruth).toContain("private.pr32_valid_owner_hours(location_row.hours)");
    expect(setupTruth).toContain("shop_row.public_hours = location_row.hours");
    expect(setupTruth).toContain("length(btrim(coalesce(shop_row.policies, ''))) >= 20");
  });

  it("requires canonical marketplace eligibility before publishing role profiles", () => {
    for (const predicate of [
      "barber_row.app_approval_status::text = 'approved'",
      "barber_row.shop_approval_status::text in ('not_required', 'approved')",
      "barber_row.status = 'active'",
      "barber_row.is_bookable",
      "barber_row.is_discoverable",
      "profile_row.onboarding_state::text = 'active'",
      "visibility.visibility_state::text in ('public', 'featured')",
      "visibility.accepts_instant_bookings",
      "barber_status.accepting_bookings",
      "service.duration_min >= 15",
      "barber_availability_complete"
    ]) {
      expect(setupTruth).toContain(predicate);
    }
    expect(setupTruth).toMatch(/from public\.barber_setup_activations activation[\s\S]*activation\.status = 'live'/);
    expect(setupTruth).toContain("shop_row.app_approval_status::text in ('pending', 'under_review')");
    expect(setupTruth).toContain("location_row.geo_point is not null");
  });

  it("provides an idempotent, verified-contact, service-only ClientBridge merge contract", () => {
    expect(claimTruth).toContain("confirmed email and confirmed phone are required before claiming history");
    expect(claimTruth).toContain("invitation.expires_at <= pg_catalog.now()");
    expect(claimTruth).toContain("invitation.expires_at > pg_catalog.now()");
    expect(claimTruth).toContain("'status', 'already_resolved'");
    expect(claimTruth).toContain("matching guest history has conflicting live queue entries");
    expect(claimTruth).toContain("update public.appointments appointment");
    expect(claimTruth).toContain("update public.waitlist_entries queue_entry");
    expect(claimTruth).toContain("update public.chairsync_appointments chairsync");
    expect(claimTruth).toContain("update public.clientbridge_consent_events consent");
    expect(claimTruth).toContain("status = 'claimed'");
    expect(migration).toContain("revoke all on function public.pr32_claim_matching_clientbridge_history(uuid) from public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.pr32_claim_matching_clientbridge_history(uuid) to service_role");
  });

  it("locks sequential replay, preserves evidence immutability, and exposes only service RPCs", () => {
    expect(migration).toContain("Setup producer routes do not yet invoke reconciliation after their writes.");
    expect(replayTruth).toContain("first_incomplete_setup_set");
    expect(replayTruth).toContain("setup_check.status <> 'complete'");
    expect(replayTruth).toContain("set_rule.set_index > first_incomplete_setup_set");
    expect(replayTruth).toContain("set_rule.set_index = first_incomplete_setup_set");
    expect(replayTruth).toContain("Events for the incomplete setup set remain stored/progressed");
    expect(migration).toContain("road:setup-truth:v1:");
    expect(migration).toContain("pr32_lock_road_event_evidence");
    expect(migration).toContain("before update or delete on public.platform_events");
    expect(migration).toMatch(/revoke all on function public\.pr32_get_road_setup_checks\(uuid,text\) from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.pr32_get_road_setup_checks\(uuid,text\) to service_role;/);
    expect(migration).toMatch(/revoke all on function public\.pr32_reconcile_road_setup\(uuid,text\) from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.pr32_reconcile_road_setup\(uuid,text\) to service_role;/);
    expect(migration).toMatch(/revoke all on function public\.pr32_record_road_event\(uuid,text,uuid\) from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.pr32_record_road_event\(uuid,text,uuid\) to service_role;/);
  });
});
