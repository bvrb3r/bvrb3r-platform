import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  syncPaymentRoutingRecordMock,
  syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutionsMock,
  getStripeConnectClientMock
} = vi.hoisted(() => ({
  syncPaymentRoutingRecordMock: vi.fn(),
  syncStripeSettlementForPaymentMock: vi.fn(),
  reconcilePaymentPayoutExecutionsMock: vi.fn(),
  getStripeConnectClientMock: vi.fn()
}));

vi.mock("@/lib/fintech/service", () => ({
  syncPaymentRoutingRecord: syncPaymentRoutingRecordMock,
  syncStripeSettlementForPayment: syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutions: reconcilePaymentPayoutExecutionsMock
}));

vi.mock("@/lib/stripe/connect", () => ({
  StripeConnectError: class StripeConnectError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  getStripeConnectClient: getStripeConnectClientMock
}));

import { createCapturedStripePaymentRecord } from "@/lib/payments/service";

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | null; error: Row | null };

function createSupabaseStub(seed: {
  clients?: Row[];
  clientPreferences?: Row[];
  paymentMethods?: Row[];
  failPaymentInsert?: boolean;
} = {}) {
  const defaultPaymentMethodRow = {
    id: "pm-local-1",
    client_id: "client-live-1",
    provider: "stripe",
    provider_customer_id: "cus_live_1",
    provider_payment_method_id: "pm_stripe_1",
    brand: "Visa",
    last4: "4242",
    exp_month: 9,
    exp_year: 2029,
    is_default: true,
    created_at: "2026-04-21T12:00:00.000Z"
  };
  const tables: Record<string, Row[]> = {
    clients: seed.clients ?? [{
      id: "client-live-1",
      reference_code: "client-live-1",
      profile_id: "profile-live-1"
    }],
    client_preferences: seed.clientPreferences ?? [],
    payment_methods: seed.paymentMethods ?? [defaultPaymentMethodRow],
    saved_payment_methods: [],
    billing_customers: [],
    payments: [],
    platform_events: []
  };

  let insertedPayment: Record<string, unknown> | null = null;
  const platformEvents: Array<Record<string, unknown>> = [];

  class QueryBuilder {
    private filters: Array<[string, unknown]> = [];
    private inFilters: Array<[string, unknown[]]> = [];
    private operation: "insert" | "update" | null = null;
    private payload: Row | null = null;
    private rowLimit: number | null = null;

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    }

    in(column: string, values: unknown[]) {
      this.inFilters.push([column, values]);
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

    private execute() {
      if (this.operation === "insert" && this.payload) {
        if (this.table === "payments" && seed.failPaymentInsert) {
          return Promise.resolve({
            data: null,
            error: {
              code: "23502",
              message: "null value in column payment_type violates not-null constraint",
              details: "Failing row contains payment ledger test data.",
              hint: null
            }
          });
        }
        const row = {
          id: this.payload.id ?? (this.table === "payments" ? `pay-live-${tables[this.table].length + 1}` : `${this.table}-${tables[this.table].length + 1}`),
          created_at: this.payload.created_at ?? "2026-05-14T12:00:00.000Z",
          ...this.payload
        };
        tables[this.table].push(row);
        if (this.table === "payments") {
          insertedPayment = row;
        }
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
      const rows = tables[this.table].filter((row) => {
        const matchesEq = this.filters.every(([column, value]) => row[column] === value);
        const matchesIn = this.inFilters.every(([column, values]) => values.includes(row[column]));
        return matchesEq && matchesIn;
      });
      return this.rowLimit == null ? rows : rows.slice(0, this.rowLimit);
    }
  }

  return {
    state: {
      get insertedPayment() {
        return insertedPayment;
      },
      tables,
      platformEvents
    },
    from(table: string) {
      if (table === "platform_events") {
        return {
          upsert(row: Record<string, unknown>) {
            platformEvents.push(row);
            return Promise.resolve({ error: null });
          },
          insert(row: Record<string, unknown>) {
            platformEvents.push(row);
            return Promise.resolve({ error: null });
          }
        };
      }

      if (!tables[table]) {
        throw new Error(`Unexpected table ${table}`);
      }

      return new QueryBuilder(table);
    }
  };
}

describe("stripe payment record creation", () => {
  beforeEach(() => {
    syncPaymentRoutingRecordMock.mockReset();
    syncStripeSettlementForPaymentMock.mockReset();
    reconcilePaymentPayoutExecutionsMock.mockReset();
    getStripeConnectClientMock.mockReset();
  });

  it("attaches canonical appointment, barber, shop, and service metadata to Stripe payment intents", async () => {
    const stripeCreateMock = vi.fn().mockResolvedValue({
      id: "pi_live_1",
      status: "succeeded"
    });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: {
        create: stripeCreateMock
      }
    });

    const supabase = createSupabaseStub();

    await createCapturedStripePaymentRecord(supabase as never, {
      appointmentId: "appt-live-1",
      clientId: "client-live-1",
      shopId: "shop-live-1",
      barberId: "barber-live-1",
      serviceId: "service-live-1",
      amount: 55,
      paymentType: "booking",
      paymentMethodId: "pm-local-1",
      metadata: {
        source: "booking_engine"
      },
      createdAt: "2026-04-21T12:30:00.000Z"
    });

    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_live_1",
        payment_method: "pm_stripe_1",
        metadata: expect.objectContaining({
          appointment_id: "appt-live-1",
          barber_id: "barber-live-1",
          shop_id: "shop-live-1",
          service_id: "service-live-1"
        })
      }),
      undefined
    );
    expect(syncPaymentRoutingRecordMock).toHaveBeenCalledWith(expect.anything(), "pay-live-1");
  });

  it("falls back to the repaired client default card when booking does not send a method id", async () => {
    const stripeCreateMock = vi.fn().mockResolvedValue({
      id: "pi_live_2",
      status: "succeeded"
    });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: {
        create: stripeCreateMock
      }
    });

    const supabase = createSupabaseStub({
      clientPreferences: [{
        client_reference: "client-live-1",
        client_email: "client@example.com",
        default_payment_method_id: null,
        default_payment_method_ref: null
      }],
      paymentMethods: [{
        id: "pm-single-default",
        client_id: "client-live-1",
        provider: "stripe",
        provider_customer_id: "cus_default_1",
        provider_payment_method_id: "pm_default_4242",
        brand: "Visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2034,
        is_default: false,
        created_at: "2026-04-21T12:00:00.000Z"
      }]
    });

    await createCapturedStripePaymentRecord(supabase as never, {
      appointmentId: "appt-live-2",
      clientId: "client-live-1",
      shopId: "shop-live-1",
      barberId: "barber-live-1",
      serviceId: "service-live-1",
      amount: 5,
      paymentType: "booking",
      createdAt: "2026-04-21T12:30:00.000Z"
    });

    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_default_1",
        payment_method: "pm_default_4242"
      }),
      undefined
    );
    expect(supabase.state.tables.payment_methods[0]).toMatchObject({
      id: "pm-single-default",
      is_default: true
    });
    expect(supabase.state.insertedPayment).toMatchObject({
      payment_method_id: "pm-single-default"
    });
  });

  it("resolves selected Stripe provider payment method references for booking charges", async () => {
    const stripeCreateMock = vi.fn().mockResolvedValue({
      id: "pi_live_3",
      status: "succeeded"
    });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: {
        create: stripeCreateMock
      }
    });

    const supabase = createSupabaseStub();

    await createCapturedStripePaymentRecord(supabase as never, {
      appointmentId: "appt-live-3",
      clientId: "client-live-1",
      shopId: "shop-live-1",
      barberId: "barber-live-1",
      serviceId: "service-live-1",
      amount: 25,
      paymentType: "booking",
      paymentMethodId: "pm_stripe_1",
      createdAt: "2026-04-21T12:30:00.000Z"
    });

    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_live_1",
        payment_method: "pm_stripe_1"
      }),
      undefined
    );
  });

  it("does not fail the booking payment when payout-routing sync fails after the ledger row is saved", async () => {
    const stripeCreateMock = vi.fn().mockResolvedValue({
      id: "pi_routing_later",
      status: "succeeded"
    });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: {
        create: stripeCreateMock
      }
    });
    syncPaymentRoutingRecordMock.mockRejectedValueOnce(new Error("routing ledger temporarily unavailable"));

    const supabase = createSupabaseStub();

    const payment = await createCapturedStripePaymentRecord(supabase as never, {
      appointmentId: "appt-routing-later",
      clientId: "client-live-1",
      shopId: "shop-live-1",
      barberId: "barber-live-1",
      serviceId: "service-live-1",
      amount: 25,
      paymentType: "booking",
      paymentMethodId: "pm-local-1",
      createdAt: "2026-04-21T12:30:00.000Z"
    });

    expect(payment.id).toBe("pay-live-1");
    expect(supabase.state.insertedPayment).toMatchObject({
      appointment_id: "appt-routing-later",
      provider_payment_intent_id: "pi_routing_later"
    });
  });

  it("refunds the Stripe intent when the canonical payment ledger cannot be written", async () => {
    const stripeCreateMock = vi.fn().mockResolvedValue({
      id: "pi_ledger_failed",
      status: "succeeded"
    });
    const stripeRefundMock = vi.fn().mockResolvedValue({
      id: "re_ledger_failed"
    });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: {
        create: stripeCreateMock
      },
      refunds: {
        create: stripeRefundMock
      }
    });

    const supabase = createSupabaseStub({ failPaymentInsert: true });

    await expect(createCapturedStripePaymentRecord(supabase as never, {
      appointmentId: "appt-ledger-failed",
      clientId: "client-live-1",
      shopId: "shop-live-1",
      barberId: "barber-live-1",
      serviceId: "service-live-1",
      amount: 25,
      paymentType: "booking",
      paymentMethodId: "pm-local-1",
      idempotencyKey: "booking:appt-ledger-failed:booking:25.00",
      createdAt: "2026-04-21T12:30:00.000Z"
    })).rejects.toThrow("Payment could not be finalized, so the charge was reversed. Please try again.");

    expect(stripeRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_ledger_failed",
        amount: 2500,
        reason: "requested_by_customer"
      }),
      expect.objectContaining({
        idempotencyKey: "refund:booking:appt-ledger-failed:booking:25.00"
      })
    );
  });

  it("hydrates a saved card customer from client preferences before charging", async () => {
    const stripeCreateMock = vi.fn().mockResolvedValue({
      id: "pi_live_4",
      status: "succeeded"
    });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: {
        create: stripeCreateMock
      }
    });

    const supabase = createSupabaseStub({
      clientPreferences: [{
        client_reference: "client-live-1",
        client_email: "client@example.com",
        provider_customer_ref: "cus_preference_4242",
        default_payment_method_id: "pm-local-without-customer",
        default_payment_method_ref: "pm_preference_4242"
      }],
      paymentMethods: [{
        id: "pm-local-without-customer",
        client_id: "client-live-1",
        provider: "stripe",
        provider_customer_id: null,
        provider_payment_method_id: "pm_preference_4242",
        brand: "Visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2034,
        is_default: true,
        created_at: "2026-04-21T12:00:00.000Z"
      }]
    });

    await createCapturedStripePaymentRecord(supabase as never, {
      appointmentId: "appt-live-4",
      clientId: "client-live-1",
      shopId: "shop-live-1",
      barberId: "barber-live-1",
      serviceId: "service-live-1",
      amount: 25,
      paymentType: "booking",
      paymentMethodId: "pm-local-without-customer",
      createdAt: "2026-04-21T12:30:00.000Z"
    });

    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_preference_4242",
        payment_method: "pm_preference_4242"
      }),
      undefined
    );
  });

  it("does not charge a selected saved card that belongs to another client", async () => {
    const stripeCreateMock = vi.fn();
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: {
        create: stripeCreateMock
      }
    });

    const supabase = createSupabaseStub({
      paymentMethods: [{
        id: "pm-other-client",
        client_id: "client-someone-else",
        provider: "stripe",
        provider_customer_id: "cus_other",
        provider_payment_method_id: "pm_other_4242",
        brand: "Visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2034,
        is_default: true,
        created_at: "2026-04-21T12:00:00.000Z"
      }]
    });

    await expect(createCapturedStripePaymentRecord(supabase as never, {
      appointmentId: "appt-live-4",
      clientId: "client-live-1",
      shopId: "shop-live-1",
      barberId: "barber-live-1",
      serviceId: "service-live-1",
      amount: 25,
      paymentType: "booking",
      paymentMethodId: "pm_other_4242",
      createdAt: "2026-04-21T12:30:00.000Z"
    })).rejects.toThrow("Payment method could not be used. Please choose another card.");
    expect(stripeCreateMock).not.toHaveBeenCalled();
  });
});
