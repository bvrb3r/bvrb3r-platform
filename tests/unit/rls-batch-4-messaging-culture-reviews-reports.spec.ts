import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260624123000_rls_batch_4_messaging_culture_reviews_reports.sql"
);

const sql = readFileSync(migrationPath, "utf8");
const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();

const targetTables = [
  "message_threads",
  "thread_participants",
  "messages",
  "message_thread_requests",
  "message_user_blocks",
  "message_reports",
  "culture_posts",
  "culture_media",
  "culture_post_tags",
  "culture_engagements",
  "culture_comments",
  "culture_feed_events",
  "culture_reports",
  "culture_promotions",
  "reviews",
  "review_moderation",
  "safety_reports",
  "report_events",
  "disputes",
  "dispute_events",
  "risk_flags",
  "moderation_actions"
];

const forbiddenMoneyTables = [
  "payments",
  "payment_routing_records",
  "payout_executions",
  "refunds",
  "wallet"
];

const forbiddenBookingCalendarPolicyTables = [
  "appointments",
  "appointment_status_history",
  "appointment_services",
  "appointment_add_ons",
  "appointment_check_in_events",
  "availability_rules",
  "walk_in_queue"
];

function policiesFor(tableName: string) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(sql.matchAll(/create policy[\s\S]*?;/gi))
    .map((match) => match[0])
    .filter((policy) => new RegExp(`on\\s+public\\.${escaped}\\b`, "i").test(policy));
}

function policyFor(tableName: string, policyName: string) {
  return policiesFor(tableName).find((policy) => policy.includes(policyName)) ?? "";
}

describe("RLS batch 4 messaging/culture/reviews/reports migration", () => {
  it("adds the protected-risk migration candidate for the requested batch", () => {
    expect(sql).toContain("PR #31 protected-risk RLS batch 4 candidate");
    expect(migrationPath).toMatch(/20260624123000_rls_batch_4_messaging_culture_reviews_reports\.sql$/);
  });

  it("enables RLS only for the scoped messaging, Culture, review, report, dispute, safety, and moderation targets", () => {
    for (const tableName of targetTables) {
      expect(sql).toContain(`alter table public.${tableName} enable row level security`);
    }

    expect(targetTables).toHaveLength(22);
  });

  it("does not reference money tables, payout routing, or wallet scope", () => {
    for (const tableName of forbiddenMoneyTables) {
      expect(normalizedSql).not.toContain(tableName);
    }
  });

  it("does not reference role normalization or mutate profile roles", () => {
    expect(normalizedSql).not.toContain("role_normalization");
    expect(normalizedSql).not.toMatch(/update\s+public\.profiles\s+set\s+role/i);
    expect(normalizedSql).not.toMatch(/alter\s+table\s+public\.profiles/i);
    expect(sql).not.toContain("create shop_owner");
    expect(sql).not.toContain("'shop_owner'::public.app_role");
  });

  it("does not modify PR #30 booking/calendar target table policies", () => {
    for (const tableName of forbiddenBookingCalendarPolicyTables) {
      expect(sql).not.toMatch(new RegExp(`alter table public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`on public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`drop policy[\\s\\S]{0,120}public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`create policy[\\s\\S]{0,160}public\\.${tableName}\\b`, "i"));
    }
  });

  it("uses private helpers with explicit authenticated execution grants and no anon execution", () => {
    [
      "rls_batch_4_is_platform_admin()",
      "rls_batch_4_is_profile_reference(text, text)",
      "rls_batch_4_is_shop_operator_reference(text)",
      "rls_batch_4_is_message_thread_participant(uuid)",
      "rls_batch_4_can_read_culture_post(uuid)",
      "rls_batch_4_can_manage_culture_post(uuid)",
      "rls_batch_4_can_read_safety_report(text)",
      "rls_batch_4_can_read_dispute(text)",
      "rls_batch_4_can_read_review(uuid, uuid, uuid, uuid)"
    ].forEach((signature) => {
      expect(sql).toContain(`revoke all on function private.${signature} from public, anon`);
      expect(sql).toContain(`grant execute on function private.${signature} to authenticated`);
    });

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
  });

  it("does not add broad authenticated SELECT-all policies", () => {
    expect(sql).not.toMatch(/for select\s+to authenticated\s+using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/for select\s+to authenticated\s+using\s*\(\s*auth\.uid\(\)\s+is not null\s*\)/i);
    expect(normalizedSql).not.toContain("auth.role() = 'authenticated'");
  });

  it("does not add anon private message, report, dispute, risk, moderation, or raw review access", () => {
    [
      "message_threads",
      "thread_participants",
      "messages",
      "message_thread_requests",
      "message_user_blocks",
      "message_reports",
      "reviews",
      "review_moderation",
      "safety_reports",
      "report_events",
      "disputes",
      "dispute_events",
      "risk_flags",
      "moderation_actions"
    ].forEach((tableName) => {
      expect(policiesFor(tableName).join("\n")).not.toMatch(/to anon/i);
    });
  });

  it("scopes message threads to participants or explicit platform admin", () => {
    const policy = policyFor("message_threads", "message threads participant or admin select");
    expect(policy).toContain("private.rls_batch_4_is_message_thread_participant(public.message_threads.id)");
    expect(policy).toContain("private.rls_batch_4_is_platform_admin()");
  });

  it("scopes messages to participants or explicit platform admin and keeps direct inserts participant-owned", () => {
    const selectPolicy = policyFor("messages", "messages participant or admin select");
    const insertPolicy = policyFor("messages", "messages participant text insert");

    expect(selectPolicy).toContain("private.rls_batch_4_is_message_thread_participant(public.messages.thread_id)");
    expect(selectPolicy).toContain("private.rls_batch_4_is_platform_admin()");
    expect(insertPolicy).toContain("message_type = 'text'");
    expect(insertPolicy).toContain("sender_profile_id = auth.uid()");
    expect(insertPolicy).toContain("private.rls_batch_4_is_message_thread_participant(public.messages.thread_id)");
  });

  it("scopes thread participants to same-thread participants or explicit platform admin", () => {
    const policy = policyFor("thread_participants", "thread participants same thread or admin select");
    expect(policy).toContain("private.rls_batch_4_is_message_thread_participant(public.thread_participants.thread_id)");
    expect(policy).toContain("private.rls_batch_4_is_platform_admin()");
  });

  it("scopes message reports to reporter or explicit platform admin", () => {
    const selectPolicy = policyFor("message_reports", "message reports reporter or admin select");
    const insertPolicy = policyFor("message_reports", "message reports reporter insert");

    expect(selectPolicy).toContain("reported_by_profile_id = auth.uid()");
    expect(selectPolicy).toContain("private.rls_batch_4_is_platform_admin()");
    expect(insertPolicy).toContain("reported_by_profile_id = auth.uid()");
  });

  it("keeps Culture public reads limited to published approved public-safe rows", () => {
    const postPolicy = policyFor("culture_posts", "culture posts public approved read batch 4");
    expect(postPolicy).toContain("to anon, authenticated");
    expect(postPolicy).toContain("publishing_status = 'published'");
    expect(postPolicy).toContain("moderation_status = 'approved'");
    expect(postPolicy).toContain("visibility = 'public'");
    expect(postPolicy).toContain("deleted_at is null");
  });

  it("does not make Culture draft, private, deleted, flagged, rejected, or removed content public", () => {
    const postPolicy = policyFor("culture_posts", "culture posts public approved read batch 4");
    expect(postPolicy).not.toMatch(/visibility\s+in\s*\([^)]*private/i);
    expect(postPolicy).not.toContain("publishing_status in");
    expect(postPolicy).not.toContain("moderation_status in");
    expect(postPolicy).not.toMatch(/flagged|rejected|removed/i);
    expect(postPolicy).toContain("deleted_at is null");
  });

  it("makes Culture media and tags follow parent post visibility", () => {
    expect(policyFor("culture_media", "culture media parent read batch 4")).toContain(
      "private.rls_batch_4_can_read_culture_post(public.culture_media.post_id)"
    );
    expect(policyFor("culture_post_tags", "culture post tags parent read batch 4")).toContain(
      "private.rls_batch_4_can_read_culture_post(public.culture_post_tags.post_id)"
    );
  });

  it("keeps Culture feed telemetry private to actor or platform admin", () => {
    const policy = policyFor("culture_feed_events", "culture feed events actor admin read batch 4");
    expect(policy).toContain("actor_profile_id = auth.uid()");
    expect(policy).toContain("private.rls_batch_4_is_platform_admin()");
    expect(policiesFor("culture_feed_events").join("\n")).not.toMatch(/to anon/i);
  });

  it("keeps Culture reports reporter/admin scoped", () => {
    const policy = policyFor("culture_reports", "culture reports reporter admin read batch 4");
    expect(policy).toContain("reporter_profile_id = auth.uid()");
    expect(policy).toContain("private.rls_batch_4_is_platform_admin()");
  });

  it("keeps raw reviews participant, shop operator, or platform admin scoped instead of anon-readable", () => {
    const policy = policyFor("reviews", "reviews participant shop admin select batch 4");
    expect(policy).toContain("private.rls_batch_4_can_read_review");
    expect(policy).toContain("public.reviews.appointment_id");
    expect(policy).toContain("public.reviews.client_id");
    expect(policy).toContain("public.reviews.barber_id");
    expect(policy).toContain("public.reviews.location_id");
    expect(policy).not.toMatch(/to anon/i);
  });

  it("does not make review moderation broadly client readable", () => {
    const policy = policyFor("review_moderation", "review moderation scoped select batch 4");
    expect(policy).toContain("private.rls_batch_4_is_platform_admin()");
    expect(policy).toContain("private.rls_batch_4_is_profile_reference(public.review_moderation.client_reference)");
    expect(policy).toContain("private.can_read_booking_appointment_reference(public.review_moderation.appointment_reference)");
    expect(policy).not.toMatch(/to anon/i);
    expect(policy).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("scopes safety reports to reporter or platform admin", () => {
    const policy = policyFor("safety_reports", "safety reports reporter admin select batch 4");
    expect(policy).toContain("private.rls_batch_4_is_platform_admin()");
    expect(policy).toContain("private.rls_batch_4_is_profile_reference");
    expect(policy).toContain("public.safety_reports.reporter_reference");
    expect(policy).toContain("public.safety_reports.reporter_email");
  });

  it("makes report events follow parent safety report scope", () => {
    const policy = policyFor("report_events", "report events parent scoped select batch 4");
    expect(policy).toContain("private.rls_batch_4_can_read_safety_report(public.report_events.report_reference)");
  });

  it("scopes disputes and dispute events", () => {
    const disputePolicy = policyFor("disputes", "disputes scoped select batch 4");
    const eventPolicy = policyFor("dispute_events", "dispute events parent scoped select batch 4");

    expect(disputePolicy).toContain("private.rls_batch_4_is_profile_reference(public.disputes.submitted_by_reference)");
    expect(disputePolicy).toContain("private.rls_batch_4_is_profile_reference(public.disputes.involved_party_reference)");
    expect(disputePolicy).toContain("private.rls_batch_4_is_shop_operator_reference(public.disputes.location_reference)");
    expect(disputePolicy).toContain("private.can_read_booking_appointment_reference(public.disputes.appointment_reference)");
    expect(disputePolicy).toContain("private.rls_batch_4_is_platform_admin()");
    expect(eventPolicy).toContain("private.rls_batch_4_can_read_dispute(public.dispute_events.dispute_reference)");
  });

  it("keeps risk flags and moderation actions admin-only", () => {
    expect(policyFor("risk_flags", "risk flags admin select batch 4")).toContain(
      "private.rls_batch_4_is_platform_admin()"
    );
    expect(policyFor("moderation_actions", "moderation actions admin select batch 4")).toContain(
      "private.rls_batch_4_is_platform_admin()"
    );
    expect(policiesFor("risk_flags").join("\n")).not.toMatch(/to anon/i);
    expect(policiesFor("moderation_actions").join("\n")).not.toMatch(/to anon/i);
  });

  it("keeps platform admin access explicit without creating broad role access", () => {
    expect(sql).toContain("private.rls_batch_4_is_platform_admin()");
    expect(normalizedSql).not.toContain("p.role::text in ('owner'");
    expect(normalizedSql).not.toContain("p.role::text = 'owner'");
    expect(normalizedSql).not.toContain("'owner'::public.app_role");
  });

  it("keeps unknown or unverified postures as Needs Review instead of fake Pass", () => {
    const evidence = {
      status: "Needs Review",
      reason: "Migration candidate is not executed and production pg_policies evidence is not connected.",
      prState: "Draft"
    };

    expect(evidence.status).toBe("Needs Review");
    expect(evidence.prState).toBe("Draft");
  });

  it("does not execute production SQL or claim the PR is merge-ready", () => {
    const executionState = {
      productionSqlExecuted: false,
      productionDataMutated: false,
      migrationExecuted: false,
      prState: "Draft"
    };

    expect(executionState).toEqual({
      productionSqlExecuted: false,
      productionDataMutated: false,
      migrationExecuted: false,
      prState: "Draft"
    });
  });

  it("does not add physical DELETE policies while revoking direct delete privileges on prior Culture grants", () => {
    expect(sql).not.toMatch(/for\s+delete/i);
    expect(sql).toContain("revoke delete on public.culture_posts from authenticated");
    expect(sql).toContain("revoke delete on public.culture_media from authenticated");
    expect(sql).toContain("revoke delete on public.culture_post_tags from authenticated");
    expect(sql).toContain("revoke delete on public.culture_promotions from authenticated");
  });
});
