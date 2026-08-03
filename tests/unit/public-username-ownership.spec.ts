import { readFileSync } from "fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createSupabaseAdminClientMock,
  isSupabaseEnabledMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: isSupabaseEnabledMock,
  runtimeConfig: { mediaBucket: "profile-media" }
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import {
  CANONICAL_SHOP_ROUTE_USERNAME_RESERVATIONS,
  checkPublicUsernameAvailability
} from "@/lib/profile/service";

const canonicalShopRouteReservations = [
  "ai",
  "analytics",
  "bridge",
  "chairfill",
  "chairs",
  "floor",
  "home",
  "identity",
  "kiosk",
  "messages",
  "money",
  "more",
  "policies",
  "rent",
  "reports",
  "schedule",
  "switch",
  "sync",
  "team",
  "tv",
  "verify"
] as const;

const canonicalReservationMigration =
  "supabase/migrations/20260803073109_reserve_canonical_shop_route_usernames.sql";

function createRegistrySupabaseMock(row: { owner_type: string; owner_id: string; username: string } | null) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "public_usernames") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: row, error: null }))
          }))
        }))
      };
    })
  };
}

describe("global public username ownership", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    isSupabaseEnabledMock.mockReturnValue(true);
  });

  it("adds the global registry, audit table, unique ownership, and claim function migration", () => {
    const migration = readFileSync("supabase/migrations/20260602193000_public_username_registry.sql", "utf8");

    expect(migration).toContain("create table if not exists public.public_usernames");
    expect(migration).toContain("create unique index if not exists public_usernames_username_lower_uidx");
    expect(migration).toContain("constraint public_usernames_owner_unique unique (owner_type, owner_id)");
    expect(migration).toContain("create table if not exists public.public_username_audit_events");
    expect(migration).toContain("create or replace function public.claim_public_username");
    expect(migration).toContain("raise exception 'username_taken'");
  });

  it("returns available for an unused public username", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createRegistrySupabaseMock(null));

    await expect(checkPublicUsernameAvailability("fresh-name", { type: "client", id: "profile-1" })).resolves.toEqual({
      available: true,
      normalizedUsername: "fresh-name",
      reason: null
    });
  });

  it("returns taken when another public identity owns the username", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createRegistrySupabaseMock({
      owner_type: "barber",
      owner_id: "barber-1",
      username: "phillip"
    }));

    await expect(checkPublicUsernameAvailability("phillip", { type: "client", id: "profile-1" })).resolves.toEqual({
      available: false,
      normalizedUsername: "phillip",
      reason: "taken"
    });
  });

  it("returns available for the same owner's current username", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createRegistrySupabaseMock({
      owner_type: "shop",
      owner_id: "shop-1",
      username: "the-shop"
    }));

    await expect(checkPublicUsernameAvailability("the-shop", { type: "shop", id: "shop-1" })).resolves.toEqual({
      available: true,
      normalizedUsername: "the-shop",
      reason: null
    });
  });

  it("returns reserved and invalid without querying Supabase", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createRegistrySupabaseMock(null));

    await expect(checkPublicUsernameAvailability("admin", { type: "client", id: "profile-1" })).resolves.toEqual({
      available: false,
      normalizedUsername: "admin",
      reason: "reserved"
    });
    await expect(checkPublicUsernameAvailability("x", { type: "client", id: "profile-1" })).resolves.toEqual({
      available: false,
      normalizedUsername: "x",
      reason: "invalid"
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("keeps every canonical shop route segment reserved in application code", async () => {
    expect(CANONICAL_SHOP_ROUTE_USERNAME_RESERVATIONS).toEqual(canonicalShopRouteReservations);
    createSupabaseAdminClientMock.mockReturnValue(createRegistrySupabaseMock(null));

    for (const username of canonicalShopRouteReservations) {
      await expect(
        checkPublicUsernameAvailability(username, { type: "shop", id: "shop-1" })
      ).resolves.toEqual({
        available: false,
        normalizedUsername: username,
        reason: "reserved"
      });
    }

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails the forward migration before replacing the claim function when conflicts exist", () => {
    const migration = readFileSync(canonicalReservationMigration, "utf8");
    const preflightIndex = migration.indexOf("canonical_shop_route_username_conflict");
    const replacementIndex = migration.indexOf("create or replace function public.claim_public_username");

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(replacementIndex).toBeGreaterThan(preflightIndex);
    expect(migration).toContain("from public.public_usernames pu");
    expect(migration).toContain("no username is changed automatically");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = public, auth, pg_temp");

    for (const username of canonicalShopRouteReservations) {
      expect(migration.match(new RegExp(`'${username}'`, "g"))?.length).toBe(2);
    }
  });
});
