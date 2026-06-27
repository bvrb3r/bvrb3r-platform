import { describe, expect, it } from "vitest";
import { resolveBookingClient } from "@/lib/operations/live-provider";

type TableName = "clients" | "profiles" | "client_preferences";
type Row = Record<string, unknown>;

function createBookingClientResolverSupabaseStub(seed: Partial<Record<TableName, Row[]>>) {
  const tables: Record<TableName, Row[]> = {
    clients: [...(seed.clients ?? [])],
    profiles: [...(seed.profiles ?? [])],
    client_preferences: [...(seed.client_preferences ?? [])]
  };

  class QueryBuilder {
    private filters: Array<[string, unknown]> = [];
    private operation: "insert" | "update" | "upsert" | null = null;
    private payload: Row | null = null;
    private rowLimit: number | null = null;

    constructor(private readonly table: TableName) {}

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    }

    order() {
      return this;
    }

    limit(value: number) {
      this.rowLimit = value;
      return this;
    }

    insert(payload: Row) {
      this.operation = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: Row) {
      this.operation = "update";
      this.payload = payload;
      return this;
    }

    upsert(payload: Row) {
      this.operation = "upsert";
      this.payload = payload;
      const existing = tables[this.table].find((row) =>
        payload.client_reference && row.client_reference === payload.client_reference
      );
      if (existing) {
        Object.assign(existing, payload);
      } else {
        tables[this.table].push(payload);
      }
      return Promise.resolve({ data: [payload], error: null });
    }

    maybeSingle() {
      return this.execute().then((result) => ({
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
        error: result.error
      }));
    }

    single() {
      return this.execute().then((result) => ({
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
        error: result.error
      }));
    }

    then<TResult1 = { data: Row[] | null; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private execute() {
      if (this.operation === "insert" && this.payload) {
        const row = {
          id: this.payload.id ?? `${this.table}-${tables[this.table].length + 1}`,
          created_at: this.payload.created_at ?? "2026-05-14T12:00:00.000Z",
          ...this.payload
        };
        tables[this.table].push(row);
        return Promise.resolve({ data: [row], error: null });
      }

      if (this.operation === "update" && this.payload) {
        const rows = this.filteredRows();
        for (const row of rows) {
          Object.assign(row, this.payload);
        }
        return Promise.resolve({ data: rows, error: null });
      }

      return Promise.resolve({ data: this.filteredRows(), error: null });
    }

    private filteredRows() {
      const rows = tables[this.table].filter((row) =>
        this.filters.every(([column, value]) => row[column] === value)
      );
      return this.rowLimit == null ? rows : rows.slice(0, this.rowLimit);
    }
  }

  return {
    tables,
    supabase: {
      from(table: TableName) {
        if (!tables[table]) {
          throw new Error(`Unexpected table ${table}`);
        }

        return new QueryBuilder(table);
      }
    }
  };
}

describe("booking client resolution", () => {
  it("prefers the authenticated profile client over a public client reference", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const walletClientId = "22222222-2222-4222-8222-222222222222";
    const staleClientId = "33333333-3333-4333-8333-333333333333";
    const resolver = createBookingClientResolverSupabaseStub({
      profiles: [{
        id: profileId,
        full_name: "Phillip Client",
        email: "phillip.client@example.com",
        phone: "+18135550190"
      }],
      clients: [{
        id: staleClientId,
        reference_code: "client-1fd26b88",
        profile_id: "44444444-4444-4444-8444-444444444444",
        created_at: "2026-05-01T12:00:00.000Z"
      }, {
        id: walletClientId,
        reference_code: "client-wallet",
        profile_id: profileId,
        created_at: "2026-05-02T12:00:00.000Z"
      }]
    });

    const resolved = await resolveBookingClient(resolver.supabase as never, {
      clientId: "client-1fd26b88",
      actorProfileId: profileId,
      actorEmail: "phillip.client@example.com",
      clientName: "Phillip Client",
      clientPhone: "+18135550190"
    });

    expect(resolved?.clientId).toBe(walletClientId);
    expect(resolved?.profileId).toBe(profileId);
    expect(resolver.tables.client_preferences[0]).toMatchObject({
      client_id: walletClientId,
      client_reference: "client-wallet"
    });
  });

  it("creates a nullable-profile guest client from submitted booking email", async () => {
    const resolver = createBookingClientResolverSupabaseStub({});

    const resolved = await resolveBookingClient(resolver.supabase as never, {
      actorEmail: "Guest.Booker@Example.COM",
      clientName: "Guest Booker",
      clientPhone: "(813) 555-0199"
    });

    expect(resolved?.profileId).toBeNull();
    expect(resolved?.name).toBe("Guest Booker");
    expect(resolved?.email).toBe("guest.booker@example.com");
    expect(resolved?.phone).toBe("(813) 555-0199");
    expect(resolver.tables.clients).toHaveLength(1);
    expect(resolver.tables.clients[0]).toMatchObject({
      profile_id: null,
      loyalty_points: 0,
      retention_tag: "new"
    });
    expect(String(resolver.tables.clients[0].reference_code)).toMatch(/^guest-[a-f0-9]{18}$/);
    expect(resolver.tables.client_preferences[0]).toMatchObject({
      client_id: resolved?.clientId,
      client_email: "guest.booker@example.com",
      client_reference: resolved?.referenceCode
    });
  });
});
