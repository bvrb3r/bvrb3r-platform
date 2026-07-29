import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = path.join(process.cwd(), "supabase", "migrations");
const matches = readdirSync(migrationDir).filter((name) =>
  name.endsWith("_product_pr25_owner_operations.sql")
);

if (matches.length !== 1) {
  throw new Error(`Expected one Product PR25 migration, found: ${matches.join(", ")}`);
}

const migrationName = matches[0];
const sql = readFileSync(path.join(migrationDir, migrationName), "utf8");
const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const flat = executable.replace(/\s+/g, " ").toLowerCase().trim();

describe("Product PR25 owner-operations migration", () => {
  it("is forward-only and transactional", () => {
    expect(migrationName).toMatch(/^\d{14}_product_pr25_owner_operations\.sql$/);
    expect(flat.startsWith("begin;")).toBe(true);
    expect(flat.endsWith("commit;")).toBe(true);
  });

  it("removes owner and manager access to barber money", () => {
    for (const policy of [
      "payments shop staff select",
      "tips shop staff select",
      "tips shop staff insert",
      "payment routing management select",
      "owner analytics owner or manager read",
      "barber revenue snapshots owner manager select"
    ]) {
      expect(flat).toContain(`drop policy if exists "${policy}"`);
    }
    expect(flat).not.toMatch(/create policy[^;]+(?:payments|tips|payment_routing_records)[^;]+(?:owner|manager)/);
  });

  it.each([
    "shop_floor_controls",
    "shop_chairs",
    "owner_clientbridge_daily_aggregates"
  ])("keeps %s server-written and protected by RLS", (table) => {
    expect(flat).toContain(`alter table public.${table} enable row level security`);
    expect(flat).toContain(`revoke all on public.${table} from public, anon, authenticated`);
    expect(flat).not.toMatch(new RegExp(`grant (?:insert|update|delete)[^;]+public\\.${table}[^;]+authenticated`));
  });

  it("enforces settle-first relationship and chair retirement", () => {
    expect(flat).toContain("create trigger pr25_settle_first_guard");
    expect(flat).toContain("open booth rent must be settled, waived, or resolved");
    expect(flat).toContain("create trigger pr25_chair_retirement_guard");
    expect(flat).toContain("open booth rent must be settled before retiring this assigned chair");
  });

  it("revokes kiosk sessions immediately and records an audit event", () => {
    expect(flat).toContain("create trigger pr25_kiosk_emergency_disable");
    expect(flat).toContain("update public.kiosk_sessions set status = 'revoked'");
    expect(flat).toContain("'kiosk_emergency_disabled'");
    expect(flat).toContain("previous_state");
    expect(flat).toContain("next_state");
  });

  it("audits cash walk-in reassignment and notifies both barbers", () => {
    expect(flat).toContain("create trigger pr25_queue_reassignment_notice");
    expect(flat).toContain("set action = 'reassignment'");
    expect(flat).toContain("where b.id in (old.barber_id, new.barber_id)");
    expect(flat).toContain("reason: ' || trim(new.last_mutation_reason)");
  });

  it("exposes only a privacy-safe floor projection", () => {
    const view = flat.slice(flat.indexOf("create or replace view public.owner_floor_queue"));
    expect(view).toContain("security_invoker = true");
    expect(view).toContain("security_barrier = true");
    for (const forbidden of [
      "client_note",
      "tip_amount",
      "total_amount",
      "balance_due",
      "email",
      "phone"
    ]) {
      expect(view).not.toContain(forbidden);
    }
  });

  it("uses scoped access checks and indexed tenant keys", () => {
    expect(flat).toContain("(select private.has_shop_operator_access(");
    expect(flat).toContain("shop_floor_controls_location_idx");
    expect(flat).toContain("shop_chairs_location_idx");
    expect(flat).toContain("owner_clientbridge_location_idx");
  });
});
