import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAccountExportToken, hashAccountExportToken } from "@/lib/trust/account-data-export";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Product PR31 data export and account deletion", () => {
  it("creates an unguessable export token while storing only its digest", () => {
    const first = createAccountExportToken();
    const second = createAccountExportToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).toBe(hashAccountExportToken(first.token));
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });

  it("builds the required JSON bundle without exporting payment credentials", () => {
    const source = read("lib/trust/account-data-export.ts");
    expect(source).toContain("transactionsAsParty");
    expect(source).toContain("culture:");
    expect(source).toContain("media,");
    expect(source).toContain("appointments,");
    expect(source).toContain("payment credentials and full card data");
    expect(source).toContain("personalAppointmentIds");
    expect(source).toContain("Owning a shop does not");
    expect(source).toContain("productPr36");
    expect(source).toContain("groupPaymentIntents");
    expect(source).toContain("giftPayoutObligations");
    expect(source).toContain("prelaunchWaitlist");
    expect(source).not.toContain("provider_payment_method_id");
    expect(source).not.toContain("provider_payment_intent_id");
  });

  it("queues, emails, and expires an authenticated export after 24 hours", () => {
    const worker = read("lib/trust/account-privacy-worker.ts");
    const download = read("app/api/account/exports/[token]/route.ts");
    const dataRights = read("app/api/account/data-rights/route.ts");
    expect(worker).toContain("24 * 60 * 60 * 1000");
    expect(worker).toContain('status: "ready"');
    expect(worker).toContain("sendEmail");
    expect(worker).toContain("account_export_archives");
    expect(worker).toContain("worker_claim_expired");
    expect(worker).toContain('.lt("attempt_count", 5)');
    expect(download).toContain('user.id === "guest-user"');
    expect(download).toContain("hashAccountExportToken(token)");
    expect(download).toContain("status: 410");
    expect(download).toContain('"cache-control": "private, no-store, max-age=0"');
    expect(dataRights).toContain("export_delivery_requires_request");
    expect(dataRights).not.toContain("inline_json");
  });

  it("delivers re-verification out of band and uses a seven-day cool-off", () => {
    const service = read("lib/trust/product-pr27-service.ts");
    const workspace = read("components/trust/account-privacy-workspace.tsx");
    expect(service).toContain("sendAccountDeletionChallengeEmail");
    expect(service).toContain("maskedDestination");
    expect(service).toContain("7 * 24 * 60 * 60 * 1000");
    expect(service).toContain("pr31_schedule_account_deletion");
    expect(service).toContain("pr31_restore_account_deletion");
    expect(workspace).toContain("7-day cool-off");
    expect(workspace).toContain("code sent to your verified email");
    expect(workspace).not.toContain("Grace: 30 days");
  });

  it("grandfathers active promises while making new 7-day and 24-hour policies authoritative", () => {
    const migration = read("supabase/migrations/20260803073148_converge_pr31_data_deletion_workers.sql");
    expect(migration).toContain("grace_period_days smallint not null default 7");
    expect(migration).toContain("set grace_period_days = 30");
    expect(migration).toContain("validity_hours smallint not null default 24");
    expect(migration).toContain("attempt_count integer not null default 0");
    expect(migration).toContain("set validity_hours = 168");
    expect(migration).toContain("account_export_archives force row level security");
    expect(migration).toContain("account_deletion_finalization_jobs force row level security");
    expect(migration).toContain("pr31_schedule_account_deletion");
    expect(migration).toContain("pr31_guard_active_appointment_participants");
    expect(migration).toContain("for share");
    expect(migration).toContain("order by participant.profile_id");
    expect(migration).toContain("order by lifecycle.profile_id");
    expect(migration).toContain("account_export_archives_profile_idx");
    expect(migration).toContain("Open bookings must be resolved before account deletion.");
    expect(migration).toContain("status = 'canceled'");
    expect(migration).toContain("'restored_losslessly', true");
    expect(migration).not.toContain("delete from public.data_rights_requests");
  });

  it("does not let a canceled deletion job get reopened by an in-flight worker", () => {
    const worker = read("lib/trust/account-privacy-worker.ts");
    expect(worker).toContain('.eq("status", "processing")');
    expect(worker).toContain('status: "failed", last_error_code: safeFailureCode(error)');
  });

  it("protects and schedules the server-owned privacy worker", () => {
    const route = read("app/api/cron/account-privacy/route.ts");
    const config = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain("runPr31AccountPrivacyWorker");
    expect(config.crons).toContainEqual({
      path: "/api/cron/account-privacy",
      schedule: "0 * * * *"
    });
  });
});
