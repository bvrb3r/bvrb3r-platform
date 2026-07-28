import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static proof for the PR 20 booking engine migration.
 *
 * There is no database in this environment — no Supabase stack, no local
 * Postgres — so nothing here claims to have executed SQL. It follows the
 * established pattern in this repository (the rls-batch-* and PR 19 specs) and
 * asserts against the migration text itself.
 *
 * That is a real check rather than a formality, because the defects this
 * migration exists to prevent are all visible in the SQL: a table that reaches
 * the Data API because nobody revoked the default grant, an exclusion constraint
 * that is missing so two callers can hold the same minute, a function that is
 * reachable by `anon`, a "snapshot" table that still has an UPDATE grant.
 *
 * What a static test cannot prove is runtime behaviour under real concurrency.
 * The locking design is asserted here structurally; the pure availability,
 * lifecycle and idempotency rules are exercised for real in the sibling specs.
 */

const MIGRATION_DIR = path.join(process.cwd(), "supabase", "migrations");
const MIGRATION_SUFFIX = "_pr20_booking_engine.sql";

const matches = readdirSync(MIGRATION_DIR).filter((name) => name.endsWith(MIGRATION_SUFFIX));
if (matches.length !== 1) {
  throw new Error(
    `Expected exactly one PR 20 migration ending in "${MIGRATION_SUFFIX}", found ${matches.length}: ${matches.join(", ")}`
  );
}

const MIGRATION_NAME = matches[0];
const sql = readFileSync(path.join(MIGRATION_DIR, MIGRATION_NAME), "utf8");

/** Executable SQL only — the header documents what it avoids, so a raw scan
 * would flag the migration's own explanation of itself. */
const executableSql = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const flat = executableSql.replace(/\s+/g, " ").toLowerCase().trim();

const NEW_TABLES = [
  "barber_booking_policies",
  "booking_slot_holds",
  "booking_idempotency_records",
  "appointment_service_snapshots",
  "booking_attributions",
  "booking_events"
];

const ENGINE_FUNCTIONS = [
  "pr20_create_slot_hold",
  "pr20_release_slot_hold",
  "pr20_confirm_booking",
  "pr20_reschedule_booking",
  "pr20_cancel_booking"
];

describe("PR 20 migration hygiene", () => {
  it("carries a CLI-generated timestamped filename", () => {
    expect(MIGRATION_NAME).toMatch(/^\d{14}_pr20_booking_engine\.sql$/);
  });

  it("sorts after the PR 19 migration it builds on", () => {
    const pr19 = readdirSync(MIGRATION_DIR).find((name) =>
      name.endsWith("_pr19_identity_authorization_foundation.sql")
    );
    expect(pr19).toBeDefined();
    expect(MIGRATION_NAME > pr19!).toBe(true);
  });

  it("is wrapped in a single transaction", () => {
    expect(flat.startsWith("begin;")).toBe(true);
    expect(flat.endsWith("commit;")).toBe(true);
  });

  it("never uses auth.role() for authorization", () => {
    expect(flat).not.toContain("auth.role()");
  });

  it("never reads authorization from user or app metadata", () => {
    expect(flat).not.toContain("user_metadata");
    expect(flat).not.toContain("app_metadata");
    expect(flat).not.toContain("raw_user_meta_data");
  });

  it("does not weaken any table by disabling row level security", () => {
    expect(flat).not.toContain("disable row level security");
  });

  it("pins no extension version", () => {
    expect(flat).toContain("create extension if not exists btree_gist");
    expect(flat).not.toMatch(/create extension[^;]*version/);
  });
});

describe("every new table is explicitly granted and RLS-protected", () => {
  it.each(NEW_TABLES)("enables row level security on %s", (table) => {
    expect(flat).toContain(`alter table public.${table} enable row level security`);
  });

  it.each(NEW_TABLES)("revokes anon and authenticated on %s rather than relying on defaults", (table) => {
    expect(flat).toContain(`revoke all on public.${table} from anon, authenticated`);
  });

  it.each(NEW_TABLES)("grants %s to the service role only", (table) => {
    expect(flat).toMatch(new RegExp(`grant [^;]*on public\\.${table} to service_role`));
    expect(flat).not.toMatch(new RegExp(`grant [^;]*on public\\.${table} to [^;]*\\b(anon|authenticated)\\b`));
  });

  it.each(NEW_TABLES)("adds no blanket authenticated policy on %s", (table) => {
    const policies = [...flat.matchAll(new RegExp(`create policy [^;]*on public\\.${table}[^;]*;`, "g"))];
    for (const policy of policies) {
      expect(policy[0]).not.toContain("using (true)");
      expect(policy[0]).not.toContain("auth.role()");
    }
  });

  it("grants nothing at all to anon anywhere in the migration", () => {
    expect(flat).not.toMatch(/grant [^;]*to [^;]*\banon\b/);
  });
});

describe("race safety is structural, not an application check", () => {
  it("takes a per-barber advisory lock before touching a timeline", () => {
    expect(flat).toContain("pg_catalog.pg_advisory_xact_lock");
    for (const fn of ENGINE_FUNCTIONS.filter((name) => name !== "pr20_release_slot_hold")) {
      const body = extractFunction(fn);
      expect(body, `${fn} is missing`).not.toBeNull();
      if (fn === "pr20_cancel_booking") {
        // Cancelling frees a slot rather than claiming one, so it needs the row
        // lock and the revision check, not the timeline lock.
        expect(body!.toLowerCase()).toContain("for update");
        continue;
      }
      expect(body!.toLowerCase(), `${fn} does not lock the barber timeline`)
        .toContain("private.pr20_lock_barber_timeline");
    }
  });

  it("guards active holds with a GiST exclusion constraint, not a select-then-insert", () => {
    expect(flat).toContain("constraint booking_slot_holds_no_overlap_active exclude using gist");
    expect(flat).toContain("barber_id with =");
    expect(flat).toContain("tstzrange(starts_at, ends_at, '[)') with &&");
    expect(flat).toContain("where (status = 'active')");
  });

  it("treats an exclusion violation as a conflict rather than a success", () => {
    for (const fn of ["pr20_create_slot_hold", "pr20_confirm_booking", "pr20_reschedule_booking"]) {
      const body = extractFunction(fn)!.toLowerCase();
      expect(body, `${fn} does not handle exclusion_violation`).toContain("when exclusion_violation");
      expect(body).toContain("'outcome', 'conflict'");
    }
  });

  it("expires stale holds lazily under the lock so no cleanup job is required", () => {
    expect(flat).toContain("create or replace function private.pr20_expire_stale_holds");
    expect(flat).toContain("set status = 'expired'");
    expect(flat).toContain("expires_at <= pg_catalog.now()");

    for (const fn of ["pr20_create_slot_hold", "pr20_confirm_booking", "pr20_reschedule_booking"]) {
      expect(extractFunction(fn)!.toLowerCase(), `${fn} does not sweep stale holds`)
        .toContain("private.pr20_expire_stale_holds");
    }
  });

  it("ignores expired holds when deciding whether a slot is free", () => {
    const body = extractFunction("pr20_slot_is_free")!.toLowerCase();
    expect(body).toContain("h.status = 'active'");
    expect(body).toContain("h.expires_at > pg_catalog.now()");
    // A cancelled or no-show appointment must not keep a slot blocked.
    expect(body).toContain("a.status not in ('cancelled', 'no_show')");
    expect(body).toContain("public.blocked_times");
  });

  it("consumes a hold exactly once, checking the row count rather than assuming", () => {
    for (const fn of ["pr20_confirm_booking", "pr20_reschedule_booking"]) {
      const body = extractFunction(fn)!.toLowerCase();
      expect(body).toContain("set status = 'consumed'");
      expect(body).toContain("and status = 'active'");
      expect(body).toContain("get diagnostics v_consumed = row_count");
      expect(body).toContain("pr20_hold_consume_race");
    }
  });

  it("moves a reschedule with one UPDATE so the old slot is released exactly once", () => {
    const body = extractFunction("pr20_reschedule_booking")!.toLowerCase();
    const updates = [...body.matchAll(/update public\.appointments/g)];
    expect(updates).toHaveLength(1);
    expect(body).toContain("set starts_at = v_hold.starts_at");
    expect(body).toContain("ends_at = v_hold.ends_at");
    // The revision is re-checked in the UPDATE predicate itself, so a concurrent
    // writer cannot slip between the read and the write.
    expect(body).toContain("coalesce(lifecycle_revision, 1) = p_expected_revision");
  });
});

describe("idempotency", () => {
  it("scopes keys by operation and actor so callers cannot collide", () => {
    expect(flat).toContain("unique (scope, actor_key, idempotency_key)");
  });

  it("refuses a reused key that carries a different payload", () => {
    const body = extractFunction("pr20_claim_idempotency")!.toLowerCase();
    expect(body).toContain("v_fingerprint is distinct from p_request_fingerprint");
    expect(body).toContain("'mismatch'");

    for (const fn of ENGINE_FUNCTIONS.filter((name) => name !== "pr20_release_slot_hold")) {
      const engine = extractFunction(fn)!.toLowerCase();
      expect(engine, `${fn} does not refuse a mismatched key`).toContain("'outcome', 'idempotency_conflict'");
    }
  });

  it("replays the stored result for a matching key", () => {
    for (const fn of ENGINE_FUNCTIONS.filter((name) => name !== "pr20_release_slot_hold")) {
      const engine = extractFunction(fn)!.toLowerCase();
      expect(engine, `${fn} does not replay`).toContain("'state' = 'replay'");
    }
  });

  it("resolves the claim in a single statement rather than check-then-insert", () => {
    const body = extractFunction("pr20_claim_idempotency")!.toLowerCase();
    expect(body).toContain("on conflict (scope, actor_key, idempotency_key)");
    expect(body).toContain("(xmax = 0)");
  });
});

describe("snapshots and attribution are immutable", () => {
  it("withholds UPDATE and DELETE on the snapshot and attribution tables from every role", () => {
    for (const table of ["appointment_service_snapshots", "booking_attributions", "booking_events"]) {
      expect(flat).toContain(`grant select, insert on public.${table} to service_role`);
      expect(flat, `${table} is updatable`).not.toMatch(
        new RegExp(`grant [^;]*\\b(update|delete)\\b[^;]*on public\\.${table}`)
      );
    }
  });

  it("backs the withheld grants with a refusing trigger", () => {
    expect(flat).toContain("create or replace function private.pr20_reject_mutation");
    expect(flat).toContain("booking_record_is_append_only");
    expect(flat).toContain("create trigger pr20_append_only before update or delete on public.booking_events");
    expect(flat).toContain(
      "create trigger pr20_append_only before update or delete on public.appointment_service_snapshots"
    );
    expect(flat).toContain("create trigger pr20_attribution_immutable before update on public.booking_attributions");
  });

  it("bounds the attribution metadata it will store", () => {
    expect(flat).toContain("constraint booking_attributions_bounded check");
    expect(flat).toContain("char_length(coalesce(campaign_id, '')) <= 120");
    expect(flat).toContain("char_length(coalesce(referral_code, '')) <= 120");
  });

  it("closes the source door to a known set on both the hold and the attribution", () => {
    for (const door of [
      "'bvrb3r_app'",
      "'bvrb3r_web'",
      "'shop_profile'",
      "'barber_profile'",
      "'kiosk_shop'",
      "'kiosk_barber'",
      "'external_readonly'"
    ]) {
      expect(flat).toContain(door);
    }
    expect(flat).toContain("constraint booking_attributions_source_door_check");
    expect(flat).toContain("constraint booking_slot_holds_source_door_check");
  });

  it("snapshots the service in integer cents at confirmation", () => {
    const body = extractFunction("pr20_confirm_booking")!.toLowerCase();
    expect(body).toContain("insert into public.appointment_service_snapshots");
    expect(body).toContain("v_hold.service_price_cents");
    expect(body).toContain("v_hold.service_name");
    expect(body).toContain("v_hold.service_duration_min");
    // The catalog is read at hold time and never re-read at confirmation.
    expect(body).not.toContain("from public.services");
  });
});

describe("credential-shaped values never land in a row", () => {
  it("stores a hold token digest rather than the token", () => {
    expect(flat).toContain("token_hash text not null unique");
    expect(flat).not.toMatch(/\btoken text\b/);
  });

  it("stores an idempotency key digest on the event log, never the key", () => {
    expect(flat).toContain("idempotency_key_hash text");
    const events = flat.slice(flat.indexOf("create table if not exists public.booking_events"));
    expect(events.slice(0, 1500)).not.toMatch(/\bidempotency_key text\b/);
  });
});

describe("function reachability is explicit", () => {
  it.each(ENGINE_FUNCTIONS)("revokes %s from public, anon and authenticated", (fn) => {
    const revoked = new RegExp(`revoke all on function public\\.${fn}\\s*\\([^)]*\\) from public, anon, authenticated`);
    expect(revoked.test(flat), `${fn} does not revoke public/anon/authenticated execute`).toBe(true);
  });

  it.each(ENGINE_FUNCTIONS)("grants %s to the service role only", (fn) => {
    const granted = new RegExp(`grant execute on function public\\.${fn}\\s*\\([^)]*\\) to service_role`);
    expect(granted.test(flat), `${fn} is not granted to service_role`).toBe(true);
  });

  it("prefers SECURITY INVOKER for every engine entry point", () => {
    for (const fn of ENGINE_FUNCTIONS) {
      const body = extractFunction(fn)!.toLowerCase();
      expect(body, `${fn} is not SECURITY INVOKER`).toContain("security invoker");
      expect(body, `${fn} escalates privileges`).not.toContain("security definer");
    }
  });

  it("pins an empty search_path on every engine entry point", () => {
    for (const fn of ENGINE_FUNCTIONS) {
      const body = extractFunction(fn)!;
      expect(body, `${fn} has no pinned search_path`).toMatch(/set search_path\s*=\s*''/);
    }
  });

  it("pins search_path away from public on every private helper", () => {
    const helpers = [...sql.matchAll(/create or replace function (private\.[a-z0-9_]+)/gi)].map((match) => match[1]);
    expect(helpers.length).toBeGreaterThan(0);

    for (const helper of helpers) {
      const body = extractFunction(helper.replace("private.", ""))!;
      const searchPath = body.match(/set search_path\s*=\s*([^\n]+)/i)?.[1] ?? "";
      expect(searchPath, `${helper} has no search_path`).not.toBe("");
      expect(searchPath.toLowerCase(), `${helper} resolves through public`).not.toMatch(/\bpublic\b/);
    }
  });

  it("revokes PUBLIC execute on every private helper", () => {
    const helpers = [...sql.matchAll(/create or replace function (private\.[a-z0-9_]+)/gi)].map((match) => match[1]);
    for (const helper of helpers) {
      const revoked = new RegExp(`revoke all on function ${helper.replace(".", "\\.")}\\s*\\([^)]*\\) from public`, "i");
      expect(revoked.test(sql), `${helper} does not revoke PUBLIC execute`).toBe(true);
    }
  });

  it("keeps the private schema unreachable from anon", () => {
    expect(flat).toContain("revoke all on schema private from public, anon");
  });
});

describe("PR 20 takes no money and starts no later PR", () => {
  it("writes no payment row and captures no amount on confirmation", () => {
    const body = extractFunction("pr20_confirm_booking")!.toLowerCase();
    expect(body).not.toContain("insert into public.payments");
    expect(body).not.toContain("stripe");
    // The deposit stays zero: the price is recorded, not collected.
    expect(body).toContain("0, v_price, 0, v_price, 0");
  });

  it("refuses lifecycle states that belong to the queue domain", () => {
    const reschedule = extractFunction("pr20_reschedule_booking")!.toLowerCase();
    expect(reschedule).toContain("v_appointment.status not in ('pending', 'confirmed', 'booked')");
    expect(reschedule).toContain("'invalid_transition'");
  });

  it("touches no queue, rent or payout table", () => {
    for (const table of ["walk_in_queue", "waitlist_entries", "rent_", "payout", "pos_sales"]) {
      expect(flat, `migration reaches into ${table}`).not.toContain(`public.${table}`);
    }
  });
});

describe("service catalog contract", () => {
  it("adds integer cents as a generated column so it cannot drift from price", () => {
    expect(flat).toContain("add column if not exists price_cents integer generated always as ((price * 100)::integer) stored");
  });

  it("constrains duration, buffer and price without failing on legacy rows", () => {
    expect(flat).toContain("check (duration_min > 0) not valid");
    expect(flat).toContain("check (buffer_min >= 0) not valid");
    expect(flat).toContain("check (price >= 0) not valid");
  });
});

/**
 * Pulls one function body out of the migration. Splitting on the next
 * `create or replace function` keeps each assertion scoped to the function it
 * names, so a phrase present elsewhere in the file cannot satisfy it.
 */
function extractFunction(name: string): string | null {
  const pattern = new RegExp(
    `create or replace function (?:public|private)\\.${name}\\b[\\s\\S]*?(?=create or replace function |\\n-- =========|$)`,
    "i"
  );
  return sql.match(pattern)?.[0] ?? null;
}
