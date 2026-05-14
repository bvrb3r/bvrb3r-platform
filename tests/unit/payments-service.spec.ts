import { describe, expect, it, vi } from "vitest";
import { PaymentServiceError, readClientPaymentMethodsByClientId } from "@/lib/payments/service";

type TableName = "clients" | "client_preferences" | "payment_methods" | "saved_payment_methods" | "billing_customers";
type Row = Record<string, unknown>;
type QueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type Seed = Partial<Record<TableName, Row[]>> & {
  errors?: Partial<Record<TableName, QueryError>>;
};

function createPaymentResolverSupabaseStub(seed: Seed = {}) {
  const tables: Record<TableName, Row[]> = {
    clients: [...(seed.clients ?? [])],
    client_preferences: [...(seed.client_preferences ?? [])],
    payment_methods: [...(seed.payment_methods ?? [])],
    saved_payment_methods: [...(seed.saved_payment_methods ?? [])],
    billing_customers: [...(seed.billing_customers ?? [])]
  };
  const writes: Array<{ table: TableName; type: "insert" | "update"; payload: Row; filters: Array<[string, unknown]> }> = [];

  class QueryBuilder {
    private filters: Array<[string, unknown]> = [];
    private inFilters: Array<[string, unknown[]]> = [];
    private operation: "insert" | "update" | null = null;
    private payload: Row | null = null;

    constructor(private readonly table: TableName) {}

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    }

    neq(column: string, value: unknown) {
      this.filters.push([`!${column}`, value]);
      return this;
    }

    in(column: string, values: unknown[]) {
      this.inFilters.push([column, values]);
      return this;
    }

    order() {
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

    then<TResult1 = { data: Row[] | null; error: QueryError | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Row[] | null; error: QueryError | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private execute() {
      const error = seed.errors?.[this.table];
      if (error) {
        return Promise.resolve({ data: null, error });
      }

      if (this.operation === "insert" && this.payload) {
        const row = {
          id: this.payload.id ?? `${this.table}-${tables[this.table].length + 1}`,
          created_at: this.payload.created_at ?? "2026-05-11T12:00:00.000Z",
          ...this.payload
        };
        tables[this.table].push(row);
        writes.push({ table: this.table, type: "insert", payload: row, filters: [...this.filters] });
        return Promise.resolve({ data: [row], error: null });
      }

      if (this.operation === "update" && this.payload) {
        const rows = this.filteredRows();
        for (const row of rows) {
          Object.assign(row, this.payload);
        }
        writes.push({ table: this.table, type: "update", payload: this.payload, filters: [...this.filters] });
        return Promise.resolve({ data: rows, error: null });
      }

      return Promise.resolve({ data: this.filteredRows(), error: null });
    }

    private filteredRows() {
      return tables[this.table].filter((row) => {
        const matchesEq = this.filters.every(([column, value]) => {
          if (column.startsWith("!")) {
            return row[column.slice(1)] !== value;
          }

          return row[column] === value;
        });
        const matchesIn = this.inFilters.every(([column, values]) => values.includes(row[column]));
        return matchesEq && matchesIn;
      });
    }
  }

  return {
    tables,
    writes,
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

describe("payment methods service", () => {
  it("returns an empty list when a canonical client has no saved payment methods", async () => {
    const resolver = createPaymentResolverSupabaseStub();

    await expect(
      readClientPaymentMethodsByClientId("11111111-1111-4111-8111-111111111111", resolver.supabase as never)
    ).resolves.toEqual([]);
  });

  it("repairs a missing client preferences row while resolving saved payment methods", async () => {
    const resolver = createPaymentResolverSupabaseStub({
      clients: [{
        id: "11111111-1111-4111-8111-111111111111",
        reference_code: "client-jordan",
        profile_id: "profile-jordan"
      }]
    });

    await expect(readClientPaymentMethodsByClientId("client-jordan", resolver.supabase as never)).resolves.toEqual([]);

    expect(resolver.tables.client_preferences).toHaveLength(1);
    expect(resolver.tables.client_preferences[0]).toMatchObject({
      client_id: "11111111-1111-4111-8111-111111111111",
      client_reference: "client-jordan",
      client_email: "client-jordan@client.bvrb3r.local",
      provider_customer_ref: null,
      default_payment_method_ref: null
    });
  });

  it("syncs a Wallet saved card into canonical booking payment methods", async () => {
    const resolver = createPaymentResolverSupabaseStub({
      clients: [{
        id: "11111111-1111-4111-8111-111111111111",
        reference_code: "client-jordan",
        profile_id: "profile-jordan"
      }],
      client_preferences: [{
        client_reference: "client-jordan",
        client_email: "jordan@example.com"
      }],
      saved_payment_methods: [{
        id: "spm-1",
        profile_id: "profile-jordan",
        billing_customer_id: "billing-1",
        provider: "stripe",
        provider_payment_method_id: "pm_wallet_4242",
        brand: "Visa",
        last4: "4242",
        exp_month: 4,
        exp_year: 2028,
        is_default: true,
        created_at: "2026-05-01T12:00:00.000Z"
      }],
      billing_customers: [{
        id: "billing-1",
        provider_customer_id: "cus_wallet",
        default_payment_method_id: "pm_wallet_4242"
      }]
    });

    const methods = await readClientPaymentMethodsByClientId("client-jordan", resolver.supabase as never);

    expect(methods).toMatchObject([{
      provider: "stripe",
      brand: "Visa",
      last4: "4242",
      expMonth: 4,
      expYear: 2028,
      isDefault: true,
      label: "Visa ending in 4242"
    }]);
    expect(resolver.tables.payment_methods).toHaveLength(1);
    expect(resolver.tables.payment_methods[0]).toMatchObject({
      client_id: "11111111-1111-4111-8111-111111111111",
      provider_customer_id: "cus_wallet",
      provider_payment_method_id: "pm_wallet_4242",
      is_default: true
    });
    expect(resolver.tables.client_preferences[0]).toMatchObject({
      provider_customer_ref: "cus_wallet",
      default_payment_method_ref: "pm_wallet_4242"
    });
  });

  it("does not duplicate an existing canonical payment method when syncing Wallet rows", async () => {
    const resolver = createPaymentResolverSupabaseStub({
      clients: [{
        id: "11111111-1111-4111-8111-111111111111",
        reference_code: "client-jordan",
        profile_id: "profile-jordan"
      }],
      client_preferences: [{
        client_reference: "client-jordan",
        client_email: "jordan@example.com"
      }],
      payment_methods: [{
        id: "pm-row",
        client_id: "11111111-1111-4111-8111-111111111111",
        provider: "stripe",
        provider_customer_id: "cus_wallet",
        provider_payment_method_id: "pm_wallet_4242",
        brand: "Visa",
        last4: "4242",
        exp_month: 4,
        exp_year: 2028,
        is_default: true,
        created_at: "2026-05-01T12:00:00.000Z"
      }],
      saved_payment_methods: [{
        id: "spm-1",
        profile_id: "profile-jordan",
        billing_customer_id: "billing-1",
        provider: "stripe",
        provider_payment_method_id: "pm_wallet_4242",
        brand: "Visa",
        last4: "4242",
        exp_month: 4,
        exp_year: 2028,
        is_default: true,
        created_at: "2026-05-01T12:00:00.000Z"
      }]
    });

    const methods = await readClientPaymentMethodsByClientId("client-jordan", resolver.supabase as never);

    expect(methods).toHaveLength(1);
    expect(resolver.writes.filter((write) => write.table === "payment_methods" && write.type === "insert")).toHaveLength(0);
  });

  it("repairs a single canonical saved card into the default payment method", async () => {
    const resolver = createPaymentResolverSupabaseStub({
      clients: [{
        id: "11111111-1111-4111-8111-111111111111",
        reference_code: "client-jordan",
        profile_id: "profile-jordan"
      }],
      client_preferences: [{
        client_reference: "client-jordan",
        client_email: "jordan@example.com",
        default_payment_method_id: null,
        default_payment_method_ref: null
      }],
      payment_methods: [{
        id: "pm-single",
        client_id: "11111111-1111-4111-8111-111111111111",
        provider: "stripe",
        provider_customer_id: "cus_wallet",
        provider_payment_method_id: "pm_wallet_4242",
        brand: "Visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2034,
        is_default: false,
        created_at: "2026-05-01T12:00:00.000Z"
      }]
    });

    const methods = await readClientPaymentMethodsByClientId("client-jordan", resolver.supabase as never);

    expect(methods).toMatchObject([{
      id: "pm-single",
      isDefault: true
    }]);
    expect(resolver.tables.payment_methods[0]).toMatchObject({
      id: "pm-single",
      is_default: true
    });
    expect(resolver.tables.client_preferences[0]).toMatchObject({
      default_payment_method_id: "pm-single",
      default_payment_method_ref: "pm_wallet_4242"
    });
  });

  it("uses a valid client preference default when multiple canonical cards exist", async () => {
    const resolver = createPaymentResolverSupabaseStub({
      clients: [{
        id: "11111111-1111-4111-8111-111111111111",
        reference_code: "client-jordan",
        profile_id: "profile-jordan"
      }],
      client_preferences: [{
        client_reference: "client-jordan",
        client_email: "jordan@example.com",
        default_payment_method_id: "pm-business",
        default_payment_method_ref: "pm_wallet_4444"
      }],
      payment_methods: [{
        id: "pm-personal",
        client_id: "11111111-1111-4111-8111-111111111111",
        provider: "stripe",
        provider_customer_id: "cus_wallet",
        provider_payment_method_id: "pm_wallet_4242",
        brand: "Visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2034,
        is_default: false,
        created_at: "2026-05-01T12:00:00.000Z"
      }, {
        id: "pm-business",
        client_id: "11111111-1111-4111-8111-111111111111",
        provider: "stripe",
        provider_customer_id: "cus_wallet",
        provider_payment_method_id: "pm_wallet_4444",
        brand: "Mastercard",
        last4: "4444",
        exp_month: 11,
        exp_year: 2030,
        is_default: false,
        created_at: "2026-05-02T12:00:00.000Z"
      }]
    });

    const methods = await readClientPaymentMethodsByClientId("client-jordan", resolver.supabase as never);

    expect(methods.find((method) => method.id === "pm-business")?.isDefault).toBe(true);
    expect(methods.find((method) => method.id === "pm-personal")?.isDefault).toBe(false);
    expect(resolver.tables.payment_methods.find((row) => row.id === "pm-business")).toMatchObject({
      is_default: true
    });
  });

  it("still throws for real payment method query failures", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const resolver = createPaymentResolverSupabaseStub({
      clients: [{
        id: "11111111-1111-4111-8111-111111111111",
        reference_code: "client-jordan",
        profile_id: "profile-jordan"
      }],
      errors: {
        payment_methods: {
          code: "42501",
          message: "permission denied for table payment_methods",
          details: null
        }
      }
    });

    await expect(readClientPaymentMethodsByClientId("client-jordan", resolver.supabase as never)).rejects.toBeInstanceOf(PaymentServiceError);

    consoleErrorSpy.mockRestore();
  });
});
