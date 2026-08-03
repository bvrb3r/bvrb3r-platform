import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260729171000_product_pr26_rent_operations_advisor_hardening.sql"
  ),
  "utf8"
).replace(/\s+/g, " ").toLowerCase();

describe("Product PR26 advisor hardening", () => {
  it("covers every new profile and agreement foreign key", () => {
    expect(migration).toContain("rent_autopay_preferences (updated_by_profile_id)");
    expect(migration).toContain("rent_payment_requests (agreement_id)");
    expect(migration).toContain("rent_payment_requests (requested_by_profile_id)");
    expect(migration).toContain("rent_line_disputes (agreement_id)");
    expect(migration).toContain("rent_line_disputes (submitted_by_profile_id)");
    expect(migration).toContain("rent_lifecycle_requests (requested_by_profile_id)");
  });

  it("keeps assigned-barber coverage after a chair retires", () => {
    expect(migration).toContain(
      "shop_chairs_assigned_barber_cover_idx on public.shop_chairs (assigned_barber_id)"
    );
    expect(migration).not.toContain(
      "shop_chairs_assigned_barber_cover_idx on public.shop_chairs (assigned_barber_id) where"
    );
  });
});
