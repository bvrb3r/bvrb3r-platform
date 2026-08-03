import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(
  process.cwd(),
  "supabase/migrations/20260803073220_product_pr36_app_id.sql"
), "utf8");

describe("Product PR36 App ID migration", () => {
  it("creates private resolver authority with owner-only RLS", () => {
    expect(sql).toContain("create table if not exists public.app_identity_cards");
    expect(sql).toContain("public_identifier uuid not null default gen_random_uuid()");
    expect(sql).toContain("alter table public.app_identity_cards force row level security");
    expect(sql).toContain('(select auth.uid()) = public.app_identity_cards.user_id');
    expect(sql).toContain("revoke all on public.app_identity_cards, public.app_identity_card_events");
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on public\.app_identity_cards[^;]*authenticated/i);
  });

  it("invalidates old scans atomically and caps code lifetime", () => {
    expect(sql).toContain("public.pr36_regenerate_app_identity_card");
    expect(sql).toContain("code_version = code_version + 1");
    expect(sql).toContain("for update");
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("interval '90 days'");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("persists pause state and immutable audit evidence", () => {
    expect(sql).toContain("public.pr36_set_app_identity_card_paused");
    expect(sql).toContain("set paused_at = next_paused_at");
    expect(sql).toContain("before update or delete on public.app_identity_card_events");
    expect(sql).toContain("App ID audit events are immutable");
    expect(sql).toContain("'paused', 'resumed'");
  });
});
