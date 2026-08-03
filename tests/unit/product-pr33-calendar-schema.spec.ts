import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Product PR33 calendar storage and guards", () => {
  const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
  const migrationName = readdirSync(migrationsDirectory).find((name) => name.endsWith("_product_pr33_calendar_sync_core.sql"));

  it("stores encrypted provider credentials behind service-only grants", () => {
    expect(migrationName).toBeDefined();
    const sql = readFileSync(join(migrationsDirectory, migrationName!), "utf8").toLowerCase();
    expect(sql).toContain("create table if not exists public.square_connections");
    expect(sql).toContain("access_token_ciphertext text not null");
    expect(sql).toContain("refresh_token_ciphertext text not null");
    expect(sql).toContain("granted_scopes = array['appointments_read']::text[]");
    expect(sql).toContain("revoke all on public.square_connections from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on public.square_connections to service_role");
  });

  it("keeps Square imports operational-only with no money columns", () => {
    const sql = readFileSync(join(migrationsDirectory, migrationName!), "utf8").toLowerCase();
    const importedView = sql.slice(
      sql.indexOf("create or replace view public.imported_appointments"),
      sql.indexOf("comment on view public.imported_appointments")
    );
    expect(importedView).toContain("true as read_only");
    expect(importedView).toContain("where c.provider = 'square'");
    expect(importedView).not.toMatch(/\b(amount|price|tip|payout|card|payment_owner)\b/);

    const worker = read("lib/calendar-sync/worker.ts");
    expect(worker).toContain('payment_owner: "external:square"');
    expect(worker).not.toContain('/v2/payments');
    expect(worker).not.toContain('/v2/payouts');
    expect(worker).not.toContain('/v2/cards');
  });

  it("enforces Square call-up and checkout denial in both service and database", () => {
    const sql = readFileSync(join(migrationsDirectory, migrationName!), "utf8").toLowerCase();
    expect(sql).toContain("product_pr33_guard_square_queue_checkout");
    expect(sql).toContain("square appointments cannot enter bvrb3r checkout or settlement");
    expect(sql).toContain("square appointments cannot be called into the bvrb3r settle flow");

    const queueService = read("lib/queue/service.ts");
    expect(queueService).toContain('entry.source_provider === "square"');
    expect(queueService).toContain('queueRow.payment_owner === "external:square"');
  });

  it("stores only hashed busy identity and structurally excludes private event content", () => {
    const sql = readFileSync(join(migrationsDirectory, migrationName!), "utf8").toLowerCase();
    const busyTable = sql.slice(
      sql.indexOf("create table if not exists public.calendar_busy_blocks"),
      sql.indexOf("comment on table public.calendar_busy_blocks")
    );
    expect(busyTable).toContain("provider_calendar_id_hash text not null");
    expect(busyTable).toContain("external_event_id_hash text not null");
    expect(busyTable).toContain("privacy_label text not null default 'busy'");
    expect(busyTable).not.toMatch(/\b(title|note|invitee|attendee|description)\b/);
  });

  it("enqueues appointment writes without losing a mutation that arrives while a job runs", () => {
    const sql = readFileSync(join(migrationsDirectory, migrationName!), "utf8").toLowerCase();
    expect(sql).toContain("calendar_sync_jobs_live_dedupe_idx");
    expect(sql).toMatch(/calendar_sync_jobs_live_dedupe_idx[\s\S]*nulls not distinct[\s\S]*where state = 'pending'/);
    expect(sql).toContain("lease_token uuid");
    expect(sql).toContain("lease_expires_at timestamptz");
    expect(sql).toContain("calendar_sync_jobs_expired_lease_idx");
    expect(sql).toContain("product_pr33_enqueue_google_calendar_write");
    expect(sql).toContain("product_pr33_enqueue_google_export_backfill");
    expect(sql).toContain("'manual_backfill'");
    expect(sql).toContain("pg_notify('calendar_sync_jobs'");
    expect(read("lib/calendar-sync/domain.ts")).toContain("CALENDAR_SYNC_POLL_MINUTES = 5");
  });

  it("replaces busy windows atomically and extends the database slot guard", () => {
    const sql = readFileSync(join(migrationsDirectory, migrationName!), "utf8").toLowerCase();
    expect(sql).toContain("product_pr33_replace_calendar_busy_blocks");
    expect(sql).toContain("perform private.pr20_lock_barber_timeline(p_barber_id)");
    expect(sql).toMatch(/delete from public\.calendar_busy_blocks[\s\S]*insert into public\.calendar_busy_blocks/);
    expect(sql).toContain("grant execute on function public.product_pr33_replace_calendar_busy_blocks");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("create or replace function private.pr20_slot_is_free");
    expect(sql).toContain("from public.chairsync_appointments c");
    expect(sql).toContain("from public.calendar_busy_blocks busy");
    expect(sql).toContain("product_pr33_lock_square_timeline");
  });

  it("wakes the outbox each minute while provider rows retain five-minute due gates", () => {
    const config = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons).toContainEqual({
      path: "/api/calendar-sync/scheduled",
      schedule: "* * * * *"
    });
    expect(read("lib/calendar-sync/worker.ts")).toContain("next_poll_at");
  });
});
