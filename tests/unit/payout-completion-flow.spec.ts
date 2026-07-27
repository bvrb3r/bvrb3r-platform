import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock, isSupabaseEnabledMock, syncWalletBalancesForPaymentMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn(() => true),
  syncWalletBalancesForPaymentMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: isSupabaseEnabledMock
}));

vi.mock("@/lib/wallet/service", () => ({
  syncWalletBalancesForPayment: syncWalletBalancesForPaymentMock
}));

vi.mock("@/lib/trust/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trust/engine")>("@/lib/trust/engine");
  return {
    getTrustProvider: async () => ({
      readState: async () => actual.createEmptyTrustState()
    })
  };
});

import { resolveBarberAppointmentActionContext } from "@/lib/barber/appointment-actions";
import { calculatePaymentRouting } from "@/lib/fintech/domain";
import { evaluatePayoutEligibilityForAppointment, getBarberPayouts, syncPaymentRoutingRecord } from "@/lib/fintech/service";

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | null; error: Row | null };

const CLIENT_ID = "6607bce8-3636-46e8-9bbd-eabd9e5ad065";
const BARBER_PROFILE_ID = "43b3cda2-3fe0-4632-95bb-56c005b5a3cf";
const BARBER_ID = "455c2930-7255-418b-bd2b-cc64bc0fc9b7";
const APPOINTMENT_ID = "37cdb825-a65d-5cda-b58d-5b5efaedbfc0";
const APPOINTMENT_REFERENCE = "appt-1778939666238-vgukd";
const LOCATION_ID = "67ad0d9b-4f60-44e6-a213-86f665324574";
const PAYMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POS_SALE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POS_PAYMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function createTables(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    profiles: [{
      id: BARBER_PROFILE_ID,
      email: "phillipmcgee813@gmail.com",
      role: "barber_user"
    }],
    barbers: [{
      id: BARBER_ID,
      reference_code: "barber-43b3cda2",
      profile_id: BARBER_PROFILE_ID,
      barber_subtype: "freelance",
      compensation_model: "freelance",
      autobooth_percent: null,
      booth_rent_amount: null,
      booth_rent_frequency: null
    }],
    appointments: [{
      id: APPOINTMENT_ID,
      reference_code: APPOINTMENT_REFERENCE,
      status: "completed",
      membership_id: null,
      barber_id: BARBER_ID,
      shop_id: null,
      location_id: LOCATION_ID,
      client_id: CLIENT_ID
    }],
    payments: [{
      id: PAYMENT_ID,
      appointment_id: APPOINTMENT_ID,
      client_id: CLIENT_ID,
      shop_id: null,
      barber_id: BARBER_ID,
      provider: "stripe",
      provider_payment_intent_id: "pi_test_paid",
      amount: 5,
      currency: "usd",
      status: "captured",
      payment_status: "captured",
      payment_type: "booking",
      paid_at: "2026-05-16T14:30:00.000Z",
      created_at: "2026-05-16T14:30:00.000Z",
      updated_at: "2026-05-16T14:30:00.000Z"
    }],
    refunds: [],
    disputes: [],
    staff_locations: [],
    connected_accounts: [],
    legal_acceptances: [],
    billing_subscriptions: [],
    payment_routing_records: [],
    pos_sales: [],
    platform_events: [],
    ...overrides
  } satisfies Record<string, Row[]>;
}

function createSupabaseStub(tables: Record<string, Row[]>) {
  class QueryBuilder {
    private filters: Array<(row: Row) => boolean> = [];
    private operation: "insert" | "update" | "upsert" | null = null;
    private payload: Row | Row[] | null = null;
    private rowLimit: number | null = null;
    private orderBy: { column: string; ascending: boolean } | null = null;
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
      this.filters.push((row) => values.includes(row[column]));
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
          created_at: entry.created_at ?? "2026-05-16T14:30:00.000Z",
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
            created_at: entry.created_at ?? "2026-05-16T14:30:00.000Z",
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
      let rows = tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
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

describe("payout completion flow", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    isSupabaseEnabledMock.mockReturnValue(true);
    syncWalletBalancesForPaymentMock.mockReset();
    syncWalletBalancesForPaymentMock.mockResolvedValue({ transactions: [], balances: [] });
  });

  it("marks a completed paid freelance appointment as payout eligible", async () => {
    const tables = createTables();
    const supabase = createSupabaseStub(tables);

    const result = await evaluatePayoutEligibilityForAppointment(supabase as never, APPOINTMENT_ID);

    expect(result).toMatchObject({
      appointmentId: APPOINTMENT_ID,
      paymentId: PAYMENT_ID,
      relationshipType: "freelance",
      status: "eligible",
      barberAmountCents: 475,
      shopAmountCents: 0,
      platformAmountCents: 25
    });
    expect(tables.payment_routing_records[0]).toMatchObject({
      payment_id: PAYMENT_ID,
      appointment_id: APPOINTMENT_ID,
      routing_model: "freelance",
      payout_readiness_status: "ready",
      money_routing_status: "pending",
      platform_fee_amount: 0.25,
      barber_payout_amount: 4.75,
      shop_split_amount: 0,
      eligible_at: expect.any(String),
      released_at: null,
      processor_charge_id: "pi_test_paid",
      metadata: expect.objectContaining({
        repairReason: "missing_routing_record_on_completion",
        source: "barber_complete_service",
        relationshipType: "freelance",
        readinessMeaning: "eligible",
        payoutReadinessDbValue: "ready",
        moneyRoutingDbValue: "pending",
        appointmentId: APPOINTMENT_ID,
        paymentId: PAYMENT_ID,
        barberId: BARBER_ID,
        clientId: CLIENT_ID
      })
    });
    expect(Object.keys(tables.payment_routing_records[0])).not.toEqual(expect.arrayContaining([
      "total_cents",
      "relationship_type",
      "gross_amount_cents",
      "platform_fee_cents",
      "barber_amount_cents",
      "shop_amount_cents",
      "status",
      "hold_reason"
    ]));
    expect(tables.platform_events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "payment_routing_created" }),
      expect.objectContaining({ event_type: "payout_eligible" })
    ]));
  });

  it("accepts captured payment from the legacy status column during routing repair", async () => {
    const tables = createTables({
      payments: [{
        ...createTables().payments[0],
        status: "captured",
        payment_status: "pending"
      }]
    });
    const supabase = createSupabaseStub(tables);

    const result = await evaluatePayoutEligibilityForAppointment(supabase as never, APPOINTMENT_ID);

    expect(result).toMatchObject({
      status: "eligible",
      payoutReadinessStatus: "ready",
      barberAmountCents: 475,
      platformAmountCents: 25,
      shopAmountCents: 0
    });
    expect(tables.payment_routing_records[0]).toMatchObject({
      payment_id: PAYMENT_ID,
      appointment_id: APPOINTMENT_ID,
      payout_readiness_status: "ready",
      money_routing_status: "pending",
      eligible_at: expect.any(String)
    });
  });

  it("keeps a paid standalone POS payout blocked without connected-account readiness", async () => {
    const tables = createTables({
      pos_sales: [{
        id: POS_SALE_ID,
        barber_id: BARBER_ID,
        shop_id: null,
        client_id: null,
        customer_name: "Walk-in client",
        source: "barber_keypad",
        status: "paid",
        subtotal_cents: 3500,
        discount_cents: 0,
        tip_cents: 0,
        platform_fee_cents: 175,
        client_fee_cents: 0,
        total_cents: 3500,
        payment_id: POS_PAYMENT_ID,
        note: null,
        created_by_profile_id: BARBER_PROFILE_ID,
        created_at: "2026-05-16T14:30:00.000Z",
        updated_at: "2026-05-16T14:30:00.000Z"
      }],
      payments: [{
        id: POS_PAYMENT_ID,
        appointment_id: null,
        pos_sale_id: POS_SALE_ID,
        client_id: null,
        shop_id: null,
        barber_id: BARBER_ID,
        provider: "stripe",
        provider_payment_intent_id: "pi_pos_paid",
        amount: 35,
        currency: "usd",
        status: "captured",
        payment_status: "captured",
        payment_type: "pos_sale",
        paid_at: "2026-05-16T14:30:00.000Z",
        created_at: "2026-05-16T14:30:00.000Z",
        updated_at: "2026-05-16T14:30:00.000Z"
      }]
    });
    const supabase = createSupabaseStub(tables);

    const routing = await syncPaymentRoutingRecord(supabase as never, POS_PAYMENT_ID);

    if (!routing) {
      throw new Error("Expected a standalone POS routing record.");
    }

    expect(routing).toMatchObject({
      payment_id: POS_PAYMENT_ID,
      appointment_id: null,
      pos_sale_id: POS_SALE_ID,
      routing_model: "freelance",
      payout_readiness_status: "blocked",
      money_routing_status: "ready_for_payout",
      platform_fee_amount: 1.75,
      barber_payout_amount: 33.25,
      shop_split_amount: 0,
      eligible_at: expect.any(String),
      released_at: null
    });
    expect(routing.blocked_reason).toMatch(/verification.*approved/i);
    expect(Object.keys(tables.payment_routing_records[0])).not.toEqual(expect.arrayContaining([
      "relationship_type",
      "gross_amount_cents",
      "platform_fee_cents",
      "barber_amount_cents",
      "shop_amount_cents",
      "status",
      "hold_reason",
      "total_cents"
    ]));
  });

  it("ignores stale eligible constraint values for routing writes", async () => {
    const tables = createTables({
      "information_schema.check_constraints": [{
        constraint_name: "payment_routing_records_payout_readiness_status_check",
        check_clause: "CHECK ((payout_readiness_status = ANY (ARRAY['not_ready'::text, 'needs_attention'::text, 'eligible'::text, 'ready'::text, 'blocked'::text])))"
      }, {
        constraint_name: "payment_routing_records_money_routing_status_check",
        check_clause: "CHECK ((money_routing_status = ANY (ARRAY['pending'::text, 'ready_for_payout'::text, 'blocked'::text, 'refunded'::text])))"
      }, {
        constraint_name: "payment_routing_records_reconciliation_status_check",
        check_clause: "CHECK ((reconciliation_status = ANY (ARRAY['open'::text, 'manual_review'::text])))"
      }]
    });
    const supabase = createSupabaseStub(tables);

    const result = await evaluatePayoutEligibilityForAppointment(supabase as never, APPOINTMENT_ID);

    expect(result).toMatchObject({
      status: "eligible",
      payoutReadinessStatus: "ready"
    });
    expect(tables.payment_routing_records[0]).toMatchObject({
      payout_readiness_status: "ready",
      money_routing_status: "pending",
      metadata: expect.objectContaining({
        readinessMeaning: "eligible",
        payoutReadinessDbValue: "ready"
      })
    });
  });

  it("keeps captured payments on cancelled appointments blocked and in manual review", async () => {
    const tables = createTables({
      appointments: [{
        ...createTables().appointments[0],
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createTables().payments[0],
        status: "captured",
        payment_status: "captured"
      }]
    });
    const supabase = createSupabaseStub(tables);

    const routing = await syncPaymentRoutingRecord(supabase as never, PAYMENT_ID);
    if (!routing) {
      throw new Error("Expected routing row for captured cancelled payment.");
    }

    expect(routing).toMatchObject({
      appointment_id: APPOINTMENT_ID,
      payment_id: PAYMENT_ID,
      payout_readiness_status: "blocked",
      money_routing_status: "manual_review",
      reconciliation_status: "manual_review",
      platform_fee_amount: 0,
      barber_payout_amount: 0,
      shop_split_amount: 0,
      eligible_at: null,
      released_at: null,
      held_at: expect.any(String)
    });
    expect(String(routing.blocked_reason)).toContain("cancelled appointment");
    expect(tables.platform_events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "payout_eligible" })
    ]));
  });

  it("uses appointment_id to find and update an existing routing repair row", async () => {
    const tables = createTables({
      payment_routing_records: [{
        id: "routing-existing-by-appointment",
        payment_id: "old-payment-id",
        appointment_id: APPOINTMENT_ID,
        membership_id: null,
        routing_model: "freelance",
        payout_recipient_type: "barber",
        provider_gross_amount: 5,
        refunded_amount: 0,
        provider_fee_amount: 0,
        provider_net_amount: 5,
        platform_fee_amount: 0,
        barber_payout_amount: 0,
        shop_split_amount: 0,
        currency: "usd",
        payout_readiness_status: "needs_attention",
        money_routing_status: "pending",
        blocked_reason: null,
        eligible_at: null,
        held_at: null,
        released_at: null,
        reversed_at: null,
        processor_charge_id: null,
        processor_balance_transaction_id: null,
        reconciliation_status: "open",
        metadata: {},
        created_at: "2026-05-16T14:30:00.000Z",
        updated_at: "2026-05-16T14:30:00.000Z"
      }]
    });
    const supabase = createSupabaseStub(tables);

    const result = await evaluatePayoutEligibilityForAppointment(supabase as never, APPOINTMENT_ID);

    expect(result.routingRecordId).toBe("routing-existing-by-appointment");
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      id: "routing-existing-by-appointment",
      payment_id: PAYMENT_ID,
      appointment_id: APPOINTMENT_ID,
      payout_readiness_status: "ready",
      platform_fee_amount: 0.25,
      barber_payout_amount: 4.75,
      shop_split_amount: 0
    });
  });

  it("does not make failed payments payout eligible", async () => {
    const tables = createTables({
      payments: [{
        ...createTables().payments[0],
        status: "failed",
        payment_status: "failed"
      }]
    });
    const supabase = createSupabaseStub(tables);

    const result = await evaluatePayoutEligibilityForAppointment(supabase as never, APPOINTMENT_REFERENCE);

    expect(result.status).toBe("pending");
    expect(tables.payment_routing_records[0]).toMatchObject({
      money_routing_status: "blocked",
      blocked_reason: "Payment was not captured successfully."
    });
  });

  it("holds payout eligibility when an active dispute exists", async () => {
    const tables = createTables({
      disputes: [{
        id: "dispute-1",
        appointment_reference: APPOINTMENT_REFERENCE,
        dispute_status: "open"
      }]
    });
    const supabase = createSupabaseStub(tables);

    const result = await evaluatePayoutEligibilityForAppointment(supabase as never, APPOINTMENT_ID);

    expect(result.status).toBe("held");
    expect(tables.payment_routing_records[0]).toMatchObject({
      money_routing_status: "blocked",
      blocked_reason: "An active dispute or chargeback is blocking payout.",
      held_at: expect.any(String)
    });
    expect(tables.platform_events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "payout_held" })
    ]));
  });

  it("counts completed captured ready routing as barber eligible balance before release", async () => {
    const tables = createTables({
      payment_routing_records: [{
        id: "routing-ready-balance",
        payment_id: PAYMENT_ID,
        appointment_id: APPOINTMENT_ID,
        membership_id: null,
        routing_model: "freelance",
        payout_recipient_type: "barber",
        provider_gross_amount: 5,
        refunded_amount: 0,
        provider_fee_amount: 0,
        provider_net_amount: 5,
        platform_fee_amount: 0.25,
        barber_payout_amount: 4.75,
        shop_split_amount: 0,
        currency: "usd",
        payout_readiness_status: "ready",
        money_routing_status: "pending",
        blocked_reason: null,
        eligible_at: "2026-05-16T14:30:00.000Z",
        held_at: null,
        released_at: null,
        reversed_at: null,
        processor_charge_id: "pi_test_paid",
        processor_balance_transaction_id: null,
        reconciliation_status: "open",
        metadata: {},
        created_at: "2026-05-16T14:30:00.000Z",
        updated_at: "2026-05-16T14:30:00.000Z"
      }]
    });
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(tables));

    const result = await getBarberPayouts({
      id: BARBER_PROFILE_ID,
      role: "barber_user",
      email: "phillipmcgee813@gmail.com",
      password: "DevOnly!123",
      name: "Phillip mcgee",
      title: "Freelance Barber",
      locationIds: [],
      barberId: "barber-43b3cda2",
      barberSubtype: "freelance"
    });

    expect(result.summary).toMatchObject({
      eligibleRoutingRecords: 1,
      eligiblePayoutAmount: 4.75,
      executableRoutingRecords: 0,
      readyForPayoutAmount: 0,
      executedAmount: 0
    });
  });

  it("includes paid POS sale routing in barber eligible payout balance", async () => {
    const tables = createTables({
      pos_sales: [{
        id: POS_SALE_ID,
        barber_id: BARBER_ID,
        shop_id: null,
        client_id: null,
        customer_name: "Walk-in client",
        source: "barber_keypad",
        status: "paid",
        subtotal_cents: 3500,
        discount_cents: 0,
        tip_cents: 0,
        platform_fee_cents: 175,
        client_fee_cents: 0,
        total_cents: 3500,
        payment_id: POS_PAYMENT_ID,
        note: null,
        created_by_profile_id: BARBER_PROFILE_ID,
        created_at: "2026-05-16T14:30:00.000Z",
        updated_at: "2026-05-16T14:30:00.000Z"
      }],
      payments: [{
        ...createTables().payments[0],
        id: POS_PAYMENT_ID,
        appointment_id: null,
        pos_sale_id: POS_SALE_ID,
        amount: 35,
        provider_payment_intent_id: "pi_pos_paid",
        payment_type: "pos_sale"
      }],
      payment_routing_records: [{
        id: "routing-pos-ready-balance",
        payment_id: POS_PAYMENT_ID,
        appointment_id: null,
        pos_sale_id: POS_SALE_ID,
        membership_id: null,
        routing_model: "freelance",
        payout_recipient_type: "barber",
        provider_gross_amount: 35,
        refunded_amount: 0,
        provider_fee_amount: 0,
        provider_net_amount: 35,
        platform_fee_amount: 1.75,
        barber_payout_amount: 33.25,
        shop_split_amount: 0,
        currency: "usd",
        payout_readiness_status: "ready",
        money_routing_status: "pending",
        blocked_reason: null,
        eligible_at: "2026-05-16T14:30:00.000Z",
        held_at: null,
        released_at: null,
        reversed_at: null,
        processor_charge_id: "pi_pos_paid",
        processor_balance_transaction_id: null,
        reconciliation_status: "open",
        metadata: {},
        created_at: "2026-05-16T14:30:00.000Z",
        updated_at: "2026-05-16T14:30:00.000Z"
      }]
    });
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(tables));

    const result = await getBarberPayouts({
      id: BARBER_PROFILE_ID,
      role: "barber_user",
      email: "phillipmcgee813@gmail.com",
      password: "DevOnly!123",
      name: "Phillip mcgee",
      title: "Freelance Barber",
      locationIds: [],
      barberId: "barber-43b3cda2",
      barberSubtype: "freelance"
    });

    expect(result.summary).toMatchObject({
      eligibleRoutingRecords: 1,
      eligiblePayoutAmount: 33.25,
      executedAmount: 0
    });
  });

  it("keeps booth-rent POS service routing as barber payout in payout reporting", async () => {
    const tables = createTables({
      barbers: [{
        ...createTables().barbers[0],
        barber_subtype: "booth_rent",
        compensation_model: "booth_rent",
        booth_rent_amount: 250,
        booth_rent_frequency: "weekly"
      }],
      pos_sales: [{
        id: POS_SALE_ID,
        barber_id: BARBER_ID,
        shop_id: LOCATION_ID,
        client_id: null,
        customer_name: "Booth client",
        source: "barber_keypad",
        status: "paid",
        subtotal_cents: 10000,
        discount_cents: 0,
        tip_cents: 0,
        platform_fee_cents: 500,
        client_fee_cents: 0,
        total_cents: 10000,
        payment_id: POS_PAYMENT_ID,
        note: null,
        created_by_profile_id: BARBER_PROFILE_ID,
        created_at: "2026-05-16T14:30:00.000Z",
        updated_at: "2026-05-16T14:30:00.000Z"
      }],
      payments: [{
        ...createTables().payments[0],
        id: POS_PAYMENT_ID,
        appointment_id: null,
        pos_sale_id: POS_SALE_ID,
        shop_id: LOCATION_ID,
        amount: 100,
        provider_payment_intent_id: "pi_pos_booth_rent_paid",
        payment_type: "pos_sale"
      }],
      payment_routing_records: [{
        id: "routing-pos-booth-rent",
        payment_id: POS_PAYMENT_ID,
        appointment_id: null,
        pos_sale_id: POS_SALE_ID,
        membership_id: null,
        routing_model: "booth_rent",
        payout_recipient_type: "barber",
        provider_gross_amount: 100,
        refunded_amount: 0,
        provider_fee_amount: 0,
        provider_net_amount: 100,
        platform_fee_amount: 5,
        barber_payout_amount: 95,
        shop_split_amount: 0,
        currency: "usd",
        payout_readiness_status: "ready",
        money_routing_status: "pending",
        blocked_reason: null,
        eligible_at: "2026-05-16T14:30:00.000Z",
        held_at: null,
        released_at: null,
        reversed_at: null,
        processor_charge_id: "pi_pos_booth_rent_paid",
        processor_balance_transaction_id: null,
        reconciliation_status: "open",
        metadata: {},
        created_at: "2026-05-16T14:30:00.000Z",
        updated_at: "2026-05-16T14:30:00.000Z"
      }]
    });
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(tables));

    const result = await getBarberPayouts({
      id: BARBER_PROFILE_ID,
      role: "barber_user",
      email: "phillipmcgee813@gmail.com",
      password: "DevOnly!123",
      name: "Phillip mcgee",
      title: "Booth Rent Barber",
      locationIds: [LOCATION_ID],
      barberId: "barber-43b3cda2",
      barberSubtype: "booth_rent"
    });

    const transaction = result.transactions.find((entry) => entry.id === `pos:${POS_SALE_ID}`);
    expect(result.summary).toMatchObject({
      eligibleRoutingRecords: 1,
      eligiblePayoutAmount: 95
    });
    expect(transaction).toMatchObject({
      routingModel: "booth_rent",
      platformFeeAmount: 5,
      barberPayoutAmount: 95,
      shopSplitAmount: 0,
      postureLabel: "Service payout goes to barber after BVRB3R fee. Booth rent is billed separately."
    });
  });

  it("counts eligible status and excludes released, refunded, blocked, and incomplete routing rows", async () => {
    const base = createTables();
    const tables = createTables({
      appointments: [
        base.appointments[0],
        { ...base.appointments[0], id: "appointment-released", status: "completed" },
        { ...base.appointments[0], id: "appointment-refunded", status: "completed" },
        { ...base.appointments[0], id: "appointment-blocked", status: "completed" },
        { ...base.appointments[0], id: "appointment-confirmed", status: "confirmed" }
      ],
      payments: [
        base.payments[0],
        { ...base.payments[0], id: "payment-released", appointment_id: "appointment-released" },
        { ...base.payments[0], id: "payment-refunded", appointment_id: "appointment-refunded", payment_status: "refunded", status: "refunded" },
        { ...base.payments[0], id: "payment-blocked", appointment_id: "appointment-blocked" },
        { ...base.payments[0], id: "payment-confirmed", appointment_id: "appointment-confirmed" }
      ],
      payment_routing_records: [
        {
          id: "routing-eligible-balance",
          payment_id: PAYMENT_ID,
          appointment_id: APPOINTMENT_ID,
          membership_id: null,
          routing_model: "freelance",
          payout_recipient_type: "barber",
          provider_gross_amount: 5,
          refunded_amount: 0,
          provider_fee_amount: 0,
          provider_net_amount: 5,
          platform_fee_amount: 0.25,
          barber_payout_amount: 4.75,
          shop_split_amount: 0,
          currency: "usd",
          payout_readiness_status: "eligible",
          money_routing_status: "pending",
          blocked_reason: null,
          eligible_at: "2026-05-16T14:30:00.000Z",
          held_at: null,
          released_at: null,
          reversed_at: null,
          processor_charge_id: null,
          processor_balance_transaction_id: null,
          reconciliation_status: "open",
          metadata: {},
          created_at: "2026-05-16T14:30:00.000Z",
          updated_at: "2026-05-16T14:30:00.000Z"
        },
        {
          id: "routing-released",
          payment_id: "payment-released",
          appointment_id: "appointment-released",
          membership_id: null,
          routing_model: "freelance",
          payout_recipient_type: "barber",
          provider_gross_amount: 5,
          refunded_amount: 0,
          provider_fee_amount: 0,
          provider_net_amount: 5,
          platform_fee_amount: 0.25,
          barber_payout_amount: 4.75,
          shop_split_amount: 0,
          currency: "usd",
          payout_readiness_status: "eligible",
          money_routing_status: "pending",
          blocked_reason: null,
          eligible_at: "2026-05-16T14:30:00.000Z",
          held_at: null,
          released_at: "2026-05-16T15:30:00.000Z",
          reversed_at: null,
          processor_charge_id: null,
          processor_balance_transaction_id: null,
          reconciliation_status: "open",
          metadata: {},
          created_at: "2026-05-16T14:30:00.000Z",
          updated_at: "2026-05-16T14:30:00.000Z"
        },
        {
          id: "routing-refunded",
          payment_id: "payment-refunded",
          appointment_id: "appointment-refunded",
          membership_id: null,
          routing_model: "freelance",
          payout_recipient_type: "barber",
          provider_gross_amount: 5,
          refunded_amount: 5,
          provider_fee_amount: 0,
          provider_net_amount: 0,
          platform_fee_amount: 0,
          barber_payout_amount: 0,
          shop_split_amount: 0,
          currency: "usd",
          payout_readiness_status: "eligible",
          money_routing_status: "refunded",
          blocked_reason: null,
          eligible_at: "2026-05-16T14:30:00.000Z",
          held_at: null,
          released_at: null,
          reversed_at: null,
          processor_charge_id: null,
          processor_balance_transaction_id: null,
          reconciliation_status: "open",
          metadata: {},
          created_at: "2026-05-16T14:30:00.000Z",
          updated_at: "2026-05-16T14:30:00.000Z"
        },
        {
          id: "routing-blocked",
          payment_id: "payment-blocked",
          appointment_id: "appointment-blocked",
          membership_id: null,
          routing_model: "freelance",
          payout_recipient_type: "barber",
          provider_gross_amount: 5,
          refunded_amount: 0,
          provider_fee_amount: 0,
          provider_net_amount: 5,
          platform_fee_amount: 0.25,
          barber_payout_amount: 4.75,
          shop_split_amount: 0,
          currency: "usd",
          payout_readiness_status: "blocked",
          money_routing_status: "blocked",
          blocked_reason: "An active dispute or chargeback is blocking payout.",
          eligible_at: null,
          held_at: "2026-05-16T14:30:00.000Z",
          released_at: null,
          reversed_at: null,
          processor_charge_id: null,
          processor_balance_transaction_id: null,
          reconciliation_status: "open",
          metadata: {},
          created_at: "2026-05-16T14:30:00.000Z",
          updated_at: "2026-05-16T14:30:00.000Z"
        },
        {
          id: "routing-confirmed",
          payment_id: "payment-confirmed",
          appointment_id: "appointment-confirmed",
          membership_id: null,
          routing_model: "freelance",
          payout_recipient_type: "barber",
          provider_gross_amount: 5,
          refunded_amount: 0,
          provider_fee_amount: 0,
          provider_net_amount: 5,
          platform_fee_amount: 0.25,
          barber_payout_amount: 4.75,
          shop_split_amount: 0,
          currency: "usd",
          payout_readiness_status: "eligible",
          money_routing_status: "pending",
          blocked_reason: null,
          eligible_at: "2026-05-16T14:30:00.000Z",
          held_at: null,
          released_at: null,
          reversed_at: null,
          processor_charge_id: null,
          processor_balance_transaction_id: null,
          reconciliation_status: "open",
          metadata: {},
          created_at: "2026-05-16T14:30:00.000Z",
          updated_at: "2026-05-16T14:30:00.000Z"
        }
      ]
    });
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(tables));

    const result = await getBarberPayouts({
      id: BARBER_PROFILE_ID,
      role: "barber_user",
      email: "phillipmcgee813@gmail.com",
      password: "DevOnly!123",
      name: "Phillip mcgee",
      title: "Freelance Barber",
      locationIds: [],
      barberId: "barber-43b3cda2",
      barberSubtype: "freelance"
    });

    expect(result.summary.eligibleRoutingRecords).toBe(1);
    expect(result.summary.eligiblePayoutAmount).toBe(4.75);
  });

  it("routes booth rent appointment money to the barber, not the shop", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 100,
      routingModel: "booth_rent",
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(Math.round(result.platformFeeAmount * 100)).toBe(500);
    expect(Math.round(result.barberPayoutAmount * 100)).toBe(9500);
    expect(Math.round(result.shopSplitAmount * 100)).toBe(0);
    expect(result.payoutRecipientType).toBe("barber");
  });

  it("applies the AutoBooth portion after the platform fee and caps it at rent owed", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 100,
      routingModel: "autobooth_rent",
      autoBoothPercent: 0.7,
      outstandingRentCents: 100_000,
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(Math.round(result.platformFeeAmount * 100)).toBe(500);
    // 70% of the 9500 distributable service money retires rent.
    expect(Math.round(result.autoBoothRentAppliedAmount * 100)).toBe(6650);
    expect(Math.round(result.shopSplitAmount * 100)).toBe(6650);
    expect(Math.round(result.barberPayoutAmount * 100)).toBe(2850);
    expect(result.payoutRecipientType).toBe("split");
  });

  it("never applies more AutoBooth rent than the barber still owes", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 100,
      routingModel: "autobooth_rent",
      autoBoothPercent: 0.7,
      // Only $10 of rent is still outstanding.
      outstandingRentCents: 1_000,
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(Math.round(result.autoBoothRentAppliedAmount * 100)).toBe(1_000);
    expect(Math.round(result.shopSplitAmount * 100)).toBe(1_000);
    // Everything above the rent owed stays with the barber.
    expect(Math.round(result.barberPayoutAmount * 100)).toBe(8_500);
  });

  it("rejects completing another barber's appointment", async () => {
    const tables = createTables({
      appointments: [{
        ...createTables().appointments[0],
        barber_id: "99999999-9999-4999-8999-999999999999",
        status: "in_service"
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    await expect(resolveBarberAppointmentActionContext({
      user: {
        id: BARBER_PROFILE_ID,
        role: "barber_user",
        email: "phillipmcgee813@gmail.com",
        password: "DevOnly!123",
        name: "Phillip mcgee",
        title: "Freelance Barber",
        locationIds: [],
        barberId: "barber-43b3cda2",
        barberSubtype: "freelance"
      },
      appointmentId: APPOINTMENT_REFERENCE,
      allowedStatuses: ["confirmed", "checked_in", "in_service"]
    })).rejects.toMatchObject({
      status: 403,
      message: "Appointment does not belong to this barber."
    });
  });

  it("resolves a barber-owned appointment from the real appointment UUID", async () => {
    const tables = createTables({
      appointments: [{
        ...createTables().appointments[0],
        status: "confirmed"
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const context = await resolveBarberAppointmentActionContext({
      user: {
        id: BARBER_PROFILE_ID,
        role: "barber_user",
        email: "phillipmcgee813@gmail.com",
        password: "DevOnly!123",
        name: "Phillip mcgee",
        title: "Freelance Barber",
        locationIds: [],
        barberId: "barber-43b3cda2",
        barberSubtype: "freelance"
      },
      appointmentId: APPOINTMENT_ID,
      allowedStatuses: ["confirmed"]
    });

    expect(context.appointment.id).toBe(APPOINTMENT_ID);
    expect(context.providerAppointmentId).toBe(APPOINTMENT_REFERENCE);
  });

  it("allows complete action context for already completed appointments so routing can be repaired", async () => {
    const tables = createTables();
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const context = await resolveBarberAppointmentActionContext({
      user: {
        id: BARBER_PROFILE_ID,
        role: "barber_user",
        email: "phillipmcgee813@gmail.com",
        password: "DevOnly!123",
        name: "Phillip mcgee",
        title: "Freelance Barber",
        locationIds: [],
        barberId: "barber-43b3cda2",
        barberSubtype: "freelance"
      },
      appointmentId: APPOINTMENT_ID,
      allowedStatuses: ["confirmed", "checked_in", "in_service", "completed"]
    });

    expect(context.appointment.status).toBe("completed");
    expect(context.providerAppointmentId).toBe(APPOINTMENT_REFERENCE);
  });

  it("rejects check-in from the wrong appointment status", async () => {
    const tables = createTables({
      appointments: [{
        ...createTables().appointments[0],
        status: "completed"
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    await expect(resolveBarberAppointmentActionContext({
      user: {
        id: BARBER_PROFILE_ID,
        role: "barber_user",
        email: "phillipmcgee813@gmail.com",
        password: "DevOnly!123",
        name: "Phillip mcgee",
        title: "Freelance Barber",
        locationIds: [],
        barberId: "barber-43b3cda2",
        barberSubtype: "freelance"
      },
      appointmentId: APPOINTMENT_ID,
      allowedStatuses: ["confirmed"]
    })).rejects.toMatchObject({
      status: 409
    });
  });
});
