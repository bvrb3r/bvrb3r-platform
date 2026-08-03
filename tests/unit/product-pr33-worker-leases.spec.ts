import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Product PR33 calendar worker leases", () => {
  const worker = read("lib/calendar-sync/worker.ts");

  it("claims provider rows atomically and conditions result writes on lease ownership", () => {
    expect(worker).toContain("runWithConnectionLease");
    expect(worker).toContain("sync_lease_token: leaseToken");
    expect(worker).toContain("sync_lease_until: leaseUntil");
    expect(worker).toContain('.or(`sync_lease_until.is.null,sync_lease_until.lt.${nowIso}`)');
    expect(worker).toContain('.eq("sync_lease_token", leaseToken)');
    expect(worker).toContain("calendar_connection_lease_lost");
    expect(worker).toContain("requireDue: trigger === \"schedule\"");
  });

  it("recovers expired jobs and claims only one pending row per lease token", () => {
    expect(worker).toContain("recoverExpiredJobs");
    expect(worker).toContain("calendar_job_lease_expired");
    expect(worker).toContain("calendar_job_lease_expired_superseded");
    expect(worker).toContain('.eq("state", "pending")');
    expect(worker).toContain("lease_expires_at: new Date(now.getTime() + CALENDAR_JOB_LEASE_MS).toISOString()");
    expect(worker).toContain('.eq("lease_token", leaseToken)');
  });

  it("does not spend a retry attempt when the provider connection lease is busy", () => {
    expect(worker).toContain("incrementAttempt?: boolean");
    expect(worker).toContain("incrementAttempt: false");
    expect(worker).toContain('errorCode: "calendar_connection_busy"');
  });

  it("queues Google backfill rows instead of running an unbounded provider export inline", () => {
    expect(worker).toContain('admin.rpc("product_pr33_enqueue_google_export_backfill"');
    expect(worker).not.toContain("exportAll");
    expect(worker).toContain('.eq("id", input.appointmentId)');
  });

  it("revalidates both Square mapping selections on the server", () => {
    expect(worker).toContain('.eq("profile_id", input.user.id)');
    expect(worker).toContain('.eq("location_id", input.locationId)');
    expect(worker).toContain("candidates.some((candidate) => candidate.id === input.teamMemberId)");
    expect(worker).toContain("square_mapping_team_forbidden");
    expect(worker).toContain("square_mapping_location_forbidden");
  });
});
