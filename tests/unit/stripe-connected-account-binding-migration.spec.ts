import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const foundationMigrationName = "20260813094058_stripe_connected_account_environment_bindings.sql";
const enforcementMigrationName = "20260813094100_enforce_stripe_connected_account_environment_bindings.sql";

const foundationMigration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    foundationMigrationName
  ),
  "utf8"
);
const enforcementMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", enforcementMigrationName),
  "utf8"
);

describe("Stripe connected-account binding migration", () => {
  it("preserves the connected-account row while resetting provider state", () => {
    const resetFunction = foundationMigration.slice(
      foundationMigration.indexOf("create or replace function public.reset_connected_account_provider_binding"),
      foundationMigration.indexOf("-- Extend the existing client-write guard")
    );

    expect(resetFunction).toContain("provider_account_generation = provider_account_generation + 1");
    expect(resetFunction).toContain("provider_account_id = null");
    expect(resetFunction).toContain("binding_status = 'archived'");
    expect(resetFunction).not.toMatch(/delete\s+from\s+public\.connected_accounts/i);
  });

  it("keeps provider history server-only and deletion-resistant", () => {
    expect(foundationMigration).toContain("on delete restrict");
    expect(foundationMigration).toContain("enable row level security");
    expect(foundationMigration).toContain("revoke all on table public.connected_account_provider_bindings");
    expect(foundationMigration).toContain("grant select on table public.connected_account_provider_bindings");
  });

  it("keeps the schema-first foundation compatible with the previous application build", () => {
    expect(foundationMigrationName.localeCompare(enforcementMigrationName)).toBeLessThan(0);
    expect(foundationMigration).toContain("register_connected_account_provider_binding");
    expect(foundationMigration).toContain("reset_connected_account_provider_binding");
    expect(foundationMigration).toContain("protect_connected_account_provider_payout_fields");
    expect(foundationMigration).not.toContain("enforce_connected_account_provider_binding_invariant");
    expect(foundationMigration).not.toContain(
      "create trigger enforce_connected_account_provider_binding_invariant"
    );
  });

  it("enforces every provider-binding transition after the compatible deployment window", () => {
    const invariantFunction = enforcementMigration;

    expect(invariantFunction).toContain("security definer");
    expect(invariantFunction).toContain("if tg_op = 'INSERT'");
    expect(invariantFunction).toContain("new.provider_account_generation <> 0");
    expect(invariantFunction).toContain(
      "new.provider_account_generation = old.provider_account_generation + 1"
    );
    expect(invariantFunction).toContain("binding.binding_status = 'archived'");
    expect(invariantFunction).toContain("binding.binding_status = 'active'");
    expect(invariantFunction).toContain("binding.connected_account_id = new.id");
    expect(invariantFunction).toContain("binding.provider = new.provider");
    expect(invariantFunction).toContain("binding.provider_account_id = new.provider_account_id");
    expect(invariantFunction).toContain("binding.provider_environment = new.provider_environment");
    expect(invariantFunction).toContain(
      "binding.binding_generation = new.provider_account_generation"
    );
    expect(invariantFunction).toContain("old.provider_environment is null");
    expect(invariantFunction).not.toContain("current_user::text in");
    expect(invariantFunction).not.toContain("request_role in");
    expect(invariantFunction).toContain(
      "create trigger enforce_connected_account_provider_binding_invariant"
    );
    expect(enforcementMigration).not.toContain("alter table public.connected_accounts");
    expect(enforcementMigration).not.toContain("register_connected_account_provider_binding");
  });
});
