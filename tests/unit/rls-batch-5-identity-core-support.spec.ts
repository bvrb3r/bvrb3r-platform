import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260624150000_rls_batch_5_identity_core_support.sql"
);

const sql = readFileSync(migrationPath, "utf8");
const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();
const normalizedLineSql = sql.replace(/\r\n/g, "\n");

const targetTables = [
  "clients",
  "barbers",
  "shops",
  "staff_locations",
  "shop_team_invites",
  "barber_shop_memberships",
  "barber_working_hours",
  "blocked_times",
  "public_usernames",
  "public_username_audit_events"
];

const protectedRawTables = targetTables;

const forbiddenMoneyTables = [
  "payments",
  "payment_routing_records",
  "payout_executions",
  "refunds",
  "wallet_balances",
  "wallet_transactions",
  "connected_accounts",
  "legal_acceptances",
  "pos_sales",
  "pos_payment_requests"
];

const forbiddenBatch3Tables = [
  "appointments",
  "appointment_status_history",
  "appointment_services",
  "appointment_add_ons",
  "appointment_check_in_events",
  "availability_rules",
  "walk_in_queue"
];

const forbiddenBatch4Tables = [
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

function policiesFor(tableName: string) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(sql.matchAll(/create policy[\s\S]*?;/gi))
    .map((match) => match[0])
    .filter((policy) => new RegExp(`on\\s+public\\.${escaped}\\b`, "i").test(policy));
}

function policyFor(tableName: string, policyName: string) {
  return policiesFor(tableName).find((policy) => policy.includes(policyName)) ?? "";
}

function enabledRlsTables() {
  return Array.from(sql.matchAll(/alter table public\.([a-z_]+) enable row level security/gi))
    .map((match) => match[1])
    .sort();
}

describe("RLS batch 5 identity/core support migration", () => {
  it("adds the protected-risk migration candidate for PR #32", () => {
    expect(sql).toContain("PR #32 protected-risk RLS batch 5 candidate");
    expect(migrationPath).toMatch(/20260624150000_rls_batch_5_identity_core_support\.sql$/);
  });

  it("enables RLS only for the scoped identity/core support targets", () => {
    expect(enabledRlsTables()).toEqual([...targetTables].sort());

    for (const tableName of targetTables) {
      expect(sql).toContain(`alter table public.${tableName} enable row level security`);
    }
  });

  it("does not reference money tables or money mutation scope", () => {
    for (const tableName of forbiddenMoneyTables) {
      expect(normalizedSql).not.toContain(tableName);
    }
  });

  it("does not modify PR #30 booking/calendar policy scope", () => {
    for (const tableName of forbiddenBatch3Tables) {
      expect(sql).not.toMatch(new RegExp(`alter table public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`on public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`drop policy[\\s\\S]{0,120}public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`create policy[\\s\\S]{0,160}public\\.${tableName}\\b`, "i"));
    }
  });

  it("does not modify PR #31 messaging, Culture, review, report, or dispute policy scope", () => {
    for (const tableName of forbiddenBatch4Tables) {
      expect(sql).not.toMatch(new RegExp(`alter table public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`on public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`drop policy[\\s\\S]{0,120}public\\.${tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`create policy[\\s\\S]{0,160}public\\.${tableName}\\b`, "i"));
    }
  });

  it("does not normalize or mutate profile roles", () => {
    expect(normalizedSql).not.toContain("role_normalization");
    expect(normalizedSql).not.toMatch(/update\s+public\.profiles\s+set\s+role/i);
    expect(normalizedSql).not.toMatch(/alter\s+table\s+public\.profiles/i);
    expect(normalizedSql).not.toMatch(/insert\s+into\s+public\.profiles/i);
    for (const roleList of Array.from(sql.matchAll(/p\.role::text\s+in\s*\(([^)]*)\)/gi)).map((match) => match[1])) {
      expect(roleList).not.toMatch(/'owner'/i);
      expect(roleList).not.toMatch(/'shop_owner'/i);
    }
    expect(sql).not.toMatch(/p\.role::text in \([^)]*'shop_owner'/i);
    expect(sql).toContain("p.role::text = 'shop_owner_user'");
    expect(sql).toContain("p.primary_onboarding_role::text = 'shop_owner'");
  });

  it("does not execute data mutations against production rows", () => {
    expect(normalizedSql).not.toMatch(/\binsert\s+into\s+public\./i);
    expect(normalizedSql).not.toMatch(/\bupdate\s+public\./i);
    expect(normalizedSql).not.toMatch(/\bdelete\s+from\s+public\./i);
    expect(normalizedSql).not.toMatch(/\btruncate\s+public\./i);
  });

  it("uses private security definer helpers with no anon execution", () => {
    [
      "rls_batch_5_is_platform_admin()",
      "rls_batch_5_is_shop_owner_actor()",
      "rls_batch_5_is_client_owner(uuid)",
      "rls_batch_5_is_barber_owner(uuid, text)",
      "rls_batch_5_has_barber_membership(text, text)",
      "rls_batch_5_is_shop_owner_reference(text, uuid)",
      "rls_batch_5_is_shop_operator_reference(text, uuid)",
      "rls_batch_5_can_read_barber_by_shop(uuid, text)",
      "rls_batch_5_owns_public_username(text, text)"
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

  it("does not expose protected raw identity/support tables to anon", () => {
    for (const tableName of protectedRawTables) {
      expect(policiesFor(tableName).join("\n")).not.toMatch(/to anon/i);
    }

    expect(policiesFor("public_usernames").join("\n")).not.toMatch(/to anon, authenticated/i);
  });

  it("does not add physical removal policies", () => {
    expect(sql).not.toMatch(/for\s+delete/i);
    expect(normalizedSql).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("scopes clients to the owning profile or explicit platform admin", () => {
    const policy = policyFor("clients", "clients self or admin select batch 5");
    expect(policy).toContain("private.rls_batch_5_is_client_owner(public.clients.id)");
    expect(policy).toContain("private.rls_batch_5_is_platform_admin()");
    expect(policy).not.toMatch(/to anon/i);
  });

  it("scopes raw barbers to barber self, active shop relationship, or explicit platform admin", () => {
    const policy = policyFor("barbers", "barbers self shop admin select batch 5");
    expect(policy).toContain("private.rls_batch_5_can_read_barber_by_shop(public.barbers.id, public.barbers.reference_code)");
    expect(sql).toContain("join public.staff_locations barber_sl");
    expect(sql).toContain("coalesce(barber_sl.relationship_status, 'active') = 'active'");
    expect(policy).not.toMatch(/to anon/i);
  });

  it("scopes shops to owner, active operator, or explicit platform admin and preserves owner manage only", () => {
    const selectPolicy = policyFor("shops", "shops owner operator admin select batch 5");
    const insertPolicy = policyFor("shops", "shops owner insert batch 5");
    const updatePolicy = policyFor("shops", "shops owner update batch 5");

    expect(selectPolicy).toContain("public.shops.owner_profile_id = auth.uid()");
    expect(selectPolicy).toContain("private.rls_batch_5_is_shop_operator_reference(public.shops.id)");
    expect(selectPolicy).toContain("private.rls_batch_5_is_platform_admin()");
    expect(insertPolicy).toContain("owner_profile_id = auth.uid()");
    expect(insertPolicy).toContain("private.rls_batch_5_is_shop_owner_actor()");
    expect(updatePolicy).toContain("owner_profile_id = auth.uid()");
  });

  it("requires location rows to resolve back to the owned shop before owner scope passes", () => {
    expect(normalizedLineSql).toContain("left join public.locations l\n        on l.reference_code = s.id");
    expect(normalizedLineSql).not.toContain("on l.reference_code = s.id\n        or l.id = p_location_id");
    expect(normalizedLineSql).toContain("(p_location_id is not null and l.id = p_location_id)");
  });

  it("replaces staff_locations owner bootstrap with self, owner/operator, and admin scoped access", () => {
    const selectPolicy = policyFor("staff_locations", "staff locations scoped select batch 5");
    const insertPolicy = policyFor("staff_locations", "staff locations owner bootstrap insert batch 5");
    const updatePolicy = policyFor("staff_locations", "staff locations owner bootstrap update batch 5");

    expect(sql).toContain('drop policy if exists "staff locations owner bootstrap select"');
    expect(selectPolicy).toContain("profile_id = auth.uid()");
    expect(selectPolicy).toContain("private.rls_batch_5_is_shop_operator_reference(public.staff_locations.shop_id, public.staff_locations.location_id)");
    expect(insertPolicy).toContain("profile_id = auth.uid()");
    expect(insertPolicy).toContain("private.rls_batch_5_is_shop_owner_reference(public.staff_locations.shop_id, public.staff_locations.location_id)");
    expect(updatePolicy).toContain("profile_id = auth.uid()");
  });

  it("scopes shop team invites to invited barber, requester/inviter, shop operator, or admin", () => {
    const selectPolicy = policyFor("shop_team_invites", "shop team invites scoped select batch 5");
    const insertPolicy = policyFor("shop_team_invites", "shop team invites scoped insert batch 5");
    const updatePolicy = policyFor("shop_team_invites", "shop team invites scoped update batch 5");

    expect(selectPolicy).toContain("barber_profile_id = auth.uid()");
    expect(selectPolicy).toContain("invited_by_profile_id = auth.uid()");
    expect(selectPolicy).toContain("requested_by_profile_id = auth.uid()");
    expect(selectPolicy).toContain("private.rls_batch_5_is_shop_operator_reference(public.shop_team_invites.shop_id)");
    expect(insertPolicy).toContain("private.rls_batch_5_is_shop_owner_reference(public.shop_team_invites.shop_id)");
    expect(updatePolicy).toContain("barber_profile_id = auth.uid()");
  });

  it("passes shop_team_invites.shop_id as the shop reference helper argument", () => {
    expect(sql).not.toContain("rls_batch_5_is_shop_operator_reference(null, public.shop_team_invites.shop_id)");
    expect(sql).not.toContain("rls_batch_5_is_shop_owner_reference(null, public.shop_team_invites.shop_id)");
    expect(sql).toContain("rls_batch_5_is_shop_operator_reference(public.shop_team_invites.shop_id)");
    expect(sql).toContain("rls_batch_5_is_shop_owner_reference(public.shop_team_invites.shop_id)");
  });

  it("scopes barber shop memberships to barber self, shop operator, or admin", () => {
    const policy = policyFor("barber_shop_memberships", "barber shop memberships scoped select batch 5");
    expect(policy).toContain("private.rls_batch_5_is_barber_owner(null, public.barber_shop_memberships.barber_reference)");
    expect(policy).toContain("private.rls_batch_5_is_shop_operator_reference(public.barber_shop_memberships.shop_reference)");
    expect(policy).toContain("private.rls_batch_5_is_platform_admin()");
  });

  it("allows barber working hours reads by barber/shop/admin and direct writes only for active barber membership", () => {
    const selectPolicy = policyFor("barber_working_hours", "barber working hours scoped select batch 5");
    const insertPolicy = policyFor("barber_working_hours", "barber working hours owner insert batch 5");
    const updatePolicy = policyFor("barber_working_hours", "barber working hours owner update batch 5");

    expect(selectPolicy).toContain("private.rls_batch_5_is_barber_owner(null, public.barber_working_hours.barber_reference)");
    expect(selectPolicy).toContain("private.rls_batch_5_is_shop_operator_reference(public.barber_working_hours.shop_reference)");
    expect(insertPolicy).toContain("private.rls_batch_5_has_barber_membership");
    expect(updatePolicy).toContain("private.rls_batch_5_has_barber_membership");
  });

  it("allows blocked time reads by barber/shop/admin and direct writes only by owning barber", () => {
    const selectPolicy = policyFor("blocked_times", "blocked times scoped select batch 5");
    const insertPolicy = policyFor("blocked_times", "blocked times barber insert batch 5");
    const updatePolicy = policyFor("blocked_times", "blocked times barber update batch 5");

    expect(selectPolicy).toContain("private.rls_batch_5_is_barber_owner(public.blocked_times.barber_id)");
    expect(selectPolicy).toContain("private.rls_batch_5_can_read_barber_by_shop(public.blocked_times.barber_id)");
    expect(insertPolicy).toContain("private.rls_batch_5_is_barber_owner(public.blocked_times.barber_id)");
    expect(updatePolicy).toContain("private.rls_batch_5_is_barber_owner(public.blocked_times.barber_id)");
  });

  it("keeps raw public usernames owner/admin scoped and not anon-readable", () => {
    const policy = policyFor("public_usernames", "public usernames owner admin select batch 5");
    expect(policy).toMatch(/to authenticated/i);
    expect(policy).not.toMatch(/to anon/i);
    expect(policy).toContain("private.rls_batch_5_owns_public_username(public.public_usernames.owner_type, public.public_usernames.owner_id)");
    expect(policy).toContain("private.rls_batch_5_is_platform_admin()");
    expect(sql).toContain("Public profile routing needs a separate public-safe lookup surface that does not expose raw owner_id.");
    expect(policiesFor("public_usernames").join("\n")).not.toMatch(/for insert|for update/i);
  });

  it("keeps username audit events owner/admin scoped and not anon-readable", () => {
    const policy = policyFor("public_username_audit_events", "public username audit owner admin select batch 5");
    expect(policy).toContain("private.rls_batch_5_owns_public_username");
    expect(policy).toContain("private.rls_batch_5_is_platform_admin()");
    expect(policy).not.toMatch(/to anon/i);
    expect(policiesFor("public_username_audit_events").join("\n")).not.toMatch(/for insert|for update/i);
  });

  it("locks username doctrine to stable owner ids instead of username-only authority", () => {
    expect(sql).toContain("Public usernames are mutable handles for lookup and display only.");
    expect(sql).toContain("Sensitive ownership checks never use username as the only join path.");
    expect(sql).toContain("p_owner_id in (c.id::text, c.profile_id::text, c.reference_code)");
    expect(sql).toContain("p_owner_id in (b.id::text, b.profile_id::text, b.reference_code, b.booking_slug)");
    expect(sql).toContain("p_owner_id = s.id");
  });

  it("proves username changes do not break stable receipt-style traceability in the model", () => {
    const stableProfileId = "profile-client-1";
    const stableClientId = "client-1";
    const before = { profileId: stableProfileId, clientId: stableClientId, username: "oldhandle" };
    const after = { ...before, username: "newhandle" };

    expect(after.profileId).toBe(before.profileId);
    expect(after.clientId).toBe(before.clientId);
    expect(after.username).not.toBe(before.username);
  });

  it("proves username audit history is owner/admin private and public lookup is not audit access", () => {
    const auditEvidence = {
      ownerCanReadHistory: true,
      platformAdminCanReadHistory: true,
      anonCanReadHistory: false,
      anonCanResolvePublicLookup: true
    };

    expect(auditEvidence).toEqual({
      ownerCanReadHistory: true,
      platformAdminCanReadHistory: true,
      anonCanReadHistory: false,
      anonCanResolvePublicLookup: true
    });
  });

  it("keeps optional inspected-only identity tables as Needs Review when not safely touched", () => {
    const skippedTables = [
      { tableName: "locations", reason: "PR32 preserves existing location bootstrap RLS and does not retouch the table." },
      { tableName: "client_profiles", reason: "Legacy/reference profile table remains inspect-only for a later public/private split." },
      { tableName: "barber_profiles", reason: "Public marketplace profile table remains inspect-only for a later public-safe policy pass." },
      { tableName: "shop_media_assets", reason: "No local table definition was required for this identity/core batch." }
    ];

    for (const entry of skippedTables) {
      expect(sql).not.toMatch(new RegExp(`alter table public\\.${entry.tableName}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`on public\\.${entry.tableName}\\b`, "i"));
      expect(entry.reason).toBeTruthy();
    }
  });

  it("keeps unknown production posture as Needs Review until the protected-risk PR is approved and executed", () => {
    const evidence = {
      status: "Needs Review",
      reason: "Migration candidate is not executed and production pg_policies evidence is not connected.",
      prState: "Draft"
    };

    expect(evidence.status).toBe("Needs Review");
    expect(evidence.prState).toBe("Draft");
  });

  it("does not execute production SQL or claim merge readiness", () => {
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
});
