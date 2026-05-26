import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { UserAccount } from "@/types/domain";

const { createSupabaseAdminClientMock, createPaymentLedgerEntryMock, createCapturedStripePaymentRecordMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  createPaymentLedgerEntryMock: vi.fn(),
  createCapturedStripePaymentRecordMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/payments/service", () => ({
  createCapturedStripePaymentRecord: createCapturedStripePaymentRecordMock,
  createPaymentLedgerEntry: createPaymentLedgerEntryMock,
  PaymentServiceError: class PaymentServiceError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
}));

import {
  BarberPosSaleError,
  approveClientPosPaymentRequest,
  chargeBarberPosSale,
  createBarberPosSale,
  createBarberPosSaleInvoice,
  createCashBarberPosSale,
  declineClientPosPaymentRequest,
  POS_SCHEMA_TABLES,
  quoteBarberPosSale,
  quoteBarberPosSaleForUser,
  requestBarberPosSalePayment,
  retryBarberPosSalePaymentRequestMessage
} from "@/lib/barber/pos-sales";

type FakeRow = Record<string, unknown>;
type FakeTables = Record<string, FakeRow[]>;
type FakePostgresError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};
type FakeOptions = {
  unsupportedPosSaleColumns?: string[];
  rejectPosSaleShopId?: boolean;
  posSaleInsertError?: FakePostgresError;
  messageInsertError?: FakePostgresError;
  messageInsertErrors?: FakePostgresError[];
  missingTables?: string[];
};

class FakeQueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; values: unknown[] }> = [];
  private pendingInsert: FakeRow | FakeRow[] | null = null;
  private pendingUpdate: FakeRow | null = null;
  private rowLimit: number | null = null;

  constructor(
    private readonly table: string,
    private readonly tables: FakeTables,
    private readonly options: FakeOptions = {}
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilters.push({ column, values });
    return this;
  }

  insert(payload: FakeRow | FakeRow[]) {
    this.pendingInsert = payload;
    return this;
  }

  update(payload: FakeRow) {
    this.pendingUpdate = payload;
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  maybeSingle() {
    if (this.isMissingTable()) {
      return Promise.resolve({
        data: null,
        error: this.missingTableError()
      });
    }

    if (this.pendingInsert && this.table === "pos_sales" && this.options.posSaleInsertError) {
      return Promise.resolve({
        data: null,
        error: this.options.posSaleInsertError
      });
    }

    const messageInsertError = this.nextMessageInsertError();
    if (this.pendingInsert && this.table === "messages" && messageInsertError) {
      return Promise.resolve({
        data: null,
        error: messageInsertError
      });
    }

    if (this.pendingInsert && this.hasRejectedPosSaleShopId(this.pendingInsert)) {
      return Promise.resolve({
        data: null,
        error: {
          code: "23503",
          details: "Key (shop_id)=(loc-ybor) is not present in table \"locations\".",
          message: "insert or update on table \"pos_sales\" violates foreign key constraint \"pos_sales_shop_id_fkey\""
        }
      });
    }

    if (this.pendingInsert && this.hasUnsupportedPosSaleColumn(this.pendingInsert)) {
      return Promise.resolve({
        data: null,
        error: { code: "42703", message: "column payment_method does not exist" }
      });
    }

    if (this.pendingUpdate && this.hasUnsupportedPosSaleColumn(this.pendingUpdate)) {
      return Promise.resolve({
        data: null,
        error: { code: "42703", message: "column payment_method does not exist" }
      });
    }

    if (this.pendingInsert) {
      const inserted = this.insertRows();
      return Promise.resolve({ data: inserted[0] ?? null, error: null });
    }

    if (this.pendingUpdate) {
      const updated = this.updateRows();
      return Promise.resolve({ data: updated[0] ?? null, error: null });
    }

    return Promise.resolve({
      data: this.filteredRows()[0] ?? null,
      error: null
    });
  }

  single() {
    return this.maybeSingle();
  }

  then<TResult1 = { data: FakeRow[]; error: FakePostgresError | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: FakeRow[]; error: FakePostgresError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    if (this.isMissingTable()) {
      return Promise.resolve({ data: [], error: this.missingTableError() }).then(onfulfilled, onrejected);
    }

    const messageInsertError = this.nextMessageInsertError();
    if (this.pendingInsert && this.table === "messages" && messageInsertError) {
      return Promise.resolve({ data: [], error: messageInsertError }).then(onfulfilled, onrejected);
    }

    const rows = this.pendingInsert
      ? this.insertRows()
      : this.pendingUpdate
        ? this.updateRows()
        : this.filteredRows();
    const data = this.rowLimit === null ? rows : rows.slice(0, this.rowLimit);
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }

  private filteredRows() {
    const rows = this.tables[this.table] ?? [];
    return rows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value)
      && this.inFilters.every((filter) => filter.values.includes(row[filter.column]))
    );
  }

  private insertRows() {
    const rows = Array.isArray(this.pendingInsert) ? this.pendingInsert : [this.pendingInsert];
    const tableRows = this.tables[this.table] ?? [];
    this.tables[this.table] = tableRows;
    const inserted = rows.filter((row): row is FakeRow => Boolean(row)).map((row) => ({
      id: row.id ?? `${this.table}-${tableRows.length + 1}`,
      ...row
    }));
    tableRows.push(...inserted);
    this.pendingInsert = null;
    return inserted;
  }

  private nextMessageInsertError() {
    if (this.table !== "messages" || !this.pendingInsert) {
      return null;
    }

    return this.options.messageInsertErrors?.shift() ?? this.options.messageInsertError ?? null;
  }

  private updateRows() {
    const rows = this.filteredRows();
    rows.forEach((row) => Object.assign(row, this.pendingUpdate));
    this.pendingUpdate = null;
    return rows;
  }

  private hasUnsupportedPosSaleColumn(payload: FakeRow | FakeRow[] | null) {
    if (this.table !== "pos_sales" || !payload || !this.options.unsupportedPosSaleColumns?.length) {
      return false;
    }

    const rows = Array.isArray(payload) ? payload : [payload];
    return rows.some((row) => this.options.unsupportedPosSaleColumns?.some((column) => column in row));
  }

  private hasRejectedPosSaleShopId(payload: FakeRow | FakeRow[] | null) {
    if (this.table !== "pos_sales" || !payload || !this.options.rejectPosSaleShopId) {
      return false;
    }

    const rows = Array.isArray(payload) ? payload : [payload];
    return rows.some((row) => Boolean(row.shop_id));
  }

  private isMissingTable() {
    return Boolean(this.options.missingTables?.includes(this.table));
  }

  private missingTableError(): FakePostgresError {
    return {
      code: "PGRST205",
      message: `Could not find the table 'public.${this.table}' in the schema cache`,
      details: null,
      hint: "Maybe the table was not created or PostgREST needs a schema reload."
    } as FakePostgresError;
  }
}

function createSupabaseMock(tables: FakeTables, options: FakeOptions = {}) {
  return {
    from(table: string) {
      return new FakeQueryBuilder(table, tables, options);
    }
  };
}

function barberUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "profile-phillip",
    role: "barber_user",
    email: "phillip@example.com",
    password: "",
    name: "Phillip mcgee",
    title: "Barber",
    locationIds: [],
    barberId: "barber-43b3cda2",
    barberSubtype: "freelance",
    ...overrides
  };
}

function clientUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "profile-client",
    role: "client_user",
    email: "client@example.com",
    password: "",
    name: "Jordan Client",
    title: "Client",
    locationIds: [],
    clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
    ...overrides
  };
}

describe("barber POS sales", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    createPaymentLedgerEntryMock.mockReset();
    createCapturedStripePaymentRecordMock.mockReset();
  });

  it("keeps POS table names aligned with production migrations", () => {
    const initialMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260522160000_add_barber_pos_sales.sql"),
      "utf8"
    );
    const ensureMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260524110000_ensure_pos_sales_schema.sql"),
      "utf8"
    );
    const actionMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260525120000_pos_payment_request_actions.sql"),
      "utf8"
    );
    const messageHardeningMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260525143000_harden_pos_payment_request_messages.sql"),
      "utf8"
    );
    const messageDeliveryMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260525153000_pos_payment_request_message_delivery_shape.sql"),
      "utf8"
    );
    const idempotencyMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260525170000_harden_pos_payment_request_idempotency.sql"),
      "utf8"
    );
    const migrationSql = `${initialMigration}\n${ensureMigration}\n${actionMigration}\n${messageHardeningMigration}\n${messageDeliveryMigration}\n${idempotencyMigration}`;

    expect(POS_SCHEMA_TABLES).toEqual({
      sales: "pos_sales",
      saleItems: "pos_sale_items",
      paymentRequests: "pos_payment_requests"
    });
    expect(migrationSql).toContain("create table if not exists public.pos_sales");
    expect(migrationSql).toContain("create table if not exists public.pos_sale_items");
    expect(migrationSql).toContain("create table if not exists public.pos_payment_requests");
    expect(migrationSql).toContain("add column if not exists metadata jsonb");
    expect(migrationSql).toContain("check (message_type in ('text', 'system'))");
    expect(migrationSql).toContain("add column if not exists paid_at timestamptz");
    expect(migrationSql).toContain("pending_message_failed");
    expect(migrationSql).toContain("superseded");
    expect(migrationSql).toContain("pos_payment_requests_one_active_per_sale_idx");
    expect(migrationSql).toContain("notify pgrst, 'reload schema'");
    expect(migrationSql).not.toContain("barber_pos_sales");
  });

  it("calculates the freelance POS quote platform fee and barber payout", () => {
    const quote = quoteBarberPosSale({ amountCents: 3500 });

    expect(quote).toMatchObject({
      subtotalCents: 3500,
      platformFeeCents: 175,
      barberPayoutCents: 3325,
      shopSplitCents: 0,
      relationshipType: "freelance"
    });
  });

  it("lets a barber_user quote by public barber reference", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      profiles: [{
        id: "profile-phillip",
        email: "phillip@example.com",
        role: "barber_user"
      }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }]
    }));

    const quote = await quoteBarberPosSaleForUser(barberUser(), { amountCents: 3500 });

    expect(quote).toMatchObject({
      platformFeeCents: 175,
      barberPayoutCents: 3325,
      shopSplitCents: 0,
      relationshipType: "freelance"
    });
  });

  it("lets a legacy barber quote by canonical barber id", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      profiles: [{
        id: "profile-legacy",
        email: "legacy@example.com",
        role: "barber"
      }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-legacy",
        reference_code: "barber-legacy",
        compensation_model: "freelance",
        commission_rate: null
      }]
    }));

    const quote = await quoteBarberPosSaleForUser(barberUser({
      id: "profile-legacy",
      role: "barber",
      email: "legacy@example.com",
      barberId: "455c2930-7255-418b-bd2b-cc64bc0fc9b7"
    }), { amountCents: 3500 });

    expect(quote.barberPayoutCents).toBe(3325);
  });

  it("lets a freelance barber with no shop quote from profile_id", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      profiles: [{
        id: "profile-phillip",
        email: "phillip@example.com",
        role: "barber_user"
      }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        barber_subtype: "freelance",
        commission_rate: null
      }]
    }));

    const quote = await quoteBarberPosSaleForUser(barberUser({
      barberId: undefined,
      locationIds: []
    }), { amountCents: 3500 });

    expect(quote.relationshipType).toBe("freelance");
    expect(quote.shopSplitCents).toBe(0);
  });

  it("returns a clear error when the signed-in barber has no barber row", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      profiles: [{
        id: "profile-phillip",
        email: "phillip@example.com",
        role: "barber_user"
      }],
      barbers: []
    }));

    await expect(quoteBarberPosSaleForUser(barberUser(), { amountCents: 3500 }))
      .rejects
      .toMatchObject({
        name: "BarberPosSaleError",
        status: 404,
        message: "Barber account not found for POS sale."
      } satisfies Partial<BarberPosSaleError>);

    expect(warnSpy).toHaveBeenCalledWith("[barber-pos] resolve_failed", expect.objectContaining({
      viewerProfileId: "profile-phillip",
      role: "barber_user",
      email: "phillip@example.com"
    }));
    warnSpy.mockRestore();
  });

  it("records cash POS sales without creating payment routing", async () => {
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [],
      pos_sales: [],
      pos_sale_items: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const recorded = await createCashBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "cash"
    });

    expect(recorded).toMatchObject({
      ok: true,
      payment: null,
      routing: null,
      cashRecorded: true
    });
    expect(tables.pos_sales[0]).toMatchObject({
      status: "paid",
      payment_method: "cash",
      platform_fee_cents: 0
    });
    expect(createPaymentLedgerEntryMock).not.toHaveBeenCalled();
    expect(tables.payment_routing_records).toHaveLength(0);
  });

  it("records cash POS sales when a booth-rent shop scope cannot be resolved", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "booth_rent",
        commission_rate: null
      }],
      locations: [],
      clients: [],
      pos_sales: [],
      pos_sale_items: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const recorded = await createCashBarberPosSale(barberUser({
      barberSubtype: "booth_rent",
      locationIds: ["loc-ybor"]
    }), {
      amountCents: 3500,
      paymentMethod: "cash"
    });

    expect(recorded.ok).toBe(true);
    expect(tables.pos_sales[0]).toMatchObject({
      status: "paid",
      shop_id: null,
      payment_method: "cash"
    });
    expect(warnSpy).toHaveBeenCalledWith("[barber-pos] shop_scope_defaulted", expect.objectContaining({
      stage: "resolve_shop_scope",
      attemptedShopId: "loc-ybor"
    }));
    warnSpy.mockRestore();
  });

  it("retries cash POS sale creation without shop_id when production rejects the scoped shop", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "booth_rent",
        commission_rate: null
      }],
      locations: [{ id: "67ad0d9b-4f60-44e6-a213-86f665324574", reference_code: "loc-ybor" }],
      clients: [],
      pos_sales: [],
      pos_sale_items: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      rejectPosSaleShopId: true
    }));

    const recorded = await createCashBarberPosSale(barberUser({
      barberSubtype: "booth_rent",
      locationIds: ["loc-ybor"]
    }), {
      amountCents: 3500,
      paymentMethod: "cash"
    });

    expect(recorded.ok).toBe(true);
    expect(tables.pos_sales).toHaveLength(1);
    expect(tables.pos_sales[0]).toMatchObject({
      status: "paid",
      shop_id: null,
      payment_method: "cash"
    });
    expect(warnSpy).toHaveBeenCalledWith("[barber-pos] shop_scope_defaulted", expect.objectContaining({
      stage: "cash_sale_insert",
      attemptedShopId: "67ad0d9b-4f60-44e6-a213-86f665324574"
    }));
    warnSpy.mockRestore();
  });

  it("returns debug metadata when production rejects POS sale constraints", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [],
      pos_sales: [],
      pos_sale_items: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      posSaleInsertError: {
        code: "23514",
        message: "new row for relation \"pos_sales\" violates check constraint \"pos_sales_status_ck\"",
        details: "Failing row contains a status rejected by production.",
        hint: "Use a production-legal POS status."
      }
    }));

    await expect(createCashBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "cash"
    }))
      .rejects
      .toMatchObject({
        name: "BarberPosSaleError",
        status: 500,
        message: "Unable to create the POS sale.",
        debugCode: "check_constraint_violation",
        failedTable: "pos_sales",
        failedConstraint: "pos_sales_status_ck",
        failedColumn: null
      } satisfies Partial<BarberPosSaleError>);

    expect(warnSpy).toHaveBeenCalledWith("[barber-pos] create_failed", expect.objectContaining({
      route: "POST /api/barber/pos-sales/cash",
      payment_method: "cash",
      failedTable: "pos_sales",
      failedConstraint: "pos_sales_status_ck",
      debugCode: "check_constraint_violation"
    }));
    warnSpy.mockRestore();
  });

  it("returns missing-table diagnostics when PostgREST cannot find pos_sales", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      missingTables: [POS_SCHEMA_TABLES.sales]
    }));

    await expect(createCashBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "cash"
    }))
      .rejects
      .toMatchObject({
        name: "BarberPosSaleError",
        status: 500,
        message: "Unable to create the POS sale.",
        debugCode: "missing_table",
        failedTable: "pos_sales",
        failedConstraint: null,
        failedColumn: null
      } satisfies Partial<BarberPosSaleError>);

    expect(warnSpy).toHaveBeenCalledWith("[barber-pos] schema_verification_failed", expect.objectContaining({
      route: "POST /api/barber/pos-sales/cash",
      table: "pos_sales",
      postgresCode: "PGRST205",
      debugCode: "missing_table"
    }));
    warnSpy.mockRestore();
  });

  it("charges card POS sales through the payment ledger with a POS sale id", async () => {
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      payment_methods: [{
        id: "payment-method-1",
        client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        provider_payment_method_id: "pm_test_4242",
        brand: "visa",
        last4: "4242",
        is_default: true
      }],
      pos_sales: [],
      pos_sale_items: [],
      payment_routing_records: [{
        id: "routing-pos-1",
        payment_id: "payment-pos-1",
        pos_sale_id: "pos_sales-1",
        payout_readiness_status: "ready",
        money_routing_status: "pending",
        eligible_at: "2026-05-23T12:00:00.000Z",
        released_at: null,
        barber_payout_amount: 33.25,
        platform_fee_amount: 1.75,
        shop_split_amount: 0
      }]
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));
    createPaymentLedgerEntryMock.mockResolvedValue({
      id: "payment-pos-1",
      posSaleId: "pos_sales-1"
    });

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const charged = await chargeBarberPosSale(barberUser(), created.sale.id, { paymentMethod: "card_on_file" });

    expect(createPaymentLedgerEntryMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      posSaleId: created.sale.id,
      paymentType: "pos_sale",
      paymentStatus: "captured",
      paymentMethodId: "payment-method-1",
      metadata: expect.objectContaining({
        paymentMethod: "card_on_file"
      })
    }));
    expect(charged.routing).toMatchObject({
      pos_sale_id: created.sale.id,
      payout_readiness_status: "ready"
    });
  });

  it("resolves profile ids to canonical client ids for card POS sales", async () => {
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "43b3cda2-3fe0-4632-95bb-56c005b5a3cf",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "43b3cda2-3fe0-4632-95bb-56c005b5a3cf"
    });

    expect(tables.pos_sales[0]).toMatchObject({
      client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
  });

  it("blocks card POS charges when the selected client has no saved card", async () => {
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      payment_methods: [],
      pos_sales: [],
      pos_sale_items: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });

    await expect(chargeBarberPosSale(barberUser(), created.sale.id, { paymentMethod: "card_on_file" }))
      .rejects
      .toMatchObject({
        name: "BarberPosSaleError",
        status: 409,
        message: "Client has no saved card. Use cash or send link later."
      } satisfies Partial<BarberPosSaleError>);
  });

  it("creates a pending client-approved card request without payment or routing", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const request = await requestBarberPosSalePayment(barberUser(), created.sale.id);

    expect(request).toMatchObject({
      ok: true,
      payment: null,
      routing: null,
      alreadyRequested: false,
      requestId: request.request.id,
      posSaleId: created.sale.id,
      messageThreadId: "message_threads-1",
      paymentCardDelivered: true,
      fallbackPlainMessageSent: false,
      reusedExistingRequest: false,
      duplicateSaleVoided: false,
      messageDeliveryStatus: "delivered",
      message: "Payment request sent. Client approval is required before payout."
    });
    expect(tables.pos_payment_requests[0]).toMatchObject({
      pos_sale_id: created.sale.id,
      barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
      client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
      amount_cents: 3500,
      status: "pending"
    });
    expect(tables.messages[0]).toMatchObject({
      sender_profile_id: "profile-phillip",
      message_type: "system",
      metadata: expect.objectContaining({
        kind: "pos_payment_request",
        paymentRequestId: request.request.id,
        posSaleId: created.sale.id,
        amountCents: 3500,
        status: "pending"
      })
    });
    expect(String(tables.messages[0]?.body)).toContain("Phillip mcgee requested $35.00");
    expect(createPaymentLedgerEntryMock).not.toHaveBeenCalled();
    expect(tables.payment_routing_records).toHaveLength(0);
  });

  it("returns the existing active request when card approval is sent twice for the same POS sale", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const first = await requestBarberPosSalePayment(barberUser(), created.sale.id);
    const second = await requestBarberPosSalePayment(barberUser(), created.sale.id);

    expect(second).toMatchObject({
      ok: true,
      alreadyRequested: true,
      request: expect.objectContaining({ id: first.request.id }),
      paymentCardDelivered: true,
      reusedExistingRequest: true,
      duplicateSaleVoided: false
    });
    expect(tables.pos_payment_requests).toHaveLength(1);
    expect(tables.messages.filter((message) => {
      const metadata = message.metadata as { kind?: string } | undefined;
      return metadata?.kind === "pos_payment_request";
    })).toHaveLength(1);
  });

  it("reuses an active duplicate request instead of creating a second card for the same client and amount", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const firstSale = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const firstRequest = await requestBarberPosSalePayment(barberUser(), firstSale.sale.id);
    const secondSale = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const secondRequest = await requestBarberPosSalePayment(barberUser(), secondSale.sale.id);

    expect(secondRequest).toMatchObject({
      ok: true,
      alreadyRequested: true,
      request: expect.objectContaining({ id: firstRequest.request.id }),
      sale: expect.objectContaining({ id: firstSale.sale.id }),
      paymentCardDelivered: true,
      reusedExistingRequest: true,
      duplicateSaleVoided: true
    });
    expect(tables.pos_payment_requests).toHaveLength(1);
    expect(tables.pos_sales.find((sale) => sale.id === secondSale.sale.id)).toMatchObject({
      status: "voided"
    });
  });

  it("keeps a pending request when structured payment request message delivery fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      messageInsertError: {
        code: "PGRST204",
        message: "Could not find the 'metadata' column of 'messages' in the schema cache",
        details: null,
        hint: "Reload the schema cache"
      }
    }));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const request = await requestBarberPosSalePayment(barberUser(), created.sale.id);

    expect(request).toMatchObject({
      ok: true,
      payment: null,
      routing: null,
      alreadyRequested: false,
      messageDeliveryStatus: "failed",
      error: "Unable to send the POS payment request message.",
      message: "Request created, but message delivery failed. Retry sending message.",
      debugCode: "missing_column",
      failedTable: "messages",
      failedColumn: "metadata"
    });
    expect(tables.pos_payment_requests[0]).toMatchObject({
      status: "pending_message_failed",
      message_thread_id: "message_threads-1"
    });
    expect(tables.messages).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith("[barber-pos] create_failed", expect.objectContaining({
      route: "POST /api/barber/pos-sales/[id]/payment-request",
      stage: "pos_payment_request_message_insert",
      posSaleId: created.sale.id,
      paymentRequestId: request.request.id,
      threadId: "message_threads-1",
      failedTable: "messages",
      failedColumn: "metadata",
      debugCode: "missing_column"
    }));
    warnSpy.mockRestore();
  });

  it("falls back to a plain text message when metadata delivery is rejected", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      messageInsertErrors: [{
        code: "PGRST204",
        message: "Could not find the 'metadata' column of 'messages' in the schema cache",
        details: null,
        hint: "Reload the schema cache"
      }]
    }));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const request = await requestBarberPosSalePayment(barberUser(), created.sale.id);

    expect(request).toMatchObject({
      ok: true,
      requestId: request.request.id,
      posSaleId: created.sale.id,
      messageThreadId: "message_threads-1",
      paymentCardDelivered: true,
      fallbackPlainMessageSent: true,
      reusedExistingRequest: false,
      duplicateSaleVoided: false,
      messageDeliveryStatus: "delivered",
      message: "Payment request sent. Client approval is required before payout."
    });
    expect(tables.pos_payment_requests[0]).toMatchObject({
      status: "pending",
      message_thread_id: "message_threads-1"
    });
    expect(tables.messages).toHaveLength(1);
    expect(tables.messages[0]).toMatchObject({
      thread_id: "message_threads-1",
      sender_profile_id: "profile-phillip",
      message_type: "system"
    });
    expect(tables.messages[0].metadata).toBeUndefined();
    expect(String(tables.messages[0].body)).toContain("Phillip mcgee requested $35.00");
    expect(String(tables.messages[0].body)).toContain(`Payment request ID: ${request.request.id}`);
  });

  it("does not duplicate the plain fallback message when retry still cannot insert metadata", async () => {
    const metadataError = {
      code: "PGRST204",
      message: "Could not find the 'metadata' column of 'messages' in the schema cache",
      details: null,
      hint: "Reload the schema cache"
    };
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      messageInsertErrors: [metadataError]
    }));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const initial = await requestBarberPosSalePayment(barberUser(), created.sale.id);
    expect(initial.messageDeliveryStatus).toBe("delivered");
    expect(initial.paymentCardDelivered).toBe(true);
    expect(initial.fallbackPlainMessageSent).toBe(true);
    expect(tables.messages).toHaveLength(1);

    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      messageInsertErrors: [metadataError]
    }));
    const retried = await retryBarberPosSalePaymentRequestMessage(barberUser(), created.sale.id);

    expect(retried).toMatchObject({
      ok: true,
      messageDeliveryStatus: "delivered",
      paymentCardDelivered: true,
      fallbackPlainMessageSent: true,
      reusedExistingRequest: true,
      request: expect.objectContaining({
        id: initial.request.id,
        status: "pending"
      })
    });
    expect(tables.messages).toHaveLength(1);
    expect(String(tables.messages[0].body)).toContain(`Payment request ID: ${initial.request.id}`);
  });

  it("retries a failed POS payment request message and restores pending state", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      messageInsertError: {
        code: "PGRST204",
        message: "Could not find the 'metadata' column of 'messages' in the schema cache"
      }
    }));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const failed = await requestBarberPosSalePayment(barberUser(), created.sale.id);
    expect(failed.request.status).toBe("pending_message_failed");

    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));
    const retried = await retryBarberPosSalePaymentRequestMessage(barberUser(), created.sale.id);

    expect(retried).toMatchObject({
      ok: true,
      messageDeliveryStatus: "delivered",
      message: "Payment request sent. Client approval is required before payout.",
      request: expect.objectContaining({
        id: failed.request.id,
        status: "pending"
      })
    });
    expect(tables.pos_payment_requests[0]).toMatchObject({
      status: "pending"
    });
    expect(tables.messages[0]).toMatchObject({
      thread_id: "message_threads-1",
      metadata: expect.objectContaining({
        kind: "pos_payment_request",
        paymentRequestId: failed.request.id,
        posSaleId: created.sale.id,
        amountCents: 3500
      })
    });
  });

  it("does not duplicate a POS payment request card on retry when metadata message already exists", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [{
        id: "pos-sale-existing",
        barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        shop_id: null,
        client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        customer_name: "Jordan Client",
        source: "barber_keypad",
        status: "payment_pending",
        payment_method: "card_on_file",
        payment_status: "pending_client_approval",
        subtotal_cents: 3500,
        discount_cents: 0,
        tip_cents: 0,
        platform_fee_cents: 175,
        client_fee_cents: 0,
        total_cents: 3500,
        payment_id: null,
        note: null,
        created_by_profile_id: "profile-phillip",
        created_at: "2026-05-25T12:00:00.000Z",
        updated_at: "2026-05-25T12:00:00.000Z"
      }],
      pos_sale_items: [],
      pos_payment_requests: [{
        id: "request-existing",
        pos_sale_id: "pos-sale-existing",
        barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        amount_cents: 3500,
        status: "pending_message_failed",
        requested_at: "2026-05-25T12:00:00.000Z",
        approved_at: null,
        declined_at: null,
        expires_at: null,
        message_thread_id: "thread-existing",
        payment_id: null,
        created_at: "2026-05-25T12:00:00.000Z",
        updated_at: "2026-05-25T12:00:00.000Z"
      }],
      message_threads: [{
        id: "thread-existing",
        thread_type: "client_barber",
        appointment_id: null,
        location_id: null,
        created_by_profile_id: "profile-phillip",
        created_at: "2026-05-25T12:00:00.000Z",
        updated_at: "2026-05-25T12:00:00.000Z"
      }],
      thread_participants: [
        { id: "participant-client", thread_id: "thread-existing", profile_id: "profile-client", thread_role: "client_user" },
        { id: "participant-barber", thread_id: "thread-existing", profile_id: "profile-phillip", thread_role: "barber_user" }
      ],
      messages: [{
        id: "message-existing",
        thread_id: "thread-existing",
        sender_profile_id: "profile-phillip",
        body: "Phillip mcgee requested $35.00 for a walk-in service.",
        message_type: "system",
        metadata: {
          kind: "pos_payment_request",
          paymentRequestId: "request-existing",
          posSaleId: "pos-sale-existing",
          amountCents: 3500,
          status: "pending"
        },
        created_at: "2026-05-25T12:00:00.000Z"
      }],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const retried = await retryBarberPosSalePaymentRequestMessage(barberUser(), "pos-sale-existing");

    expect(retried).toMatchObject({
      ok: true,
      messageDeliveryStatus: "delivered",
      request: expect.objectContaining({
        id: "request-existing",
        status: "pending"
      })
    });
    expect(tables.messages).toHaveLength(1);
  });

  it("approves a pending client card request by charging the saved card and loading routing", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));
    createCapturedStripePaymentRecordMock.mockResolvedValue({
      id: "payment-pos-approved",
      posSaleId: "pos_sales-1"
    });

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const pending = await requestBarberPosSalePayment(barberUser(), created.sale.id);
    tables.payment_routing_records.push({
      id: "routing-pos-approved",
      payment_id: "payment-pos-approved",
      pos_sale_id: created.sale.id,
      payout_readiness_status: "ready",
      money_routing_status: "pending",
      eligible_at: "2026-05-25T12:00:00.000Z",
      released_at: null,
      barber_payout_amount: 33.25,
      platform_fee_amount: 1.75,
      shop_split_amount: 0,
      updated_at: "2026-05-25T12:00:00.000Z"
    });

    const approved = await approveClientPosPaymentRequest(clientUser(), pending.request.id);

    expect(createCapturedStripePaymentRecordMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      appointmentId: null,
      posSaleId: created.sale.id,
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
      paymentType: "pos_sale",
      amount: 35,
      metadata: expect.objectContaining({
        source: "client_pos_payment_request_approval",
        paymentRequestId: pending.request.id
      })
    }));
    expect(approved.request).toMatchObject({
      status: "paid",
      payment_id: "payment-pos-approved"
    });
    expect(approved.sale).toMatchObject({
      status: "paid",
      payment_method: "card_on_file",
      payment_id: "payment-pos-approved"
    });
    expect(approved.routing).toMatchObject({
      pos_sale_id: created.sale.id,
      payout_readiness_status: "ready"
    });
    expect(tables.messages.some((message) => String(message.body).includes("Payment approved. $35.00 collected."))).toBe(true);
  });

  it("supersedes sibling pending duplicate requests when one card request is approved", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [{
        id: "pos-sale-paid",
        barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        shop_id: null,
        client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        customer_name: "Jordan Client",
        source: "barber_keypad",
        status: "payment_pending",
        payment_method: "card_on_file",
        payment_status: "pending_client_approval",
        subtotal_cents: 3500,
        discount_cents: 0,
        tip_cents: 0,
        platform_fee_cents: 175,
        client_fee_cents: 0,
        total_cents: 3500,
        payment_id: null,
        note: null,
        created_by_profile_id: "profile-phillip",
        created_at: "2026-05-25T20:03:00.000Z",
        updated_at: "2026-05-25T20:03:00.000Z"
      }, {
        id: "pos-sale-duplicate",
        barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        shop_id: null,
        client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        customer_name: "Jordan Client",
        source: "barber_keypad",
        status: "payment_pending",
        payment_method: "card_on_file",
        payment_status: "pending_client_approval",
        subtotal_cents: 3500,
        discount_cents: 0,
        tip_cents: 0,
        platform_fee_cents: 175,
        client_fee_cents: 0,
        total_cents: 3500,
        payment_id: null,
        note: null,
        created_by_profile_id: "profile-phillip",
        created_at: "2026-05-25T20:05:00.000Z",
        updated_at: "2026-05-25T20:05:00.000Z"
      }],
      pos_sale_items: [],
      pos_payment_requests: [{
        id: "request-paid",
        pos_sale_id: "pos-sale-paid",
        barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        amount_cents: 3500,
        status: "pending",
        requested_at: "2026-05-25T20:03:00.000Z",
        approved_at: null,
        declined_at: null,
        expires_at: null,
        message_thread_id: "thread-paid",
        payment_id: null,
        created_at: "2026-05-25T20:03:00.000Z",
        updated_at: "2026-05-25T20:03:00.000Z"
      }, {
        id: "request-duplicate",
        pos_sale_id: "pos-sale-duplicate",
        barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        amount_cents: 3500,
        status: "pending",
        requested_at: "2026-05-25T20:05:00.000Z",
        approved_at: null,
        declined_at: null,
        expires_at: null,
        message_thread_id: "thread-duplicate",
        payment_id: null,
        created_at: "2026-05-25T20:05:00.000Z",
        updated_at: "2026-05-25T20:05:00.000Z"
      }],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: [{
        id: "routing-pos-approved",
        payment_id: "payment-pos-approved",
        pos_sale_id: "pos-sale-paid",
        payout_readiness_status: "ready",
        money_routing_status: "pending",
        eligible_at: "2026-05-25T20:06:00.000Z",
        released_at: null,
        barber_payout_amount: 33.25,
        platform_fee_amount: 1.75,
        shop_split_amount: 0,
        updated_at: "2026-05-25T20:06:00.000Z"
      }]
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));
    createCapturedStripePaymentRecordMock.mockResolvedValue({
      id: "payment-pos-approved",
      posSaleId: "pos-sale-paid"
    });

    const approved = await approveClientPosPaymentRequest(clientUser(), "request-paid");

    expect(approved.request).toMatchObject({
      id: "request-paid",
      status: "paid"
    });
    expect(tables.pos_payment_requests.find((request) => request.id === "request-duplicate")).toMatchObject({
      status: "superseded"
    });
    expect(tables.pos_sales.find((sale) => sale.id === "pos-sale-duplicate")).toMatchObject({
      status: "voided"
    });
    expect(createCapturedStripePaymentRecordMock).toHaveBeenCalledTimes(1);
    expect(tables.messages.some((message) => String(message.body).includes("Payment request superseded."))).toBe(true);
  });

  it("declines a pending client card request without payment or routing", async () => {
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const pending = await requestBarberPosSalePayment(barberUser(), created.sale.id);
    const declined = await declineClientPosPaymentRequest(clientUser(), pending.request.id);

    expect(declined).toMatchObject({
      ok: true,
      payment: null,
      routing: null,
      request: expect.objectContaining({ status: "declined" }),
      sale: expect.objectContaining({ status: "voided" })
    });
    expect(createCapturedStripePaymentRecordMock).not.toHaveBeenCalled();
    expect(tables.payment_routing_records).toHaveLength(0);
    expect(tables.messages.some((message) => String(message.body).includes("Payment request declined."))).toBe(true);
  });

  it("returns missing-table diagnostics when PostgREST cannot find pos_payment_requests", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      missingTables: [POS_SCHEMA_TABLES.paymentRequests]
    }));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });

    await expect(requestBarberPosSalePayment(barberUser(), created.sale.id))
      .rejects
      .toMatchObject({
        name: "BarberPosSaleError",
        status: 500,
        message: "Unable to create the POS payment request.",
        debugCode: "missing_table",
        failedTable: "pos_payment_requests"
      } satisfies Partial<BarberPosSaleError>);

    expect(warnSpy).toHaveBeenCalledWith("[barber-pos] schema_verification_failed", expect.objectContaining({
      route: "POST /api/barber/pos-sales/[id]/payment-request",
      table: "pos_payment_requests",
      postgresCode: "PGRST205",
      debugCode: "missing_table"
    }));
    warnSpy.mockRestore();
  });

  it("creates a card request after retrying POS sale creation without rejected shop scope", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables: FakeTables = {
      profiles: [
        { id: "profile-phillip", email: "phillip@example.com", role: "barber_user", full_name: "Phillip mcgee" },
        { id: "profile-client", email: "client@example.com", role: "client_user", full_name: "Jordan Client" }
      ],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "booth_rent",
        commission_rate: null
      }],
      locations: [{ id: "67ad0d9b-4f60-44e6-a213-86f665324574", reference_code: "loc-ybor" }],
      clients: [{
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        profile_id: "profile-client",
        reference_code: "client-phillip"
      }],
      pos_sales: [],
      pos_sale_items: [],
      pos_payment_requests: [],
      message_threads: [],
      thread_participants: [],
      messages: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      rejectPosSaleShopId: true
    }));

    const created = await createBarberPosSale(barberUser({
      barberSubtype: "booth_rent",
      locationIds: ["loc-ybor"]
    }), {
      amountCents: 3500,
      paymentMethod: "card_on_file",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065"
    });
    const request = await requestBarberPosSalePayment(barberUser({
      barberSubtype: "booth_rent",
      locationIds: ["loc-ybor"]
    }), created.sale.id);

    expect(created.sale).toMatchObject({
      status: "payment_pending",
      shop_id: null,
      payment_method: "card_on_file"
    });
    expect(request).toMatchObject({
      ok: true,
      request: expect.objectContaining({ status: "pending" }),
      payment: null,
      routing: null
    });
    expect(tables.pos_payment_requests).toHaveLength(1);
    expect(tables.messages[0]?.body).toContain("Phillip mcgee requested $35.00");
    expect(warnSpy).toHaveBeenCalledWith("[barber-pos] shop_scope_defaulted", expect.objectContaining({
      stage: "pos_sale_insert",
      attemptedShopId: "67ad0d9b-4f60-44e6-a213-86f665324574"
    }));
    warnSpy.mockRestore();
  });

  it("falls back to legacy POS columns when payment method columns are not migrated yet", async () => {
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      pos_sales: [],
      pos_sale_items: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables, {
      unsupportedPosSaleColumns: ["payment_method", "cash_recorded_at", "customer_phone", "customer_email", "invoice_status"]
    }));

    const recorded = await createCashBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "cash"
    });

    expect(recorded.sale).toMatchObject({
      status: "paid"
    });
    expect(tables.pos_sales[0]).not.toHaveProperty("payment_method");
    expect(createPaymentLedgerEntryMock).not.toHaveBeenCalled();
  });

  it("keeps invoice POS sales pending without payment routing until paid", async () => {
    const tables: FakeTables = {
      profiles: [{ id: "profile-phillip", email: "phillip@example.com", role: "barber_user" }],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "profile-phillip",
        reference_code: "barber-43b3cda2",
        compensation_model: "freelance",
        commission_rate: null
      }],
      pos_sales: [],
      pos_sale_items: [],
      payment_routing_records: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const created = await createBarberPosSale(barberUser(), {
      amountCents: 3500,
      paymentMethod: "invoice",
      customerEmail: "client@example.com"
    });
    const invoice = await createBarberPosSaleInvoice(barberUser(), created.sale.id, {
      customerEmail: "client@example.com"
    });

    expect(invoice.sale).toMatchObject({
      status: "payment_pending",
      payment_method: "invoice",
      invoice_status: "pending"
    });
    expect(createPaymentLedgerEntryMock).not.toHaveBeenCalled();
    expect(tables.payment_routing_records).toHaveLength(0);
  });
});
