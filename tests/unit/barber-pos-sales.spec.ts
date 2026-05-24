import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccount } from "@/types/domain";

const { createSupabaseAdminClientMock, createPaymentLedgerEntryMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  createPaymentLedgerEntryMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/payments/service", () => ({
  createPaymentLedgerEntry: createPaymentLedgerEntryMock
}));

import {
  BarberPosSaleError,
  chargeBarberPosSale,
  createBarberPosSale,
  createBarberPosSaleInvoice,
  createCashBarberPosSale,
  quoteBarberPosSale,
  quoteBarberPosSaleForUser,
  requestBarberPosSalePayment
} from "@/lib/barber/pos-sales";

type FakeRow = Record<string, unknown>;
type FakeTables = Record<string, FakeRow[]>;
type FakeOptions = {
  unsupportedPosSaleColumns?: string[];
  rejectPosSaleShopId?: boolean;
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

  then<TResult1 = { data: FakeRow[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: FakeRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
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

describe("barber POS sales", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    createPaymentLedgerEntryMock.mockReset();
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
      message_type: "system"
    });
    expect(String(tables.messages[0]?.body)).toContain("Phillip mcgee requested $35.00");
    expect(createPaymentLedgerEntryMock).not.toHaveBeenCalled();
    expect(tables.payment_routing_records).toHaveLength(0);
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
