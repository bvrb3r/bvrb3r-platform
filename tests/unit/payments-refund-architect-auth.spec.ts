import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccount } from "@/types/domain";

const {
  createSupabaseAdminClientMock,
  stripeRefundCreateMock,
  syncPaymentRoutingRecordMock,
  syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutionsMock,
  reversePointsForAppointmentMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  stripeRefundCreateMock: vi.fn(),
  syncPaymentRoutingRecordMock: vi.fn(),
  syncStripeSettlementForPaymentMock: vi.fn(),
  reconcilePaymentPayoutExecutionsMock: vi.fn(),
  reversePointsForAppointmentMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/stripe/connect", () => ({
  StripeConnectError: class StripeConnectError extends Error {
    status: number;

    constructor(message: string, status = 402) {
      super(message);
      this.status = status;
    }
  },
  getStripeConnectClient: () => ({
    refunds: {
      create: stripeRefundCreateMock
    }
  })
}));

vi.mock("@/lib/fintech/service", () => ({
  syncPaymentRoutingRecord: syncPaymentRoutingRecordMock,
  syncStripeSettlementForPayment: syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutions: reconcilePaymentPayoutExecutionsMock
}));

vi.mock("@/lib/points/engine", () => ({
  reversePointsForAppointment: reversePointsForAppointmentMock
}));

import { PaymentServiceError, refundPayment } from "@/lib/payments/service";

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | Row | null; error: Row | null };

const PLATFORM_ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const BARBER_PROFILE_ID = "44444444-4444-4444-8444-444444444444";
const CLIENT_ID = "55555555-5555-4555-8555-555555555555";
const BARBER_ID = "66666666-6666-4666-8666-666666666666";
const SHOP_ID = "77777777-7777-4777-8777-777777777777";
const APPOINTMENT_ID = "88888888-8888-4888-8888-888888888888";
const PAYMENT_ID = "99999999-9999-4999-8999-999999999999";
const ROUTING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REFUND_REASON = "Cancelled appointment captured booking payment resolution";

function user(role: UserAccount["role"], id: string): UserAccount {
  return {
    id,
    role,
    email: `${id}@example.com`,
    password: "",
    name: role,
    title: role,
    locationIds: []
  };
}

function routing(overrides: Row = {}): Row {
  return {
    id: ROUTING_ID,
    payment_id: PAYMENT_ID,
    appointment_id: APPOINTMENT_ID,
    payout_readiness_status: "blocked",
    money_routing_status: "manual_review",
    reconciliation_status: "manual_review",
    released_at: null,
    refunded_amount: 0,
    ...overrides
  };
}

function createTables(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    profiles: [
      {
        id: PLATFORM_ADMIN_ID,
        email: "architect@bvrb3r.test",
        full_name: "Architect",
        role: "platform_admin",
        primary_onboarding_role: "platform_admin"
      },
      {
        id: OWNER_ID,
        email: "owner@bvrb3r.test",
        full_name: "Owner",
        role: "shop_owner_user"
      },
      {
        id: CLIENT_PROFILE_ID,
        email: "client@bvrb3r.test",
        full_name: "Client",
        role: "client_user"
      },
      {
        id: BARBER_PROFILE_ID,
        email: "barber@bvrb3r.test",
        full_name: "Barber",
        role: "barber_user"
      }
    ],
    clients: [{ id: CLIENT_ID, profile_id: CLIENT_PROFILE_ID, reference_code: "client-test" }],
    client_preferences: [{
      client_id: CLIENT_ID,
      client_reference: "client-test",
      client_email: "client@bvrb3r.test"
    }],
    payment_methods: [],
    saved_payment_methods: [],
    billing_customers: [],
    barbers: [{ id: BARBER_ID, profile_id: BARBER_PROFILE_ID }],
    appointments: [{
      id: APPOINTMENT_ID,
      reference_code: "appt-controlled-refund",
      client_id: CLIENT_ID,
      barber_id: BARBER_ID,
      shop_id: SHOP_ID,
      location_id: SHOP_ID,
      service_id: "service-cut",
      status: "cancelled",
      deposit_amount: 5,
      balance_due: 0,
      grand_total: 5,
      tip_amount: 0,
      lifecycle_revision: 3,
      completed_at: null,
      updated_at: "2026-06-20T10:00:00.000Z"
    }],
    payments: [{
      id: PAYMENT_ID,
      appointment_id: APPOINTMENT_ID,
      pos_sale_id: null,
      client_id: CLIENT_ID,
      shop_id: SHOP_ID,
      barber_id: BARBER_ID,
      payment_method_id: null,
      provider: "stripe",
      provider_payment_intent_id: "pi_controlled_refund",
      amount: 5,
      currency: "usd",
      payment_status: "captured",
      status: "captured",
      payment_type: "booking",
      paid_at: "2026-06-20T09:00:00.000Z",
      created_at: "2026-06-20T09:00:00.000Z"
    }],
    refunds: [],
    tips: [],
    payment_routing_records: [routing()],
    payout_executions: [],
    platform_events: [],
    platform_admin_audit_logs: [],
    ...overrides
  } satisfies Record<string, Row[]>;
}

function createSupabaseStub(tables: Record<string, Row[]>) {
  class QueryBuilder {
    private filters: Array<(row: Row) => boolean> = [];
    private inFilters: Array<(row: Row) => boolean> = [];
    private orderBy: { column: string; ascending: boolean } | null = null;
    private rowLimit: number | null = null;
    private operation: "insert" | "update" | "upsert" | null = null;
    private payload: Row | Row[] | null = null;
    private conflict = "id";

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    in(column: string, values: unknown[]) {
      this.inFilters.push((row) => values.includes(row[column]));
      return this;
    }

    order(column: string, options?: { ascending?: boolean }) {
      this.orderBy = { column, ascending: options?.ascending !== false };
      return this;
    }

    limit(value: number) {
      this.rowLimit = value;
      return this;
    }

    insert(payload: Row | Row[]) {
      this.operation = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: Row) {
      this.operation = "update";
      this.payload = payload;
      return this;
    }

    upsert(payload: Row | Row[], options?: { onConflict?: string }) {
      this.operation = "upsert";
      this.payload = payload;
      this.conflict = options?.onConflict ?? "id";
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

    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private execute(): Promise<QueryResult> {
      tables[this.table] ??= [];

      if (this.operation === "insert" && this.payload) {
        const entries = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = entries.map((entry) => ({
          id: entry.id ?? `${this.table}-${tables[this.table].length + 1}`,
          created_at: entry.created_at ?? "2026-06-20T10:00:00.000Z",
          ...entry
        }));
        tables[this.table].push(...inserted);
        return Promise.resolve({ data: inserted, error: null });
      }

      if (this.operation === "update" && this.payload && !Array.isArray(this.payload)) {
        const rows = this.filteredRows();
        rows.forEach((row) => Object.assign(row, this.payload));
        return Promise.resolve({ data: rows, error: null });
      }

      if (this.operation === "upsert" && this.payload) {
        const entries = Array.isArray(this.payload) ? this.payload : [this.payload];
        const upserted = entries.map((entry) => {
          const existing = tables[this.table].find((row) => entry[this.conflict] && row[this.conflict] === entry[this.conflict]);
          if (existing) {
            Object.assign(existing, entry);
            return existing;
          }
          const row = {
            id: entry.id ?? `${this.table}-${tables[this.table].length + 1}`,
            created_at: entry.created_at ?? "2026-06-20T10:00:00.000Z",
            ...entry
          };
          tables[this.table].push(row);
          return row;
        });
        return Promise.resolve({ data: upserted, error: null });
      }

      return Promise.resolve({ data: this.filteredRows(), error: null });
    }

    private filteredRows() {
      let rows = tables[this.table].filter((row) =>
        this.filters.every((filter) => filter(row)) && this.inFilters.every((filter) => filter(row))
      );
      if (this.orderBy) {
        rows = [...rows].sort((left, right) => {
          const comparison = String(left[this.orderBy!.column] ?? "").localeCompare(String(right[this.orderBy!.column] ?? ""));
          return this.orderBy!.ascending ? comparison : -comparison;
        });
      }
      return this.rowLimit == null ? rows : rows.slice(0, this.rowLimit);
    }
  }

  return {
    from(table: string) {
      return new QueryBuilder(table);
    }
  };
}

function architectRefundInput(overrides: Partial<Parameters<typeof refundPayment>[1]> = {}) {
  return {
    paymentId: PAYMENT_ID,
    amount: 5,
    reason: REFUND_REASON,
    source: "architect_finance_controlled_refund",
    confirmation: "REFUND 5",
    incidentCode: "cancelled_captured_refund_missing",
    ...overrides
  };
}

async function expectBlocked(
  tables: Record<string, Row[]>,
  input: Parameters<typeof refundPayment>[1],
  expectedStatus: number
) {
  const initialRefundCount = tables.refunds.length;
  createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(tables));
  await expect(refundPayment(user("platform_admin", PLATFORM_ADMIN_ID), input)).rejects.toMatchObject({
    status: expectedStatus
  });
  expect(stripeRefundCreateMock).not.toHaveBeenCalled();
  expect(tables.refunds).toHaveLength(initialRefundCount);
  expect(tables.payments[0]).toMatchObject({ payment_status: "captured" });
}

describe("Architect controlled refund authorization bridge", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    stripeRefundCreateMock.mockReset();
    syncPaymentRoutingRecordMock.mockReset();
    syncStripeSettlementForPaymentMock.mockReset();
    reconcilePaymentPayoutExecutionsMock.mockReset();
    reversePointsForAppointmentMock.mockReset();
    stripeRefundCreateMock.mockResolvedValue({ id: "re_architect_controlled_refund" });
    syncPaymentRoutingRecordMock.mockResolvedValue(undefined);
    syncStripeSettlementForPaymentMock.mockResolvedValue(undefined);
    reconcilePaymentPayoutExecutionsMock.mockResolvedValue(undefined);
    reversePointsForAppointmentMock.mockResolvedValue(undefined);
  });

  it("blocks platform_admin refund attempts without the Architect controlled source", async () => {
    const tables = createTables();

    await expectBlocked(tables, {
      paymentId: PAYMENT_ID,
      amount: 5,
      reason: REFUND_REASON
    }, 403);
  });

  it("blocks platform_admin controlled refunds with wrong confirmation before Stripe", async () => {
    const tables = createTables();

    await expectBlocked(tables, architectRefundInput({ confirmation: "refund 5" }), 403);
    expect(tables.platform_admin_audit_logs).toHaveLength(1);
    expect(tables.platform_events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "payment_refund_failed" })
    ]));
  });

  it("blocks platform_admin controlled refunds for non-cancelled appointments", async () => {
    const tables = createTables({
      appointments: [{ ...createTables().appointments[0], status: "completed" }]
    });

    await expectBlocked(tables, architectRefundInput(), 409);
  });

  it("blocks platform_admin controlled refunds when routing is missing or unsafe", async () => {
    const missingRoutingTables = createTables({ payment_routing_records: [] });
    await expectBlocked(missingRoutingTables, architectRefundInput(), 409);

    const unsafeRoutingTables = createTables({
      payment_routing_records: [routing({ payout_readiness_status: "ready" })]
    });
    await expectBlocked(unsafeRoutingTables, architectRefundInput(), 409);
  });

  it("blocks platform_admin controlled refunds when payout execution evidence exists", async () => {
    const tables = createTables({
      payout_executions: [{
        id: "payout-execution-1",
        payment_id: PAYMENT_ID,
        appointment_id: APPOINTMENT_ID,
        routing_record_id: ROUTING_ID,
        execution_status: "pending"
      }]
    });

    await expectBlocked(tables, architectRefundInput(), 409);
  });

  it("blocks platform_admin controlled refunds when full refund evidence already exists", async () => {
    const tables = createTables({
      refunds: [{
        id: "refund-existing-full",
        payment_id: PAYMENT_ID,
        amount: 5,
        reason: REFUND_REASON,
        provider_refund_id: "re_existing",
        refunded_at: "2026-06-20T09:30:00.000Z"
      }]
    });

    await expectBlocked(tables, architectRefundInput(), 409);
  });

  it("allows a valid platform_admin cancelled/captured blocked manual-review refund target", async () => {
    const tables = createTables();
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(tables));

    const result = await refundPayment(user("platform_admin", PLATFORM_ADMIN_ID), architectRefundInput());

    expect(stripeRefundCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      payment_intent: "pi_controlled_refund",
      amount: 500
    }), expect.objectContaining({
      idempotencyKey: `refund:${PAYMENT_ID}:5.00`
    }));
    expect(result.refund).toMatchObject({
      id: "refunds-1",
      payment_id: PAYMENT_ID,
      amount: 5,
      provider_refund_id: "re_architect_controlled_refund"
    });
    expect(result.payment).toMatchObject({
      id: PAYMENT_ID,
      paymentStatus: "refunded"
    });
    expect(tables.payment_routing_records[0].released_at).toBeNull();
    expect(tables.payout_executions).toHaveLength(0);
    expect(tables.platform_admin_audit_logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actor_role: "platform_admin",
        action_class: "finance_controlled_refund",
        action_type: "architect_cancelled_captured_refund",
        target_id: PAYMENT_ID
      })
    ]));
    expect(tables.platform_events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "payment_refunded", entity_id: PAYMENT_ID })
    ]));
  });

  it("keeps existing owner refund behavior working without Architect source", async () => {
    const tables = createTables();
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(tables));

    const result = await refundPayment(user("shop_owner_user", OWNER_ID), {
      paymentId: PAYMENT_ID,
      amount: 5,
      reason: REFUND_REASON
    });

    expect(stripeRefundCreateMock).toHaveBeenCalledOnce();
    expect(result.payment.paymentStatus).toBe("refunded");
    expect(tables.refunds).toHaveLength(1);
  });

  it("keeps client and barber refund attempts blocked", async () => {
    const clientTables = createTables();
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(clientTables));
    await expect(refundPayment(user("client_user", CLIENT_PROFILE_ID), {
      paymentId: PAYMENT_ID,
      amount: 5,
      reason: REFUND_REASON
    })).rejects.toBeInstanceOf(PaymentServiceError);
    expect(stripeRefundCreateMock).not.toHaveBeenCalled();

    const barberTables = createTables();
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(barberTables));
    await expect(refundPayment(user("barber_user", BARBER_PROFILE_ID), {
      paymentId: PAYMENT_ID,
      amount: 5,
      reason: REFUND_REASON
    })).rejects.toMatchObject({ status: 403 });
    expect(stripeRefundCreateMock).not.toHaveBeenCalled();
  });
});
