import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static proof for the PR 19 identity/authorization migration.
 *
 * There is no live database in this environment, so the established pattern in
 * this repository (see the rls-batch-* specs) is to assert against the
 * migration SQL itself. That catches the class of defect this change exists to
 * fix: a grant or a policy that says less than it appears to.
 *
 * The migration file is located by its CLI-generated suffix rather than by a
 * hard-coded name, so the test binds to the artefact
 * `supabase migration new pr19_identity_authorization_foundation` actually
 * produced. A hand-authored timestamp would both defeat that and risk ordering
 * incorrectly against migrations generated later.
 */

const MIGRATION_DIR = path.join(process.cwd(), "supabase", "migrations");
const MIGRATION_SUFFIX = "_pr19_identity_authorization_foundation.sql";

const matches = readdirSync(MIGRATION_DIR).filter((name) => name.endsWith(MIGRATION_SUFFIX));
if (matches.length !== 1) {
  throw new Error(
    `Expected exactly one PR 19 migration ending in "${MIGRATION_SUFFIX}", found ${matches.length}: ${matches.join(", ")}`
  );
}

const MIGRATION_NAME = matches[0];
const sql = readFileSync(path.join(MIGRATION_DIR, MIGRATION_NAME), "utf8");

/**
 * Executable SQL only. The header explains *why* `auth.role()` is avoided, so a
 * naive scan of the raw file would flag its own documentation.
 */
const executableSql = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const flat = executableSql.replace(/\s+/g, " ").toLowerCase().trim();

describe("PR 19 migration hygiene", () => {
  it("carries a CLI-generated timestamped filename", () => {
    // `supabase migration new` mints YYYYMMDDHHMMSS_<name>.sql. Anything else
    // means the filename was hand-authored.
    expect(MIGRATION_NAME).toMatch(/^\d{14}_pr19_identity_authorization_foundation\.sql$/);
  });

  /**
   * Originally "applies last", which was true when PR 19 was the newest
   * migration and is no longer the invariant worth holding — later PRs add
   * migrations that must sort after it. What still has to be true is that PR 19
   * applies after everything that predates it, because it hardens tables those
   * migrations created.
   */
  it("sorts after every migration that predates it", () => {
    const all = readdirSync(MIGRATION_DIR).filter((name) => name.endsWith(".sql")).sort();
    const index = all.indexOf(MIGRATION_NAME);

    expect(index).toBeGreaterThan(0);
    expect(all[index - 1]).toBe("20260727120100_autobooth_rent_doctrine_lock.sql");
  });

  it("leaves no duplicate or leftover draft copy of the same SQL", () => {
    expect(readdirSync(MIGRATION_DIR).filter((name) => name.endsWith(MIGRATION_SUFFIX))).toHaveLength(1);
    const plans = readdirSync(path.join(process.cwd(), "supabase", "migration-plans"));
    expect(plans, "the draft plan must be removed once the migration exists").not.toContain(
      "pr19_identity_authorization_foundation.sql"
    );
  });

  it("is wrapped in a single transaction", () => {
    expect(flat.startsWith("begin;"), "SQL does not open with begin;").toBe(true);
    expect(flat.endsWith("commit;"), "SQL does not close with commit;").toBe(true);
  });

  it("never uses auth.role() for authorization", () => {
    expect(flat).not.toContain("auth.role()");
  });

  it("does not weaken any table by disabling row level security", () => {
    expect(flat).not.toContain("disable row level security");
  });
});

describe("profiles role escalation is closed", () => {
  it("revokes the table-wide UPDATE grant that allowed the escalation", () => {
    expect(flat).toContain("revoke update on public.profiles from authenticated");
  });

  it("re-grants UPDATE only on non-authority columns", () => {
    const grant = flat.match(/grant update \(([^)]*)\) on public\.profiles to authenticated/);
    expect(grant, "column-level UPDATE grant is missing").not.toBeNull();

    const columns = grant![1].split(",").map((column) => column.trim());
    expect(columns).toContain("full_name");
    expect(columns).toContain("phone");

    // The whole point: authority columns must not appear in the grant list.
    for (const forbidden of ["role", "primary_onboarding_role", "public_username", "id"]) {
      expect(columns, `authority column "${forbidden}" is self-updatable`).not.toContain(forbidden);
    }
  });

  it("keeps the self-update policy pinned with both USING and WITH CHECK", () => {
    const policy = flat.match(/create policy profiles_update_own on public\.profiles for update (.*?);/);
    expect(policy).not.toBeNull();
    expect(policy![1]).toContain("using (auth.uid() = id)");
    expect(policy![1]).toContain("with check (auth.uid() = id)");
  });

  it("installs a BEFORE INSERT OR UPDATE guard trigger on profiles", () => {
    expect(flat).toContain("create trigger pr19_guard_profile_authority before insert or update on public.profiles");
    expect(flat).toContain("execute function private.pr19_guard_profile_authority()");
  });

  it("blocks role and onboarding-role changes in the guard", () => {
    expect(flat).toContain("new.role is distinct from old.role");
    expect(flat).toContain("profile_role_change_forbidden");
    expect(flat).toContain("new.primary_onboarding_role is distinct from old.primary_onboarding_role");
    expect(flat).toContain("new.public_username is distinct from old.public_username");
  });

  it("blocks privileged roles at the INSERT bootstrap too", () => {
    expect(flat).toContain("profile_role_not_self_assignable");
    expect(flat).toContain("private.pr19_is_self_selectable_role(new.role::text)");
  });

  it("treats only the three public lanes plus legacy values as self-selectable", () => {
    const fn = flat.match(/create or replace function private\.pr19_is_self_selectable_role.*?\$\$(.*?)\$\$/);
    expect(fn).not.toBeNull();
    const body = fn![1];

    for (const allowed of ["'client_user'", "'barber_user'", "'shop_owner_user'"]) {
      expect(body).toContain(allowed);
    }
    for (const denied of ["'platform_admin'", "'architect'", "'owner'", "'manager'", "'front_desk'"]) {
      expect(body, `${denied} must not be self-selectable`).not.toContain(denied);
    }
  });

  it("exempts only the service role, and does so without auth.role()", () => {
    expect(flat).toContain("private.pr19_actor_is_trusted_writer()");
    expect(flat).toContain("current_user in ('service_role', 'supabase_admin', 'postgres')");
  });
});

describe("SECURITY DEFINER hygiene", () => {
  const definerBlocks = sql
    .split(/create or replace function/i)
    .slice(1)
    .filter((block) => /security definer/i.test(block));

  it("keeps every SECURITY DEFINER function in the non-exposed private schema", () => {
    expect(definerBlocks.length).toBeGreaterThan(0);
    for (const block of definerBlocks) {
      expect(block.trim().startsWith("private.")).toBe(true);
    }
  });

  it("pins search_path on every function it defines", () => {
    const functions = sql.split(/create or replace function/i).slice(1);
    for (const block of functions) {
      const name = block.trim().split(/[(\s]/)[0];
      expect(/set search_path =/i.test(block), `${name} has no fixed search_path`).toBe(true);
    }
  });

  it("revokes PUBLIC execute on every function it defines", () => {
    const names = [...sql.matchAll(/create or replace function (private\.[a-z0-9_]+)/gi)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const revoked = new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\s*\\([^)]*\\) from public`, "i");
      expect(revoked.test(sql), `${name} does not revoke PUBLIC execute`).toBe(true);
    }
  });

  it("keeps the private schema unreachable from anon", () => {
    expect(flat).toContain("revoke all on schema private from public, anon");
  });
});

describe("POS Data API exposure is closed", () => {
  const posTables = ["pos_sales", "pos_sale_items", "pos_payment_requests"];

  it.each(posTables)("enables row level security on %s", (table) => {
    expect(flat).toContain(`alter table if exists public.${table} enable row level security`);
  });

  it.each(posTables)("revokes anon and authenticated privileges on %s", (table) => {
    expect(flat).toContain(`revoke all on public.${table} from anon, authenticated`);
  });

  it.each(posTables)("grants %s to the service role only", (table) => {
    expect(flat).toContain(`on public.${table} to service_role`);
    expect(flat).not.toMatch(new RegExp(`grant [^;]*on public\\.${table} to (anon|authenticated)`));
  });

  it("adds no client policy, so the tables deny by default until PR 22", () => {
    for (const table of posTables) {
      expect(flat).not.toContain(`create policy on public.${table}`);
      expect(flat).not.toMatch(new RegExp(`create policy [a-z0-9_"]+ on public\\.${table}`));
    }
  });
});

describe("identity audit spine", () => {
  it("creates the append-only table with the required identity columns", () => {
    expect(flat).toContain("create table if not exists public.identity_audit_events");
    for (const column of [
      "actor_user_id",
      "effective_role",
      "internal_access",
      "correlation_id",
      "session_id",
      "source",
      "entity_type",
      "action",
      "outcome",
      "metadata"
    ]) {
      expect(flat, `audit column ${column} is missing`).toContain(column);
    }
  });

  it("enables RLS and denies anon and authenticated outright", () => {
    expect(flat).toContain("alter table public.identity_audit_events enable row level security");
    expect(flat).toContain("revoke all on public.identity_audit_events from anon, authenticated");
    expect(flat).toContain("grant select, insert on public.identity_audit_events to service_role");
  });

  it("grants no UPDATE or DELETE to anyone, including the service role", () => {
    expect(flat).not.toMatch(/grant [^;]*(update|delete)[^;]*on public\.identity_audit_events/);
  });

  it("enforces append-only in the database, not by convention", () => {
    expect(flat).toContain("create trigger pr19_identity_audit_append_only before update or delete on public.identity_audit_events");
    expect(flat).toContain("identity_audit_events_is_append_only");
  });
});

/**
 * Repository-wide invariant.
 *
 * `pos_sales`, `pos_sale_items` and `pos_payment_requests` were the only public
 * tables ever created without `enable row level security`, and the repository
 * has no `alter default privileges` statement, so Supabase's defaults had left
 * `anon` and `authenticated` holding privileges on money records. This
 * migration closes that, and this assertion keeps the next one from appearing.
 */
describe("repository-wide RLS coverage", () => {
  it("leaves no public table created without row level security", () => {
    const files = readdirSync(MIGRATION_DIR).filter((name) => name.endsWith(".sql")).sort();
    const created = new Map<string, string>();
    const enabled = new Set<string>();

    for (const file of files) {
      const contents = readFileSync(path.join(MIGRATION_DIR, file), "utf8");
      for (const match of contents.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.["']?([a-z0-9_]+)["']?/gi
      )) {
        if (!created.has(match[1])) {
          created.set(match[1], file);
        }
      }
      for (const match of contents.matchAll(
        /alter\s+table\s+(?:if\s+exists\s+)?public\.["']?([a-z0-9_]+)["']?\s+enable\s+row\s+level\s+security/gi
      )) {
        enabled.add(match[1]);
      }
    }

    const missing = [...created.keys()].filter((table) => !enabled.has(table)).sort();
    expect(
      missing,
      `public tables with no RLS: ${missing.map((t) => `${t} (${created.get(t)})`).join(", ")}`
    ).toEqual([]);
  });
});

describe("anon reaches no protected surface", () => {
  it("is revoked on identity, audit, and POS-money tables", () => {
    for (const table of ["profiles", "identity_audit_events", "pos_sales", "pos_sale_items", "pos_payment_requests"]) {
      expect(flat, `anon is not revoked on ${table}`).toMatch(
        new RegExp(`revoke all on public\\.${table} from [^;]*anon`)
      );
    }
  });

  it("is granted nothing anywhere in this migration", () => {
    expect(flat).not.toMatch(/grant [^;]*to [^;]*\banon\b/);
  });

  it("cannot reach the private schema that holds the predicates", () => {
    expect(flat).toContain("revoke all on schema private from public, anon");
    expect(flat).toMatch(/grant usage on schema private to authenticated/);
  });
});

describe("SECURITY DEFINER search_path cannot be shadowed", () => {
  it("pins definer functions to pg_catalog without a writable schema", () => {
    const blocks = sql.split(/create or replace function/i).slice(1).filter((b) => /security definer/i.test(b));
    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      const name = block.trim().split(/[(\s]/)[0];
      const searchPath = block.match(/set search_path\s*=\s*([^\n]+)/i)?.[1] ?? "";
      expect(searchPath, `${name} has no search_path`).not.toBe("");
      // `public` is writable in this project, so a definer function that
      // resolves through it can be made to call someone else's object.
      expect(searchPath.toLowerCase(), `${name} resolves through public`).not.toMatch(/\bpublic\b/);
    }
  });
});
