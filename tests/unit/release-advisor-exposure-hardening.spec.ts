import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260803073827_release_advisor_exposure_hardening.sql",
  "utf8"
).toLowerCase();

describe("release advisor exposure hardening", () => {
  it("keeps PostGIS discovery behind the server-owned service role", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toMatch(/pr39_nearby_marketplace\([\s\S]*?\)\s+to service_role/);
  });

  it("replaces the signed-in billing privilege escalator with an actor-bound invoker", () => {
    expect(migration).toContain("drop function public.pr34_dispute_balance_line(uuid, text)");
    expect(migration).toContain("p_profile_id uuid");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("request.jwt.claim.role");
    expect(migration).toContain("profile_id = p_profile_id");
    expect(migration).toContain("grant execute on function public.pr34_dispute_balance_line(uuid, text, uuid)");
    expect(migration).not.toContain("to authenticated;");
  });
});
