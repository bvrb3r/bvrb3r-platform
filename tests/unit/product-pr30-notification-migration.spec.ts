import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260730000000_product_pr30_notification_center.sql"),
  "utf8"
);
const flat = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();

describe("Product PR30 notification migration", () => {
  it("is transactional and stores only safe app-relative deep links", () => {
    expect(flat.trim().startsWith("begin;")).toBe(true);
    expect(flat.trim().endsWith("commit;")).toBe(true);
    expect(flat).toContain("add column if not exists deep_link text");
    expect(flat).toContain("deep_link like '/%'");
    expect(flat).toContain("deep_link not like '//%'");
  });

  it("stores the complete category-by-channel matrix", () => {
    expect(flat).toContain("add column if not exists channel_preferences jsonb");
    for (const category of ["booking", "queue", "money", "culture", "team", "system"]) {
      expect(flat).toContain(`{${category},push}`);
      expect(flat).toContain(`{${category},sms}`);
      expect(flat).toContain(`{${category},email}`);
    }
  });

  it("enforces active-queue SMS in a locked-down database trigger", () => {
    expect(flat).toContain("create or replace function private.pr30_enforce_active_queue_sms()");
    expect(flat).toContain("w.operational_sms_consent");
    expect(flat).toContain("new.sms_enabled := true");
    expect(flat).toContain("revoke all on function private.pr30_enforce_active_queue_sms()");
    expect(flat).toContain("from public, anon, authenticated");
    expect(flat).toContain("before insert or update of profile_id, channel_preferences, sms_enabled");
  });

  it("indexes both profile and email unread feeds", () => {
    expect(flat).toContain("notifications_profile_unread_idx");
    expect(flat).toContain("notifications_email_unread_idx");
    expect(flat).toContain("where read_at is null");
  });
});
