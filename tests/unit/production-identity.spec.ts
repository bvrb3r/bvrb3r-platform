import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TableState = Record<string, Array<Record<string, unknown>>>;
type Filter =
  | { type: "eq"; field: string; value: unknown }
  | { type: "in"; field: string; values: unknown[] }
  | { type: "is"; field: string; value: unknown };

const { createSupabaseAdminClientMock, createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: () => true,
  hasTwilioDeliveryConfig: () => false,
  runtimeConfig: {
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioMessagingServiceSid: "",
    twilioFromNumber: ""
  }
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock
}));

function cloneRow<T extends Record<string, unknown>>(row: T): T {
  return { ...row };
}

function matchesFilters(row: Record<string, unknown>, filters: Filter[]) {
  return filters.every((filter) => {
    if (filter.type === "eq") {
      return row[filter.field] === filter.value;
    }

    if (filter.type === "in") {
      return filter.values.includes(row[filter.field]);
    }

    return row[filter.field] === filter.value;
  });
}

function applySelect(state: TableState, table: string, filters: Filter[], orderBy?: { field: string; ascending: boolean }, limit?: number) {
  let rows = (state[table] ?? []).filter((row) => matchesFilters(row, filters)).map((row) => cloneRow(row));

  if (orderBy) {
    rows = rows.sort((left, right) => {
      const leftValue = left[orderBy.field];
      const rightValue = right[orderBy.field];
      if (leftValue === rightValue) {
        return 0;
      }
      if (leftValue === undefined || leftValue === null) {
        return orderBy.ascending ? -1 : 1;
      }
      if (rightValue === undefined || rightValue === null) {
        return orderBy.ascending ? 1 : -1;
      }
      return `${leftValue}`.localeCompare(`${rightValue}`) * (orderBy.ascending ? 1 : -1);
    });
  }

  if (typeof limit === "number") {
    rows = rows.slice(0, limit);
  }

  return { data: rows, error: null };
}

type MaybeSingleResult = { data: Record<string, unknown> | null; error: null };

type SupabaseMockOptions = {
  maybeSingle?: (input: {
    table: string;
    filters: Filter[];
    result: MaybeSingleResult;
  }) => MaybeSingleResult;
};

function createSelectBuilder(state: TableState, table: string, options?: SupabaseMockOptions) {
  const filters: Filter[] = [];
  let orderBy: { field: string; ascending: boolean } | undefined;
  let limit: number | undefined;

  const builder = {
    eq(field: string, value: unknown) {
      filters.push({ type: "eq", field, value });
      return builder;
    },
    in(field: string, values: unknown[]) {
      filters.push({ type: "in", field, values });
      return builder;
    },
    is(field: string, value: unknown) {
      filters.push({ type: "is", field, value });
      return builder;
    },
    order(field: string, options?: { ascending?: boolean }) {
      orderBy = { field, ascending: options?.ascending !== false };
      return builder;
    },
    limit(value: number) {
      limit = value;
      return builder;
    },
    maybeSingle() {
      const result = applySelect(state, table, filters, orderBy, limit);
      const maybeSingleResult = {
        data: result.data[0] ?? null,
        error: result.error
      };
      return Promise.resolve(options?.maybeSingle?.({
        table,
        filters,
        result: maybeSingleResult
      }) ?? maybeSingleResult);
    },
    then(onFulfilled?: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(applySelect(state, table, filters, orderBy, limit)).then(onFulfilled, onRejected);
    }
  };

  return builder;
}

function createUpdateBuilder(state: TableState, table: string, values: Record<string, unknown>) {
  const filters: Filter[] = [];

  const builder = {
    eq(field: string, value: unknown) {
      filters.push({ type: "eq", field, value });
      return builder;
    },
    then(onFulfilled?: (value: { data: null; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      const rows = state[table] ?? [];
      state[table] = rows.map((row) => (matchesFilters(row, filters) ? { ...row, ...values } : row));
      return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
    }
  };

  return builder;
}

function createInsertBuilder(state: TableState, table: string, payload: Record<string, unknown> | Array<Record<string, unknown>>) {
  let insertedRows: Array<Record<string, unknown>> | null = null;
  const write = () => {
    if (insertedRows) {
      return insertedRows;
    }

    const rows = Array.isArray(payload) ? payload : [payload];
    state[table] ??= [];
    insertedRows = rows.map((row) => cloneRow(row));
    for (const row of insertedRows) {
      state[table].push(row);
    }
    return insertedRows;
  };

  const builder = {
    select() {
      return {
        single() {
          const rows = write();
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        }
      };
    },
    then(onFulfilled?: (value: { data: null; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      write();
      return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
    }
  };

  return builder;
}

function upsertRows(state: TableState, table: string, payload: Record<string, unknown> | Array<Record<string, unknown>>, onConflict?: string) {
  const rows = Array.isArray(payload) ? payload : [payload];
  state[table] ??= [];
  const conflictFields = (onConflict ?? "id").split(",").map((field) => field.trim());

  for (const row of rows) {
    const index = state[table].findIndex((candidate) =>
      conflictFields.every((field) => candidate[field] === row[field])
    );

    if (index >= 0) {
      state[table][index] = {
        ...state[table][index],
        ...row
      };
      continue;
    }

    state[table].push(cloneRow(row));
  }
}

function createSupabaseAdminMock(state: TableState, options?: SupabaseMockOptions) {
  return {
    from(table: string) {
      return {
        select() {
          return createSelectBuilder(state, table, options);
        },
        insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
          return createInsertBuilder(state, table, payload);
        },
        update(values: Record<string, unknown>) {
          return createUpdateBuilder(state, table, values);
        },
        upsert(payload: Record<string, unknown> | Array<Record<string, unknown>>, options?: { onConflict?: string }) {
          upsertRows(state, table, payload, options?.onConflict);
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  };
}

import {
  buildRuntimeUserFromProductionAuth,
  getContactVerificationDebugState,
  getContactVerificationState,
  initializeProductionRoleSelection,
  updateContactVerificationProfile,
  verifyPhoneVerificationChallenge
} from "@/lib/auth/production-identity";

describe("production identity provisioning", () => {
  let state: TableState;

  beforeEach(() => {
    state = {
      profiles: [],
      clients: [],
      barbers: [],
      shops: [],
      staff_locations: [],
      locations: [],
      client_profiles: [],
      user_roles: []
    };

    createSupabaseAdminClientMock.mockReset();
    createSupabaseServerClientMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseAdminMock(state));
    createSupabaseServerClientMock.mockResolvedValue(createSupabaseAdminMock(state));
  });

  it("provisions a missing profile row idempotently for an authenticated OAuth user", async () => {
    const authUser = {
      id: "auth-user-1",
      email: "fresh@bvrb3r.app",
      phone: null,
      email_confirmed_at: "2026-04-08T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Fresh User"
      }
    };

    const first = await buildRuntimeUserFromProductionAuth(authUser);
    const second = await buildRuntimeUserFromProductionAuth(authUser);

    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({
      id: "auth-user-1",
      role: "client",
      email: "fresh@bvrb3r.app",
      full_name: "Fresh User"
    });
    expect(first.accountStatus).toBe("profile_only");
    expect(first.onboardingState).toBe("awaiting_contact_verification");
    expect(first.canonicalFullName).toBe("Fresh User");
    expect(second.email).toBe("fresh@bvrb3r.app");
  });

  it("falls back to the authenticated server client when the service role client is unavailable", async () => {
    createSupabaseAdminClientMock.mockReturnValue(null);
    createSupabaseServerClientMock.mockResolvedValue(createSupabaseAdminMock(state));

    const contactState = await getContactVerificationState({
      id: "auth-user-fallback",
      email: "fallback@bvrb3r.app",
      phone: null,
      email_confirmed_at: "2026-04-08T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Fallback User"
      }
    });

    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({
      id: "auth-user-fallback",
      role: "client",
      full_name: "Fallback User",
      email: "fallback@bvrb3r.app"
    });
    expect(contactState.fullName).toBe("Fallback User");
    expect(contactState.missingFields).toContain("phone");
  });

  it("creates a clean client lane even when the app-side profile row was deleted previously", async () => {
    const authUser = {
      id: "auth-user-2",
      email: "client@bvrb3r.app",
      phone: "+18135550123",
      email_confirmed_at: "2026-04-08T12:00:00.000Z",
      phone_confirmed_at: "2026-04-08T12:00:00.000Z",
      user_metadata: {
        full_name: "Client Fresh Start",
        phone: "+18135550123"
      }
    };

    const result = await initializeProductionRoleSelection(authUser, { role: "client" });

    expect(state.profiles).toHaveLength(1);
    expect(state.clients).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({
      id: "auth-user-2",
      role: "client",
      primary_onboarding_role: "client"
    });
    expect(result.user.clientId).toBeTruthy();
    expect(result.user.accountStatus).toBe("active");
  });

  it("updates a stale onboarding state after phone verification completes", async () => {
    state.profiles.push({
      id: "auth-user-3",
      role: "client",
      full_name: "Taylor Lane",
      email: "taylor@bvrb3r.app",
      phone: "+18135550124",
      phone_verified_at: "2026-04-08T12:00:00.000Z",
      onboarding_state: "awaiting_contact_verification"
    });

    const runtimeUser = await buildRuntimeUserFromProductionAuth({
      id: "auth-user-3",
      email: "taylor@bvrb3r.app",
      phone: "+18135550124",
      email_confirmed_at: "2026-04-08T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Taylor Lane",
        phone: "+18135550124"
      }
    });

    expect(runtimeUser.onboardingState).toBe("awaiting_role_selection");
    expect(runtimeUser.canonicalFullName).toBe("Taylor Lane");
    expect(state.profiles[0]?.onboarding_state).toBe("awaiting_role_selection");
  });

  it("preserves an existing owner lane when contact details are updated", async () => {
    state.profiles.push({
      id: "auth-owner-1",
      role: "owner",
      full_name: "Owner In Progress",
      email: "owner@bvrb3r.app",
      phone: null,
      primary_onboarding_role: "shop_owner",
      onboarding_state: "role_selected",
      phone_verified_at: null
    });

    await updateContactVerificationProfile({
      id: "auth-owner-1",
      email: "owner@bvrb3r.app",
      phone: null,
      email_confirmed_at: "2026-04-08T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {}
    }, {
      firstName: "Maya",
      lastName: "Lane",
      phone: "(813) 555-0125",
      email: "owner@bvrb3r.app"
    });

    expect(state.profiles[0]).toMatchObject({
      id: "auth-owner-1",
      role: "owner",
      primary_onboarding_role: "shop_owner",
      full_name: "Maya Lane",
      phone: "+18135550125"
    });
  });

  it("treats a production full_name/email/phone row as contact-complete without split name columns", async () => {
    state.profiles.push({
      id: "auth-user-4",
      role: "client",
      full_name: "Phillip Mcgee",
      email: "bvrb3r@gmail.com",
      phone: "+18136250040",
      phone_verified_at: "2026-04-09T12:00:00.000Z",
      onboarding_state: "awaiting_contact_verification",
      primary_onboarding_role: null
    });

    const contactState = await getContactVerificationState({
      id: "auth-user-4",
      email: "bvrb3r@gmail.com",
      phone: null,
      email_confirmed_at: "2026-04-09T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Phillip Mcgee"
      }
    });

    expect(contactState.fullName).toBe("Phillip Mcgee");
    expect(contactState.phone).toBe("+18136250040");
    expect(contactState.phoneVerified).toBe(true);
    expect(contactState.missingFields).toEqual([]);
    expect(contactState.canContinue).toBe(true);
    expect(contactState.requiresRoleSelection).toBe(true);
    expect(contactState.onboardingState).toBe("awaiting_role_selection");
  });

  it("does not replace a known canonical profile with null when the post-state-update read flakes", async () => {
    state.profiles.push({
      id: "auth-user-read-flake",
      role: "client",
      full_name: "Phillip Mcgee",
      email: "bvrb3r@gmail.com",
      phone: "+18136250040",
      phone_verified_at: "2026-04-09T12:00:00.000Z",
      onboarding_state: "awaiting_contact_verification",
      primary_onboarding_role: null
    });

    let profileReadCount = 0;
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseAdminMock(state, {
      maybeSingle({ table, result }) {
        if (table !== "profiles") {
          return result;
        }

        profileReadCount += 1;
        return profileReadCount >= 3
          ? { data: null, error: null }
          : result;
      }
    }));

    const debugState = await getContactVerificationDebugState({
      id: "auth-user-read-flake",
      email: "bvrb3r@gmail.com",
      phone: null,
      email_confirmed_at: "2026-04-09T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Phillip Mcgee"
      }
    });

    expect(debugState.profile).toMatchObject({
      id: "auth-user-read-flake",
      full_name: "Phillip Mcgee",
      phone: "+18136250040",
      onboarding_state: "awaiting_role_selection"
    });
    expect(debugState.computed.missingFields).toEqual([]);
    expect(debugState.computed.requiresRoleSelection).toBe(true);
  });

  it("persists phone to the canonical profile row before recomputing contact completeness", async () => {
    state.profiles.push({
      id: "auth-user-5",
      role: "client",
      full_name: "Phillip Mcgee",
      email: "bvrb3r@gmail.com",
      phone: null,
      phone_verified_at: null,
      onboarding_state: "awaiting_contact_verification"
    });

    const result = await updateContactVerificationProfile({
      id: "auth-user-5",
      email: "bvrb3r@gmail.com",
      phone: null,
      email_confirmed_at: "2026-04-09T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Phillip Mcgee"
      }
    }, {
      firstName: "Phillip",
      lastName: "Mcgee",
      phone: "(813) 625-0040",
      email: "bvrb3r@gmail.com"
    });

    expect(state.profiles[0]).toMatchObject({
      full_name: "Phillip Mcgee",
      email: "bvrb3r@gmail.com",
      phone: "+18136250040"
    });
    expect(result.missingFields).not.toContain("phone");
    expect(result.phone).toBe("+18136250040");
  });

  it("persists phone verification to the canonical profile row and advances onboarding", async () => {
    const profileId = "auth-user-6";
    const phone = "+18136250040";
    const code = "123456";

    state.profiles.push({
      id: profileId,
      role: "client",
      full_name: "Phillip Mcgee",
      email: "bvrb3r@gmail.com",
      phone,
      phone_verified_at: null,
      onboarding_state: "awaiting_contact_verification",
      primary_onboarding_role: null
    });

    state.phone_verification_challenges = [{
      id: "phone-challenge-1",
      profile_id: profileId,
      phone,
      code_hash: createHash("sha256").update(`${profileId}:${phone}:${code}`).digest("hex"),
      attempt_count: 0,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed_at: null,
      created_at: new Date().toISOString()
    }];

    const result = await verifyPhoneVerificationChallenge({
      id: profileId,
      email: "bvrb3r@gmail.com",
      phone: null,
      email_confirmed_at: "2026-04-09T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Phillip Mcgee"
      }
    }, code, {
      phone
    });

    expect(state.profiles[0]).toMatchObject({
      full_name: "Phillip Mcgee",
      email: "bvrb3r@gmail.com",
      phone: "+18136250040",
      onboarding_state: "awaiting_role_selection"
    });
    expect(state.profiles[0]?.phone_verified_at).toBeTruthy();
    expect(result.phoneVerified).toBe(true);
    expect(result.missingFields).toEqual([]);
    expect(result.canContinue).toBe(true);
    expect(result.requiresRoleSelection).toBe(true);
    expect(result.onboardingState).toBe("awaiting_role_selection");
  });

  it("does not infer official client lane from stale client rows when primary onboarding role is null", async () => {
    state.profiles.push({
      id: "auth-stale-client",
      role: "client",
      full_name: "Stale Client",
      email: "stale@bvrb3r.app",
      phone: "+18135550130",
      phone_verified_at: "2026-04-10T12:00:00.000Z",
      onboarding_state: "awaiting_role_selection",
      primary_onboarding_role: null
    });
    state.clients.push({
      id: "client-row-stale",
      profile_id: "auth-stale-client",
      reference_code: "client-stale"
    });

    const runtimeUser = await buildRuntimeUserFromProductionAuth({
      id: "auth-stale-client",
      email: "stale@bvrb3r.app",
      phone: null,
      email_confirmed_at: "2026-04-10T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Stale Client"
      }
    });

    expect(runtimeUser.primaryOnboardingRole).toBeUndefined();
    expect(runtimeUser.accountStatus).toBe("profile_only");
    expect(runtimeUser.onboardingState).toBe("awaiting_role_selection");
    expect(state.profiles[0]).toMatchObject({
      primary_onboarding_role: null,
      onboarding_state: "awaiting_role_selection"
    });
  });

  it("launches the barber lane without requiring subtype and creates a bootstrap barber row", async () => {
    state.profiles.push({
      id: "auth-new-barber",
      role: "client",
      full_name: "New Barber",
      email: "barber@bvrb3r.app",
      phone: "+18135550131",
      phone_verified_at: "2026-04-10T12:00:00.000Z",
      onboarding_state: "awaiting_role_selection",
      primary_onboarding_role: null
    });

    const result = await initializeProductionRoleSelection({
      id: "auth-new-barber",
      email: "barber@bvrb3r.app",
      phone: null,
      email_confirmed_at: "2026-04-10T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "New Barber"
      }
    }, {
      role: "barber"
    });

    expect(state.profiles[0]).toMatchObject({
      id: "auth-new-barber",
      primary_onboarding_role: "barber",
      onboarding_state: "role_selected"
    });
    expect(state.barbers[0]).toMatchObject({
      profile_id: "auth-new-barber",
      reference_code: "barber-auth-new",
      barber_subtype: null,
      app_approval_status: "pending"
    });
    expect(result.user.primaryOnboardingRole).toBe("barber");
    expect(result.user.barberId).toBe("barber-auth-new");
    expect(result.user.barberSubtype).toBeUndefined();
    expect(result.seedProfileData.barberId).toBe("barber-auth-new");
  });

  it("launches the owner lane from a stale client profile and creates owner bootstrap rows", async () => {
    state.profiles.push({
      id: "auth-new-owner",
      role: "client",
      full_name: "New Owner",
      email: "owner-new@bvrb3r.app",
      phone: "+18135550132",
      phone_verified_at: "2026-04-10T12:00:00.000Z",
      onboarding_state: "awaiting_role_selection",
      primary_onboarding_role: null
    });
    state.clients.push({
      id: "client-row-owner-stale",
      profile_id: "auth-new-owner",
      reference_code: "client-owner-stale"
    });

    const result = await initializeProductionRoleSelection({
      id: "auth-new-owner",
      email: "owner-new@bvrb3r.app",
      phone: null,
      email_confirmed_at: "2026-04-10T12:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "New Owner"
      }
    }, {
      role: "shop_owner",
      shopName: "New Owner Shop"
    });

    expect(state.profiles[0]).toMatchObject({
      id: "auth-new-owner",
      role: "owner",
      primary_onboarding_role: "shop_owner",
      onboarding_state: "active"
    });
    expect(state.shops[0]).toMatchObject({
      id: "shop-new-owner-shop-auth-n",
      owner_profile_id: "auth-new-owner",
      name: "New Owner Shop",
      app_approval_status: "pending"
    });
    expect(state.locations[0]).toMatchObject({
      reference_code: "shop-new-owner-shop-auth-n",
      name: "New Owner Shop"
    });
    expect(result.user.role).toBe("owner");
    expect(result.user.primaryOnboardingRole).toBe("shop_owner");
    expect(result.user.ownedShopId).toBe("shop-new-owner-shop-auth-n");
  });
});
