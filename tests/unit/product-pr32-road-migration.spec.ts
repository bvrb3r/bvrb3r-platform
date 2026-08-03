import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260803073200_product_pr32_road_progression.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("Product PR32 Road migration", () => {
  it("creates server-truth Road tables with RLS and immutable evidence", () => {
    expect(sql).toContain("create table if not exists public.road_progress");
    expect(sql).toContain("create table if not exists public.badges");
    expect(sql).toContain("create table if not exists public.referrals");
    expect(sql).toContain("alter table public.road_progress force row level security");
    expect(sql).toContain("before update or delete on public.road_progress");
    expect(sql).toContain("earned badges cannot be deleted");
    expect(sql).toContain("a badge can be shared only once");
  });

  it("accepts achievement completion only through non-UI platform event evidence", () => {
    expect(sql).toContain("public.pr32_record_road_event");
    expect(sql).toContain("references public.platform_events(id) on delete restrict");
    expect(sql).toContain("if event_row.source = 'ui'");
    expect(sql).toContain("client-asserted road completion is prohibited");
    expect(sql).toContain("platform event evidence is not bound to this road account");
    expect(sql).toContain("event_row.related_ids ->> 'road_user_id'");
    expect(sql).toContain("previous_set_incomplete");
    expect(sql).toContain("grant execute on function public.pr32_record_road_event(uuid, text, uuid)\n  to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("counts referrals only from a SET 1 badge and never touches barber money", () => {
    expect(sql).toMatch(/badge_earned and set_rule\.set_index = 1[\s\S]*set counted_at = completion_time/);
    expect(sql).toContain("referrals_referred_user_uidx");
    expect(sql).toContain("on conflict (referred_user_id) where referred_user_id is not null");
    expect(sql).toContain("platformFundedReward");
    expect(sql).not.toMatch(/update\s+public\.(payments|payouts|booth_rent_ledgers)/i);
  });

  it("enforces mutual-follow leaderboard privacy with opt-in defaults off", () => {
    expect(sql).toContain("leaderboard_visible boolean not null default false");
    expect(sql).toContain("leaderboard_pushes_enabled boolean not null default false");
    expect(sql).toContain("join public.user_engagement_edges e2");
    expect(sql).toContain("e2.actor_profile_id = e1.target_profile_id");
    expect(sql).toContain("e2.target_profile_id = p_viewer_user_id");
    expect(sql).toContain("and prefs.leaderboard_visible");
    expect(sql).toContain("join public.road_set_rules rules on rules.role = p_role");
    expect(sql).toMatch(/road preferences self insert[\s\S]*p\.role::text = public\.road_preferences\.role/);
  });

  it("enforces shield, push-cap, and quiet-hour rules on the server", () => {
    expect(sql).toContain("available_count >= 3");
    expect(sql).toMatch(/pr32_award_streak_shield[\s\S]*from public\.profiles p[\s\S]*for update/);
    expect(sql).toMatch(/pr32_queue_milestone_push[\s\S]*from public\.profiles p[\s\S]*for update/);
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("spent_for_window = p_window_start");
    expect(sql).toContain("daily_count >= 2");
    expect(sql).toContain("leaderboard_pushes_off_by_default");
    expect(sql).toContain("time '21:00'");
    expect(sql).toContain("time '09:00'");
    expect(sql).toContain("pg_catalog.pg_timezone_names");
    expect(sql).toContain("pr32_validate_road_timezone");
  });

  it("mints one explicit, moderation-pending Culture post per earned badge", () => {
    expect(sql).toContain("public.pr32_share_badge_to_culture");
    expect(sql).toContain("'road_badge'");
    expect(sql).toContain("'pending'");
    expect(sql).toContain("if badge_row.shared_at is not null");
  });
});
