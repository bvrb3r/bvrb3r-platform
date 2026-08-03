import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260729233000_product_pr29_architect_operations.sql"), "utf8");

describe("PR29 Architect operations migration", () => {
  it("stores every required operator command as service-owned durable truth", () => {
    for (const command of [
      "job_run",
      "webhook_replay",
      "broadcast",
      "device_restart",
      "sessions_revoke",
      "account_lock",
      "maintenance_schedule",
      "maintenance_cancel",
      "backup",
      "restore_drill",
      "cdn_purge",
      "rate_limit",
      "vercel_rollback"
    ]) {
      expect(sql).toContain(`'${command}'`);
    }
    expect(sql).toContain("alter table public.architect_operation_commands force row level security");
    expect(sql).toContain("revoke all on public.architect_operation_commands from public, anon, authenticated");
    expect(sql).toContain("idempotency_key text not null unique");
  });

  it("adds real uptime, metric, report, and maintenance evidence stores", () => {
    expect(sql).toContain("public.architect_uptime_checks");
    expect(sql).toContain("public.architect_service_metrics");
    expect(sql).toContain("public.architect_report_preferences");
    expect(sql).toContain("public.architect_maintenance_windows");
    expect(sql).toContain("error_count <= request_count");
    expect(sql).toContain("ends_at > starts_at");
  });
});
