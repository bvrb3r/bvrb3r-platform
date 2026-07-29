import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_DIR = path.join(process.cwd(), "supabase", "migrations");
const MIGRATION_SUFFIX = "_pr23_queue_clientbridge_truth.sql";
const matches = readdirSync(MIGRATION_DIR).filter((name) => name.endsWith(MIGRATION_SUFFIX));

if (matches.length !== 1) {
  throw new Error(`Expected one Product PR23 migration, found: ${matches.join(", ")}`);
}

const migrationName = matches[0];
const sql = readFileSync(path.join(MIGRATION_DIR, migrationName), "utf8");
const chairsyncReadMigration = readFileSync(
  path.join(MIGRATION_DIR, "20260728233100_pr23_chairsync_authenticated_read.sql"),
  "utf8"
);
const externalServiceMigration = readFileSync(
  path.join(MIGRATION_DIR, "20260728233200_pr23_external_service_snapshot.sql"),
  "utf8"
);
const queueProjectionTypeMigration = readFileSync(
  path.join(MIGRATION_DIR, "20260728233300_pr23_queue_projection_shop_type.sql"),
  "utf8"
);
const rejoinOwnershipMigration = readFileSync(
  path.join(MIGRATION_DIR, "20260728233400_pr23_rejoin_ownership_snapshot.sql"),
  "utf8"
);
const legacyRequestedDateMigration = readFileSync(
  path.join(MIGRATION_DIR, "20260728233500_pr23_legacy_requested_date_default.sql"),
  "utf8"
);
const quietHoursCastMigration = readFileSync(
  path.join(MIGRATION_DIR, "20260728233600_pr23_quiet_hours_time_cast.sql"),
  "utf8"
);
const foreignKeyIndexMigration = readFileSync(
  path.join(MIGRATION_DIR, "20260728233700_pr23_foreign_key_indexes.sql"),
  "utf8"
);
const consolidatedPolicyMigration = readFileSync(
  path.join(MIGRATION_DIR, "20260728233800_pr23_consolidated_read_policies.sql"),
  "utf8"
);
const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const flat = executable.replace(/\s+/g, " ").toLowerCase().trim();

const newTables = [
  "chairsync_appointments",
  "queue_mutation_audit",
  "clientbridge_consent_events",
  "clientbridge_invitations",
  "client_activation_verifications",
  "notification_delivery_ledger",
  "notification_consent_events"
];

function tableDefinition(table: string) {
  const match = executable.match(new RegExp(
    `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
    "i"
  ));
  return match?.[1]?.toLowerCase() ?? "";
}

describe("Product PR23 migration hygiene", () => {
  it("is timestamped, transactional, and follows the Product PR22 contract", () => {
    expect(migrationName).toMatch(/^\d{14}_pr23_queue_clientbridge_truth\.sql$/);
    const pr22 = readdirSync(MIGRATION_DIR).find((name) =>
      name.endsWith("_pr22_booth_rent_contract.sql")
    );
    expect(pr22).toBeDefined();
    expect(migrationName > pr22!).toBe(true);
    expect(flat.startsWith("begin;")).toBe(true);
    expect(flat.endsWith("commit;")).toBe(true);
  });

  it("uses the PR19 trusted-writer predicate instead of JWT metadata authorization", () => {
    expect(flat).toContain("private.pr19_actor_is_trusted_writer()");
    expect(flat).not.toContain("auth.role()");
    expect(flat).not.toContain("user_metadata");
    expect(flat).not.toContain("app_metadata");
    expect(flat).not.toContain("raw_user_meta_data");
  });

  it.each(newTables)("protects %s with RLS and explicit grants", (table) => {
    expect(flat).toContain(`alter table public.${table} enable row level security`);
    expect(flat).toContain(`revoke all on public.${table} from public, anon, authenticated`);
    expect(flat).toMatch(new RegExp(`grant [^;]+ on public\\.${table} to service_role`));
  });

  it("keeps every new write server-side", () => {
    expect(flat).not.toMatch(/grant (insert|update|delete)[^;]+to authenticated/);
    expect(flat).not.toMatch(/grant [^;]+to anon/);
    expect(flat).toContain("revoke insert, update, delete on public.waitlist_entries from authenticated");
  });
});

describe("one canonical queue record", () => {
  it("stores server position, wait, reason, version, and sync time", () => {
    for (const column of [
      "canonical_position",
      "estimated_wait_minutes",
      "wait_reason",
      "wait_version",
      "last_synced_at"
    ]) {
      expect(flat).toContain(column);
    }
    expect(flat).toContain("row_number() over (order by w.created_at, w.id)");
    expect(flat).toContain("coalesce(s.duration_min, 30) + coalesce(s.buffer_min, 0)");
    expect(flat).toContain("pg_catalog.pg_advisory_xact_lock");
  });

  it("joins active chair capacity through the canonical location UUID", () => {
    const projectionFix = queueProjectionTypeMigration.replace(/\s+/g, " ").toLowerCase();
    expect(projectionFix).toContain("where bs.current_shop_id = l.id");
    expect(projectionFix).not.toContain("l.id::text");
  });

  it("makes queue joins idempotent and permits only one live visit per client/shop", () => {
    expect(flat).toContain("create unique index if not exists waitlist_entries_idempotency_uidx");
    expect(flat).toContain("on public.waitlist_entries (location_id, idempotency_key)");
    expect(flat).toContain("create unique index if not exists waitlist_entries_one_live_client_uidx");
    expect(flat).toContain("where status in ('active', 'called', 'assigned')");
  });

  it("preserves source, service snapshot, payment owner, entry type, and barber on rejoin", () => {
    const rejoin = rejoinOwnershipMigration.replace(/\s+/g, " ").toLowerCase();
    expect(rejoin).toContain("original_row.entry_type");
    expect(rejoin).toContain("original_row.source_provider");
    expect(rejoin).toContain("original_row.source_service_name");
    expect(rejoin).toContain("original_row.payment_owner");
    expect(rejoin).toContain("original_row.barber_id");
    expect(rejoin).toContain("requested_date, preferred_date");
  });

  it("keeps the required legacy queue date safe for older callers", () => {
    expect(legacyRequestedDateMigration.replace(/\s+/g, " ").toLowerCase())
      .toContain("alter column requested_date set default current_date");
  });

  it("audits actor, time, previous/new state, reason, barber, and version", () => {
    const audit = tableDefinition("queue_mutation_audit");
    for (const column of [
      "actor_profile_id",
      "previous_status",
      "new_status",
      "previous_public_state",
      "new_public_state",
      "previous_barber_id",
      "new_barber_id",
      "reason text not null",
      "previous_version",
      "new_version",
      "occurred_at"
    ]) {
      expect(audit).toContain(column);
    }
  });

  it("locks booked and non-cash assignments and requires a reassignment reason", () => {
    expect(flat).toContain("new.entry_type = 'booked' or new.payment_owner <> 'bvrb3r_cash'");
    expect(flat).toContain("old.entry_type <> 'walkin'");
    expect(flat).toContain("old.payment_owner <> 'bvrb3r_cash'");
    expect(flat).toContain("cash walk-in reassignment requires an audit reason");
  });

  it("gives each authenticated relationship its own scoped read policy", () => {
    expect(flat).toContain("private.is_booking_client(client_id)");
    expect(flat).toContain("private.is_booking_barber(barber_id)");
    expect(flat).toContain("private.is_booking_shop_operator(location_id)");
    expect(flat).toContain("private.is_booking_platform_admin()");
  });

  it("consolidates relationship reads into one policy per realtime table", () => {
    const policies = consolidatedPolicyMigration.replace(/\s+/g, " ").toLowerCase();
    expect(policies).toContain('create policy "pr23 waitlist relationship read"');
    expect(policies).toContain('create policy "pr23 chairsync relationship read"');
    expect(policies).toContain('create policy "pr23 delivery relationship read"');
    expect(policies.match(/create policy/g)).toHaveLength(3);
  });

  it("covers every PR23 foreign key reported by the staging advisor", () => {
    const indexes = foreignKeyIndexMigration.replace(/\s+/g, " ").toLowerCase();
    for (const column of [
      "checked_in_waitlist_entry_id",
      "linked_client_id",
      "chairsync_appointment_id",
      "claimed_profile_id",
      "consent_event_id",
      "waitlist_entry_id",
      "clientbridge_invitation_id",
      "notification_id",
      "new_barber_id",
      "previous_barber_id",
      "last_mutated_by",
      "rejoin_of_entry_id"
    ]) {
      expect(indexes).toContain(`(${column})`);
    }
  });
});

describe("ChairSync and financial separation", () => {
  it("stores provider appointment truth without external amount columns", () => {
    const chairsync = tableDefinition("chairsync_appointments");
    expect(chairsync).toContain("provider_appointment_id");
    expect(chairsync).toContain("payment_owner text not null");
    expect(chairsync).toContain("provider_data_restricted");
    expect(chairsync).not.toMatch(/\b(amount|price|fee|tip|revenue|subtotal|total)_/);
  });

  it("requires external payment ownership to match the source", () => {
    expect(flat).toContain("payment_owner = 'external:' || provider");
    expect(flat).toContain("payment_owner = 'external:' || source_provider");
    expect(flat).toContain("external_financial_data_private");
  });

  it("keeps an imported service label without manufacturing a native service", () => {
    const serviceSnapshot = externalServiceMigration.replace(/\s+/g, " ").toLowerCase();
    expect(serviceSnapshot).toContain("alter column service_id drop not null");
    expect(serviceSnapshot).toContain("add column if not exists source_service_name text");
    expect(serviceSnapshot).not.toMatch(/\b(price|amount|fee|tip|revenue)_/);
  });

  it("makes scoped ChairSync RLS policies usable without granting writes", () => {
    const readGrant = chairsyncReadMigration.replace(/\s+/g, " ").toLowerCase();
    expect(readGrant).toContain("grant select on public.chairsync_appointments to authenticated");
    expect(readGrant).not.toMatch(/grant (insert|update|delete)/);
    expect(readGrant).toContain("alter table public.chairsync_appointments replica identity full");
    expect(readGrant).toContain("alter publication supabase_realtime add table public.chairsync_appointments");
  });
});

describe("ClientBridge lifecycle", () => {
  it("requires explicit consent and suppresses restricted, declined, or over-cap invitations", () => {
    expect(flat).toContain("c.consent_kind = 'clientbridge_invite'");
    expect(flat).toContain("and c.granted");
    expect(flat).toContain("provider_restriction");
    expect(flat).toContain("prior_decline");
    expect(flat).toContain("frequency_limit");
    expect(flat).toContain("now() - interval '60 days'");
    expect(flat).toContain("recent_invites >= 2");
  });

  it("issues a hashed 72-hour, single-use activation capability", () => {
    expect(flat).toContain("result_expiry := now() + interval '72 hours'");
    expect(flat).toContain("private.pr22_sha256(token_value)");
    expect(flat).toContain("if invitation_row.status = 'claimed'");
    expect(flat).toContain("activation link already used");
  });

  it("merges native appointments, queue history, imported appointments, and consent", () => {
    expect(flat).toContain("update public.appointments set client_id = target_client_id");
    expect(flat).toContain("update public.waitlist_entries set client_id = target_client_id");
    expect(flat).toContain("update public.chairsync_appointments set linked_client_id = target_client_id");
    expect(flat).toContain("update public.clientbridge_consent_events set client_id = target_client_id");
  });
});

describe("privacy-safe status and notification recovery", () => {
  it("reads a public queue row only through a hashed capability without contact fields", () => {
    const signature = executable.match(
      /create or replace function public\.pr23_get_public_queue_status[\s\S]*?revoke all on function public\.pr23_get_public_queue_status/i
    )?.[0]?.toLowerCase() ?? "";
    expect(signature).toContain("public_token_hash = private.pr22_sha256(p_token)");
    expect(signature).not.toContain("client_phone");
    expect(signature).not.toContain("client_email");
    expect(signature).not.toContain("full_name");
  });

  it("enforces server quiet hours for non-operational delivery only", () => {
    expect(flat).toContain("if new.operational or new.profile_id is null");
    expect(flat).toContain("new.status := 'scheduled'");
    expect(flat).toContain("new.scheduled_for := quiet_end at time zone preference_row.quiet_hours_timezone");
    const quietHours = quietHoursCastMigration.replace(/\s+/g, " ").toLowerCase();
    expect(quietHours).toContain("preference_row.quiet_hours_start::time");
    expect(quietHours).toContain("preference_row.quiet_hours_end::time");
  });

  it("makes queue and delivery evidence realtime-capable", () => {
    expect(flat).toContain("alter table public.waitlist_entries replica identity full");
    expect(flat).toContain("alter publication supabase_realtime add table public.notification_delivery_ledger");
  });
});
