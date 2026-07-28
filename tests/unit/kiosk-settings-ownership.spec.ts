import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserFromServerMock, createSupabaseAdminClientMock } = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: () => true
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { KioskSettingsError, saveKioskPin } from "@/lib/kiosk/settings-service";

const SHOP = { id: "shop-ybor-01", public_username: "yborcuts", owner_profile_id: "owner-profile-1" };
const BARBER = { id: "barber-blaze", profile_id: "barber-profile-1" };

type UpsertRow = Record<string, unknown>;

function createSupabaseStub() {
  const upserts: UpsertRow[] = [];
  const stub = {
    upserts,
    from(table: string) {
      if (table === "shops") {
        return {
          select: () => ({
            or: (filter: string) => ({
              maybeSingle: async () => ({
                data: filter.includes(`id.eq.${SHOP.id}`) || filter.includes(`public_username.ilike.${SHOP.public_username}`)
                  ? { id: SHOP.id, owner_profile_id: SHOP.owner_profile_id }
                  : null,
                error: null
              })
            })
          })
        };
      }
      if (table === "barbers") {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => ({
                data: value === BARBER.id ? { id: BARBER.id, profile_id: BARBER.profile_id } : null,
                error: null
              })
            })
          })
        };
      }
      if (table === "kiosk_settings") {
        return {
          upsert: (row: UpsertRow) => {
            upserts.push(row);
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: { scope: row.scope, target_reference: row.target_reference, enabled: true },
                  error: null
                })
              })
            };
          }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };
  return stub;
}

function signInAs(profileId: string) {
  getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, user: { id: profileId } });
}

describe("kiosk PIN target ownership", () => {
  let supabase: ReturnType<typeof createSupabaseStub>;

  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    supabase = createSupabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase);
  });

  it("lets the shop owner set their shop kiosk PIN", async () => {
    signInAs(SHOP.owner_profile_id);

    const result = await saveKioskPin({ scope: "shop", targetReference: SHOP.id, pin: "1234" });

    expect(result.pinSet).toBe(true);
    expect(supabase.upserts).toHaveLength(1);
    expect(supabase.upserts[0]).toMatchObject({ scope: "shop", target_reference: SHOP.id, owner_profile_id: SHOP.owner_profile_id });
  });

  it("rejects a signed-in non-owner trying to overwrite another shop's kiosk PIN", async () => {
    signInAs("intruder-profile");

    await expect(saveKioskPin({ scope: "shop", targetReference: SHOP.id, pin: "1234" }))
      .rejects.toMatchObject({ status: 403, code: "not_target_owner" });
    expect(supabase.upserts).toHaveLength(0);
  });

  it("rejects a shop PIN save for a shop that does not exist", async () => {
    signInAs(SHOP.owner_profile_id);

    await expect(saveKioskPin({ scope: "shop", targetReference: "shop-unknown", pin: "1234" }))
      .rejects.toMatchObject({ status: 404, code: "target_not_found" });
    expect(supabase.upserts).toHaveLength(0);
  });

  it("lets a barber set their own kiosk PIN", async () => {
    signInAs(BARBER.profile_id);

    const result = await saveKioskPin({ scope: "barber", targetReference: BARBER.id, pin: "4321" });

    expect(result.pinSet).toBe(true);
    expect(supabase.upserts[0]).toMatchObject({ scope: "barber", target_reference: BARBER.id });
  });

  it("rejects a barber PIN save for a barber the caller does not own", async () => {
    signInAs("someone-else");

    await expect(saveKioskPin({ scope: "barber", targetReference: BARBER.id, pin: "4321" }))
      .rejects.toMatchObject({ status: 403, code: "not_target_owner" });
    expect(supabase.upserts).toHaveLength(0);
  });

  it("allows the profile-id fallback target only for the caller's own profile", async () => {
    signInAs("barber-profile-2");

    const own = await saveKioskPin({ scope: "barber", targetReference: "barber-profile-2", pin: "9876" });
    expect(own.pinSet).toBe(true);

    await expect(saveKioskPin({ scope: "barber", targetReference: "someone-elses-profile", pin: "9876" }))
      .rejects.toMatchObject({ status: 404, code: "target_not_found" });
  });

  it("still requires authentication before any ownership check", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: false, user: { id: "guest-user" } });

    await expect(saveKioskPin({ scope: "shop", targetReference: SHOP.id, pin: "1234" }))
      .rejects.toBeInstanceOf(KioskSettingsError);
    expect(supabase.upserts).toHaveLength(0);
  });
});
