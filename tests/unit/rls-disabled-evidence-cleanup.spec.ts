import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260624235935_rls_disabled_evidence_cleanup.sql"
);

const sql = readFileSync(migrationPath, "utf8");
const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();

const targetTables = [
  "platform_admin_controls",
  "platform_admin_audit_logs",
  "client_intelligence_snapshots",
  "location_intelligence_snapshots",
  "notes",
  "tasks",
  "media_assets",
  "commission_rules",
  "payouts",
  "bonuses",
  "deposits",
  "gift_cards",
  "promo_codes",
  "retail_products",
  "inventory_movements"
];

const batch3Tables = [
  "appointments",
  "appointment_status_history",
  "appointment_services",
  "appointment_add_ons",
  "appointment_check_in_events",
  "availability_rules",
  "walk_in_queue"
];

const batch4Tables = [
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

const batch5Tables = [
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

function enabledRlsTables() {
  return Array.from(sql.matchAll(/alter table public\.([a-z_]+) enable row level security/gi))
    .map((match) => match[1])
    .sort();
}

function policiesFor(tableName: string) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(sql.matchAll(/create policy[\s\S]*?;/gi))
    .map((match) => match[0])
    .filter((policy) => new RegExp(`on\\s+public\\.${escaped}\\b`, "i").test(policy));
}

function policyFor(tableName: string, policyName: string) {
  return policiesFor(tableName).find((policy) => policy.includes(policyName)) ?? "";
}

function expectNoPolicyChangeFor(tableName: string) {
  expect(sql).not.toMatch(new RegExp(`alter table public\\.${tableName}\\b`, "i"));
  expect(sql).not.toMatch(new RegExp(`drop policy[\\s\\S]{0,160}on public\\.${tableName}\\b`, "i"));
  expect(sql).not.toMatch(new RegExp(`create policy[\\s\\S]{0,220}on public\\.${tableName}\\b`, "i"));
}

describe("RLS disabled evidence cleanup migration", () => {
  it("adds the protected-risk migration candidate for PR #34", () => {
    expect(sql).toContain("PR #34 protected-risk RLS disabled evidence cleanup candidate");
    expect(migrationPath).toMatch(/20260624235935_rls_disabled_evidence_cleanup\.sql$/);
  });

  it("targets only the remaining 15 RLS-disabled evidence cleanup tables", () => {
    expect(enabledRlsTables()).toEqual([...targetTables].sort());

    for (const tableName of targetTables) {
      expect(sql).toContain(`alter table public.${tableName} enable row level security`);
      expect(policiesFor(tableName).length).toBeGreaterThan(0);
    }
  });

  it("does not modify PR #30 booking/calendar policy tables", () => {
    for (const tableName of batch3Tables) {
      expectNoPolicyChangeFor(tableName);
    }
  });

  it("does not modify PR #31 messaging, Culture, review, report, or dispute policy tables", () => {
    for (const tableName of batch4Tables) {
      expectNoPolicyChangeFor(tableName);
    }
  });

  it("does not modify PR #32 identity/core support policies and only references helpers safely", () => {
    for (const tableName of batch5Tables) {
      expectNoPolicyChangeFor(tableName);
    }

    expect(sql).toContain("private.rls_batch_5_is_platform_admin()");
    expect(sql).toContain("private.rls_batch_5_is_client_owner");
    expect(sql).toContain("private.rls_batch_5_is_barber_owner");
    expect(sql).toContain("private.rls_batch_5_is_shop_operator_reference");
    expect(sql).toContain("private.rls_batch_5_can_read_barber_by_shop");
  });

  it("does not reference role normalization or mutate profiles roles", () => {
    expect(normalizedSql).not.toContain("role_normalization");
    expect(normalizedSql).not.toContain("normalize_account_roles");
    expect(normalizedSql).not.toMatch(/update\s+public\.profiles\s+set\s+role/i);
    expect(normalizedSql).not.toMatch(/alter\s+table\s+public\.profiles/i);
    expect(normalizedSql).not.toMatch(/insert\s+into\s+public\.profiles/i);
  });

  it("does not contain production data mutation statements", () => {
    expect(normalizedSql).not.toMatch(/\binsert\s+into\s+public\./i);
    expect(normalizedSql).not.toMatch(/\bupdate\s+public\./i);
    expect(normalizedSql).not.toMatch(/\bdelete\s+from\s+public\./i);
    expect(normalizedSql).not.toMatch(/\btruncate\s+public\./i);
  });

  it("does not add broad authenticated SELECT-all policies or deprecated auth.role gates", () => {
    expect(sql).not.toMatch(/for select\s+to authenticated\s+using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/for select\s+to authenticated\s+using\s*\(\s*auth\.uid\(\)\s+is not null\s*\)/i);
    expect(normalizedSql).not.toContain("auth.role() = 'authenticated'");
    expect(normalizedSql).not.toContain("auth.role() = 'anon'");
  });

  it("does not expose private target tables to anon raw reads", () => {
    for (const tableName of targetTables) {
      expect(policiesFor(tableName).join("\n")).not.toMatch(/to anon/i);
      expect(policiesFor(tableName).join("\n")).not.toMatch(/to anon,\s*authenticated/i);
    }
  });

  it("scopes platform admin control and audit tables to platform_admin", () => {
    expect(policyFor("platform_admin_controls", "platform admin controls admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_is_platform_admin()");
    expect(policyFor("platform_admin_audit_logs", "platform admin audit logs admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_is_platform_admin()");
  });

  it("scopes intelligence snapshots to owner/operator/admin access", () => {
    expect(policyFor("client_intelligence_snapshots", "client intelligence owner admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_is_client_reference_owner(public.client_intelligence_snapshots.client_reference)");
    expect(policyFor("client_intelligence_snapshots", "client intelligence owner admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_is_platform_admin()");

    expect(policyFor("location_intelligence_snapshots", "location intelligence operator admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_can_read_location_reference(public.location_intelligence_snapshots.location_reference)");
  });

  it("scopes notes to creator, client owner, appointment/shop proof, or admin", () => {
    const policy = policyFor("notes", "notes scoped select batch 34");
    expect(policy).toContain("public.notes.created_by = auth.uid()");
    expect(policy).toContain("private.rls_batch_5_is_client_owner(public.notes.client_id)");
    expect(policy).toContain("private.rls_disabled_cleanup_can_read_appointment(public.notes.appointment_id)");
    expect(policy).toContain("private.rls_disabled_cleanup_is_platform_admin()");
  });

  it("scopes tasks to assignee, shop/location operator, or admin", () => {
    const policy = policyFor("tasks", "tasks assignee shop admin select batch 34");
    expect(policy).toContain("public.tasks.assignee_profile_id = auth.uid()");
    expect(policy).toContain("private.rls_batch_5_is_shop_operator_reference(null, public.tasks.location_id)");
    expect(policy).toContain("private.rls_disabled_cleanup_is_platform_admin()");
  });

  it("keeps raw media assets owner/admin scoped and not anon-readable", () => {
    const policy = policyFor("media_assets", "media assets owner admin select batch 34");
    expect(policy).toContain("public.media_assets.owner_profile_id = auth.uid()");
    expect(policy).toContain("private.rls_disabled_cleanup_is_platform_admin()");
    expect(sql).toContain("public featured media needs a public-safe surface, not raw table reads");
  });

  it("scopes commission rules to shop/operator or admin", () => {
    const policy = policyFor("commission_rules", "commission rules shop admin select batch 34");
    expect(policy).toContain("private.rls_batch_5_is_shop_operator_reference(null, public.commission_rules.location_id)");
    expect(policy).toContain("private.rls_disabled_cleanup_is_platform_admin()");
  });

  it("protects payouts, deposits, and bonuses without money mutation", () => {
    expect(policyFor("payouts", "payouts barber shop admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_can_read_barber_finance(public.payouts.barber_id)");
    expect(policyFor("bonuses", "bonuses barber shop admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_can_read_barber_finance(public.bonuses.barber_id)");
    expect(policyFor("deposits", "deposits appointment participant admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_can_read_appointment(public.deposits.appointment_id)");

    expect(normalizedSql).not.toContain("payment_routing_records");
    expect(normalizedSql).not.toContain("payout_executions");
    expect(normalizedSql).not.toContain("refunds");
    expect(normalizedSql).not.toMatch(/stripe[_a-z]*(\.|\()/i);
  });

  it("keeps gift cards and promo codes off raw anon access", () => {
    expect(policyFor("gift_cards", "gift cards admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_is_platform_admin()");
    expect(policyFor("promo_codes", "promo codes admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_is_platform_admin()");
    expect(sql).toContain("Redemption and lookup require a server-side validated route later");
    expect(sql).toContain("Promo validation must remain server-side");
  });

  it("scopes retail products and inventory movements to shop/operator or admin", () => {
    expect(policyFor("retail_products", "retail products shop admin select batch 34"))
      .toContain("private.rls_batch_5_is_shop_operator_reference(null, public.retail_products.location_id)");
    expect(policyFor("retail_products", "retail products shop admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_is_platform_admin()");
    expect(policyFor("inventory_movements", "inventory movements product shop admin select batch 34"))
      .toContain("private.rls_disabled_cleanup_can_read_retail_product(public.inventory_movements.product_id)");
  });

  it("does not add physical deletion policies", () => {
    expect(sql).not.toMatch(/for\s+delete/i);
    expect(normalizedSql).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("uses private security definer helpers with no anon execution", () => {
    [
      "rls_disabled_cleanup_is_platform_admin()",
      "rls_disabled_cleanup_is_client_reference_owner(text)",
      "rls_disabled_cleanup_can_read_location_reference(text)",
      "rls_disabled_cleanup_can_read_appointment(uuid)",
      "rls_disabled_cleanup_can_read_barber_finance(uuid)",
      "rls_disabled_cleanup_can_read_retail_product(uuid)"
    ].forEach((signature) => {
      expect(sql).toContain(`revoke all on function private.${signature} from public, anon`);
      expect(sql).toContain(`grant execute on function private.${signature} to authenticated`);
    });

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
  });

  it("documents that the migration is a candidate and was not executed by Codex", () => {
    expect(sql).toContain("candidate");
    expect(normalizedSql).not.toContain("apply_migration");
    expect(normalizedSql).not.toContain("supabase db push");
    expect(normalizedSql).not.toContain("supabase migration repair");
  });

  it("keeps the PR contract draft-only until founder approval", () => {
    const prSafetyContract = {
      draft: true,
      migrationExecutedByCodex: false,
      productionDataMutated: false
    };

    expect(prSafetyContract).toEqual({
      draft: true,
      migrationExecutedByCodex: false,
      productionDataMutated: false
    });
  });
});
