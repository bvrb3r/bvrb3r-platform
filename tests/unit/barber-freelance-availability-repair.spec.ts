import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/api/barber/activation/route.ts", "utf8");

describe("barber freelance availability repair", () => {
  it("delegates activation availability replacement to the atomic server RPC", () => {
    expect(source).toContain('supabase.rpc("pr40_replace_barber_availability"');
    expect(source).toContain('locationMode: "freelance"');
    expect(source).toContain('locationMode: "shop"');
    expect(source).not.toMatch(/from\("availability_rules"\)\s*\.delete\(\)/);
    expect(source).toContain("location_active: true");
  });
});
