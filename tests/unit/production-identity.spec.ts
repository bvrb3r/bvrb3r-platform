import { beforeEach, describe, expect, it, vi } from "vitest";

type TableState = Record<string, Array<Record<string, unknown>>>;
type Filter =
  | { type: "eq"; field: string; value: unknown }
  | { type: "in"; field: string; values: unknown[] }
  | { type: "is"; field: string; value: unknown };

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
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

function createSelectBuilder(state: TableState, table: string) {
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
      return Promise.resolve({
        data: result.data[0] ?? null,
        error: result.error
      });
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

function createSupabaseAdminMock(state: TableState) {
  return {
    from(table: string) {
      return {
        select() {
          return createSelectBuilder(state, table);
        },
        insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
          const rows = Array.isArray(payload) ? payload : [payload];
          state[table] ??= [];
          for (const row of rows) {
            state[table].push(cloneRow(row));
          }
          return Promise.resolve({ data: null, error: null });
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

import { buildRuntimeUserFromProductionAuth, initializeProductionRoleSelection } from "@/lib/auth/production-identity";

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
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseAdminMock(state));
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
    expect(second.email).toBe("fresh@bvrb3r.app");
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
});
