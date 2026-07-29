import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserFromServerMock, createSupabaseAdminClientMock, isSupabaseEnabledMock } = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: isSupabaseEnabledMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import {
  assertAnyActiveKioskDeviceSession,
  assertKioskDeviceSession,
  completeKioskDeviceSession,
  readKioskSessionToken,
  startKioskDeviceSession
} from "@/lib/kiosk/session-service";

const SHOP = { id: "shop-ybor-01", public_username: "yborcuts", owner_profile_id: "owner-profile-1" };
const LOCATION = { id: "0b6f5cbe-8a25-4b3e-9a67-0c2f6f2d9f11", reference_code: SHOP.id };
const BARBER = { id: "7f0a45c8-63c8-4b5f-8a2a-91f7f5e6b0aa", profile_id: "barber-profile-1" };
const SETTING = { id: "5f4c9d21-6f7f-4f4a-8f7e-2f6a1d3b9c01", enabled: true, pin_hash: "hash" };

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

type SessionRow = Record<string, unknown>;

function createSupabaseStub(options: {
  settingRow?: typeof SETTING | null;
  sessionRows?: SessionRow[];
  controlRows?: SessionRow[];
} = {}) {
  const sessions: SessionRow[] = options.sessionRows ?? [];
  const updates: SessionRow[] = [];
  const settingRow = options.settingRow === undefined ? SETTING : options.settingRow;
  const controlRows = options.controlRows ?? [
    { control_key: "maintenance", active: false, reason: null, version: 1 },
    { control_key: "kiosks", active: false, reason: null, version: 1 }
  ];

  const stub = {
    sessions,
    updates,
    from(table: string) {
      if (table === "architect_system_controls") {
        return {
          select: () => ({
            in: async (_column: string, values: string[]) => ({
              data: controlRows.filter((row) => values.includes(String(row.control_key))),
              error: null
            })
          })
        };
      }
      if (table === "kiosk_settings") {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({ maybeSingle: async () => ({ data: settingRow, error: null }) })
            })
          })
        };
      }
      if (table === "shops") {
        return {
          select: () => ({
            or: (filter: string) => ({
              maybeSingle: async () => ({
                data: filter.includes(`id.eq.${SHOP.id}`) || filter.includes(`public_username.ilike.${SHOP.public_username}`) ? SHOP : null,
                error: null
              })
            })
          })
        };
      }
      if (table === "locations") {
        return {
          select: () => ({
            or: (filter: string) => ({
              maybeSingle: async () => ({
                data: filter.includes(`reference_code.eq.${SHOP.id}`) ? LOCATION : null,
                error: null
              })
            })
          })
        };
      }
      if (table === "barbers") {
        return {
          select: () => ({
            eq: (_c: string, value: string) => ({
              maybeSingle: async () => ({ data: value === BARBER.id ? BARBER : null, error: null })
            })
          })
        };
      }
      if (table === "kiosk_sessions") {
        return {
          insert: (row: SessionRow) => {
            sessions.push(row);
            return { select: () => ({ maybeSingle: async () => ({ data: { id: "session-1" }, error: null }) }) };
          },
          select: () => ({
            eq: (_c: string, hash: string) => ({
              maybeSingle: async () => ({
                data: sessions.find((row) => row.session_token_hash === hash) ?? null,
                error: null
              })
            })
          }),
          update: (patch: SessionRow) => {
            updates.push(patch);
            return {
              eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
            };
          }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };
  return stub;
}

function signInAs(user: Record<string, unknown>) {
  getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, user });
}

describe("kiosk device sessions", () => {
  let supabase: ReturnType<typeof createSupabaseStub>;

  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    isSupabaseEnabledMock.mockReturnValue(true);
    supabase = createSupabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase);
  });

  it("lets the shop owner start a shop kiosk session with a hashed token", async () => {
    signInAs({ id: SHOP.owner_profile_id });

    const session = await startKioskDeviceSession({ scope: "shop", targetReference: SHOP.id });

    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
    expect(supabase.sessions).toHaveLength(1);
    expect(supabase.sessions[0]).toMatchObject({
      kiosk_setting_id: SETTING.id,
      shop_id: SHOP.id,
      location_id: LOCATION.id,
      mode: "shop_owner",
      status: "active",
      session_token_hash: sha256(session.token)
    });
  });

  it("blocks session start when the global kiosk switch is active", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub({
      controlRows: [
        { control_key: "maintenance", active: false, reason: null, version: 1 },
        { control_key: "kiosks", active: true, reason: "Kiosk incident", version: 2 }
      ]
    }));
    signInAs({ id: SHOP.owner_profile_id });

    await expect(startKioskDeviceSession({ scope: "shop", targetReference: SHOP.id }))
      .rejects.toMatchObject({
        status: 503,
        code: "architect_system_control_active"
      });
  });

  it("lets shop-scoped staff start the shop kiosk session", async () => {
    signInAs({ id: "front-desk-profile", role: "front_desk", locationIds: [SHOP.id] });

    const session = await startKioskDeviceSession({ scope: "shop", targetReference: SHOP.id });

    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
    expect(supabase.sessions).toHaveLength(1);
  });

  it("rejects a signed-in stranger starting another shop's kiosk", async () => {
    signInAs({ id: "stranger-profile", locationIds: [] });

    await expect(startKioskDeviceSession({ scope: "shop", targetReference: SHOP.id }))
      .rejects.toMatchObject({ status: 403, code: "not_authorized" });
    expect(supabase.sessions).toHaveLength(0);
  });

  it("refuses to start a session for an unconfigured kiosk", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub({ settingRow: null }));
    signInAs({ id: SHOP.owner_profile_id });

    await expect(startKioskDeviceSession({ scope: "shop", targetReference: SHOP.id }))
      .rejects.toMatchObject({ status: 403, code: "kiosk_not_ready" });
  });

  it("lets a barber start their own kiosk session in barber mode", async () => {
    signInAs({ id: BARBER.profile_id });

    const session = await startKioskDeviceSession({ scope: "barber", targetReference: BARBER.id });

    expect(supabase.sessions[0]).toMatchObject({ mode: "barber", barber_id: BARBER.id, shop_id: null, location_id: null });
    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("validates an active session token and rejects wrong target, wrong token, and expiry", async () => {
    signInAs({ id: SHOP.owner_profile_id });
    const session = await startKioskDeviceSession({ scope: "shop", targetReference: SHOP.id });

    await expect(assertKioskDeviceSession({ scope: "shop", targetReference: SHOP.id, token: session.token }))
      .resolves.toBeUndefined();
    await expect(assertKioskDeviceSession({ scope: "shop", targetReference: "someone-else", token: session.token }))
      .rejects.toMatchObject({ status: 401, code: "session_invalid" });
    await expect(assertKioskDeviceSession({ scope: "shop", targetReference: SHOP.id, token: "0".repeat(64) }))
      .rejects.toMatchObject({ status: 401, code: "session_invalid" });
    await expect(assertKioskDeviceSession({ scope: "shop", targetReference: SHOP.id, token: null }))
      .rejects.toMatchObject({ status: 401, code: "session_missing" });

    supabase.sessions[0]!.expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(assertKioskDeviceSession({ scope: "shop", targetReference: SHOP.id, token: session.token }))
      .rejects.toMatchObject({ status: 401, code: "session_invalid" });
  });

  it("accepts any active session for unscoped kiosk lookups and completes sessions on exit", async () => {
    signInAs({ id: SHOP.owner_profile_id });
    const session = await startKioskDeviceSession({ scope: "shop", targetReference: SHOP.id });

    await expect(assertAnyActiveKioskDeviceSession(session.token)).resolves.toBeUndefined();

    await completeKioskDeviceSession(session.token);
    expect(supabase.updates.some((patch) => patch.status === "completed")).toBe(true);
  });

  it("reads the session token from cookie or header", () => {
    const fromHeader = new Request("https://bvrb3r.demo/api", { headers: { "x-bvrb3r-kiosk-session": "abc" } });
    const fromCookie = new Request("https://bvrb3r.demo/api", { headers: { cookie: "other=1; bvrb3r-kiosk-session=def; more=2" } });
    const missing = new Request("https://bvrb3r.demo/api");

    expect(readKioskSessionToken(fromHeader)).toBe("abc");
    expect(readKioskSessionToken(fromCookie)).toBe("def");
    expect(readKioskSessionToken(missing)).toBeNull();
  });

  it("bypasses session enforcement entirely in demo mode", async () => {
    isSupabaseEnabledMock.mockReturnValue(false);
    signInAs({ id: "anyone" });

    const session = await startKioskDeviceSession({ scope: "shop", targetReference: "loc-ybor" });
    expect(session.token).toBe("demo-kiosk-session");
    await expect(assertKioskDeviceSession({ scope: "shop", targetReference: "loc-ybor", token: null })).resolves.toBeUndefined();
    await expect(assertAnyActiveKioskDeviceSession(null)).resolves.toBeUndefined();
  });
});
