import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  evaluatePayoutEligibilityForAppointmentMock,
  getStripeConnectClientMock,
  syncPaymentRoutingRecordMock,
  syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutionsMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  evaluatePayoutEligibilityForAppointmentMock: vi.fn(),
  getStripeConnectClientMock: vi.fn(),
  syncPaymentRoutingRecordMock: vi.fn(),
  syncStripeSettlementForPaymentMock: vi.fn(),
  reconcilePaymentPayoutExecutionsMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => true
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/trust/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trust/engine")>("@/lib/trust/engine");
  return {
    getTrustProvider: async () => ({
      readState: async () => actual.createEmptyTrustState()
    })
  };
});

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

vi.mock("@/lib/fintech/service", () => ({
  evaluatePayoutEligibilityForAppointment: evaluatePayoutEligibilityForAppointmentMock,
  syncPaymentRoutingRecord: syncPaymentRoutingRecordMock,
  syncStripeSettlementForPayment: syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutions: reconcilePaymentPayoutExecutionsMock
}));

vi.mock("@/lib/monetization/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/monetization/service")>("@/lib/monetization/service");
  return {
    ...actual,
    readActiveClientMembershipSubscription: vi.fn().mockResolvedValue(null)
  };
});

import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { canonicalAppointmentUuid } from "@/lib/booking/canonical-booking";

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | null; error: Row | null };

const CLIENT_PROFILE_ID = "1fd26b88-3c68-465f-8a71-f09e614b1bd4";
const CLIENT_ID = "6607bce8-3636-46e8-9bbd-eabd9e5ad065";
const BARBER_PROFILE_ID = "43b3cda2-3fe0-4632-95bb-56c005b5a3cf";
const BARBER_ID = "455c2930-7255-418b-bd2b-cc64bc0fc9b7";
const SERVICE_ID = "ad4e3664-6609-556e-ae9e-53c5ba50ef9a";
const LOCATION_ID = "67ad0d9b-4f60-44e6-a213-86f665324574";
const PAYMENT_METHOD_ID = "1cfaff6a-9b94-4d68-8b8e-2f0f875f8482";
const SERVICE_REFERENCE = "srv-test-cut-1777841145997";

function createTables(): Record<string, Row[]> {
  return {
    shops: [],
    profiles: [{
      id: CLIENT_PROFILE_ID,
      role: "client_user",
      full_name: "Phillip mcgee",
      email: "phillipmcgeeclient@outlook.com",
      phone: "+18136250040",
      onboarding_state: "active",
      primary_onboarding_role: "client"
    }, {
      id: BARBER_PROFILE_ID,
      role: "barber_user",
      full_name: "Phillip mcgee",
      email: "phillipmcgee813@gmail.com",
      phone: "8135550101",
      onboarding_state: "active",
      primary_onboarding_role: "barber"
    }],
    clients: [{
      id: CLIENT_ID,
      reference_code: "client-1fd26b88",
      profile_id: CLIENT_PROFILE_ID,
      favorite_barber_id: null,
      loyalty_points: 0,
      retention_tag: "new"
    }],
    client_preferences: [{
      client_id: CLIENT_ID,
      client_reference: "client-1fd26b88",
      client_email: "phillipmcgeeclient@outlook.com",
      provider_customer_ref: "cus_test_123",
      default_payment_method_ref: "pm_test_4242",
      default_payment_method_id: PAYMENT_METHOD_ID
    }],
    barbers: [{
      id: BARBER_ID,
      profile_id: BARBER_PROFILE_ID,
      reference_code: "barber-43b3cda2",
      booking_slug: "barber-43b3cda2",
      barber_subtype: "freelance",
      compensation_model: "freelance",
      app_approval_status: "approved",
      shop_approval_status: "not_required",
      is_bookable: true,
      is_discoverable: true,
      status: "active",
      autobooth_percent: null,
      booth_rent_amount: null,
      booth_rent_frequency: null
    }],
    barber_profiles: [{
      barber_reference: "barber-43b3cda2",
      username: "philforsure",
      display_name: "Phillip mcgee",
      shop_reference: "independent-barber-43b3cda2",
      service_area_label: "Phils chair / 2172 University Square More / Tampa, FL",
      visibility_state: "public"
    }],
    services: [{
      id: SERVICE_ID,
      reference_code: SERVICE_REFERENCE,
      service_owner: "barber",
      barber_reference: "barber-43b3cda2",
      shop_reference: "independent-barber-43b3cda2",
      name: "test cut",
      price: 5,
      duration_min: 15,
      buffer_min: 0,
      active: true,
      is_bookable: true,
      location_id: LOCATION_ID,
      currency: "usd",
      deposit_amount: 0,
      full_prepay_required: true
    }],
    marketplace_services: [],
    locations: [{
      id: LOCATION_ID,
      reference_code: "independent-barber-43b3cda2",
      name: "Phils chair",
      neighborhood: "2172 University Square More",
      city: "Tampa",
      state: "FL",
      tax_rate: 0
    }],
    staff_locations: [],
    availability_rules: Array.from({ length: 7 }, (_, weekday) => ({
      barber_id: BARBER_ID,
      location_id: LOCATION_ID,
      weekday,
      start_time: "12:00:00",
      end_time: "19:00:00"
    })),
    barber_working_hours: [],
    blocked_times: [],
    payment_methods: [{
      id: PAYMENT_METHOD_ID,
      client_id: CLIENT_ID,
      provider: "stripe",
      provider_customer_id: "cus_test_123",
      provider_payment_method_id: "pm_test_4242",
      brand: "visa",
      last4: "4242",
      exp_month: 12,
      exp_year: 2034,
      is_default: true
    }],
    appointments: [],
    appointment_status_history: [],
    appointment_services: [],
    appointment_add_ons: [],
    payments: [],
    payment_routing_records: [],
    tips: [],
    notifications: [],
    platform_events: [],
    workflow_events: [],
    compensation_snapshots: [],
    owner_daily_analytics: [],
    waitlist_entries: [],
    walk_in_queue: [],
    reviews: [],
    marketplace_visibility: [{
      barber_reference: "barber-43b3cda2",
      visibility_state: "public",
      accepts_instant_bookings: true
    }],
    barber_portfolios: [],
    barber_status: [{
      barber_reference: BARBER_PROFILE_ID,
      status: "active",
      live_status: "available",
      accepting_bookings: true
    }],
    memberships: [],
    client_memberships: [],
    membership_subscriptions: [],
    promotion_redemptions: []
  };
}

function createSupabaseMock(tables: Record<string, Row[]>) {
  class QueryBuilder {
    private filters: Array<(row: Row) => boolean> = [];
    private operation: "insert" | "update" | "delete" | "upsert" | null = null;
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

    or(expression: string) {
      const clauses = expression.split(",").map((clause) => {
        const [column, operator, ...rest] = clause.split(".");
        return { column, operator, value: rest.join(".") };
      });
      this.filters.push((row) =>
        clauses.some((clause) => clause.operator === "eq" && row[clause.column] === clause.value)
      );
      return this;
    }

    lt(column: string, value: unknown) {
      this.filters.push((row) => String(row[column] ?? "") < String(value));
      return this;
    }

    gt(column: string, value: unknown) {
      this.filters.push((row) => String(row[column] ?? "") > String(value));
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

    delete() {
      this.operation = "delete";
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
        const shouldAddCreatedAt = this.table !== "appointment_status_history";
        const inserted = entries.map((entry) => ({
          id: entry.id ?? `${this.table}-${tables[this.table].length + 1}`,
          ...(shouldAddCreatedAt ? { created_at: entry.created_at ?? "2026-05-16T14:30:00.000Z" } : {}),
          ...entry
        }));
        tables[this.table].push(...inserted);
        return Promise.resolve({ data: inserted, error: null });
      }
      if (this.operation === "update" && this.payload && !Array.isArray(this.payload)) {
        const updatePayload = this.payload as Row;
        tables.__updates ??= [];
        tables.__updates.push({
          table: this.table,
          payload: { ...updatePayload }
        });
        if (this.table === "appointments" && updatePayload.location_id && !tables.locations.some((row) => row.id === updatePayload.location_id)) {
          return Promise.resolve({
            data: null,
            error: {
              code: "23503",
              details: `Key (location_id)=(${String(updatePayload.location_id)}) is not present in table "locations".`
            }
          });
        }
        const rows = this.filteredRows();
        rows.forEach((row) => Object.assign(row, updatePayload));
        return Promise.resolve({ data: rows, error: null });
      }
      if (this.operation === "delete") {
        const rows = this.filteredRows();
        tables[this.table] = tables[this.table].filter((row) => !rows.includes(row));
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

function buildConfirmedAppointmentRow(referenceCode: string, startsAt = "2026-05-16T15:00:00.000Z"): Row {
  return {
    id: canonicalAppointmentUuid(referenceCode),
    reference_code: referenceCode,
    location_id: LOCATION_ID,
    shop_id: null,
    barber_id: BARBER_ID,
    client_id: CLIENT_ID,
    service_id: SERVICE_ID,
    confirmation_code: "CONFIRM1",
    membership_id: null,
    status: "confirmed",
    source: "booking",
    booking_source: "public_profile",
    starts_at: startsAt,
    ends_at: new Date(new Date(startsAt).getTime() + 15 * 60_000).toISOString(),
    checked_in_at: null,
    service_started_at: null,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    chair_label: "Phils chair",
    add_on_references: [],
    deposit_amount: 0,
    service_total: 5,
    add_on_total: 0,
    subtotal: 5,
    discount_total: 0,
    tax_total: 0,
    total_amount: 5,
    grand_total: 5,
    balance_due: 0,
    tip_amount: 0,
    client_note: null,
    notes: null,
    internal_notes: null,
    created_by: CLIENT_PROFILE_ID,
    lifecycle_revision: 1,
    last_actor_role: "client",
    last_event_type: "booking_created",
    checkout_reference: null,
    updated_at: startsAt
  };
}

function buildCapturedPaymentRow(appointmentId: string): Row {
  return {
    id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
    appointment_id: appointmentId,
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
    payment_method_id: PAYMENT_METHOD_ID,
    paid_at: "2026-05-16T14:30:00.000Z",
    created_at: "2026-05-16T14:30:00.000Z",
    updated_at: "2026-05-16T14:30:00.000Z"
  };
}

function findAppointmentUpdatePayload(tables: Record<string, Row[]>, status: string) {
  return tables.__updates?.find((row) => row.table === "appointments" && (row.payload as Row).status === status)?.payload as Row | undefined;
}

function expectNoImmutableAppointmentFields(payload: Row | undefined) {
  expect(payload).toBeDefined();
  expect(Object.keys(payload ?? {})).not.toEqual(expect.arrayContaining([
    "location_id",
    "client_id",
    "barber_id",
    "service_id",
    "shop_id",
    "starts_at",
    "ends_at",
    "chair_label",
    "total_amount",
    "grand_total",
    "balance_due",
    "source",
    "booking_source",
    "created_at"
  ]));
}

describe("core booking loop regression", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    evaluatePayoutEligibilityForAppointmentMock.mockReset();
    evaluatePayoutEligibilityForAppointmentMock.mockResolvedValue({
      status: "eligible",
      routingRecordId: "routing-freelance-1"
    });
    getStripeConnectClientMock.mockReset();
    syncPaymentRoutingRecordMock.mockReset();
    syncStripeSettlementForPaymentMock.mockReset();
    reconcilePaymentPayoutExecutionsMock.mockReset();
  });

  it("protects the paid freelance booking loop from public refs through calendar visibility", async () => {
    const tables = createTables();
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);
    syncPaymentRoutingRecordMock.mockImplementation(async (_supabase: unknown, paymentId: string) => {
      const payment = tables.payments.find((row) => row.id === paymentId)!;
      const existing = tables.payment_routing_records.find((row) => row.payment_id === paymentId);
      const routing = existing ?? {
        id: "routing-freelance-1",
        payment_id: paymentId,
        appointment_id: payment.appointment_id,
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
        payout_readiness_status: "needs_attention",
        money_routing_status: "pending",
        blocked_reason: null,
        eligible_at: null
      };
      if (!existing) {
        tables.payment_routing_records.push(routing);
      }
      return routing;
    });
    const stripeCreateMock = vi.fn().mockResolvedValue({ id: "pi_core_loop", status: "succeeded" });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: { create: stripeCreateMock },
      refunds: { create: vi.fn() }
    });

    const provider = await getLiveOperationsProvider();
    const booking = await provider.createBooking({
      barberId: "barber-43b3cda2",
      locationId: "independent-barber-43b3cda2",
      serviceId: SERVICE_REFERENCE,
      addOnIds: [],
      appointmentTime: "2026-05-16T14:30:00.000Z",
      clientName: "Phillip mcgee",
      clientPhone: "+18136250040",
      clientId: "client-1fd26b88",
      actorRole: "client",
      actorEmail: "phillipmcgeeclient@outlook.com",
      actorProfileId: CLIENT_PROFILE_ID,
      paymentMethodId: PAYMENT_METHOD_ID
    });

    expect(booking.appointment).toMatchObject({
      status: "confirmed",
      clientId: CLIENT_ID,
      barberId: BARBER_ID,
      serviceId: SERVICE_ID,
      locationId: LOCATION_ID,
      chair: "Phils chair"
    });
    expect(booking.appointment.shopId).toBeUndefined();

    const appointment = tables.appointments[0];
    expect(appointment).toMatchObject({
      client_id: CLIENT_ID,
      barber_id: BARBER_ID,
      service_id: SERVICE_ID,
      location_id: LOCATION_ID,
      shop_id: null,
      chair_label: "Phils chair",
      status: "confirmed"
    });
    expect(JSON.stringify(tables.appointments)).not.toContain("barber-43b3cda2");
    expect(JSON.stringify(tables.appointments)).not.toContain("independent-barber-43b3cda2");
    expect(JSON.stringify(tables.appointments)).not.toContain(SERVICE_REFERENCE);

    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500,
        currency: "usd",
        customer: "cus_test_123",
        payment_method: "pm_test_4242",
        confirm: true,
        off_session: true,
        payment_method_types: ["card"],
        metadata: expect.objectContaining({
          appointmentId: appointment.id,
          clientId: CLIENT_ID,
          barberId: BARBER_ID,
          serviceId: SERVICE_ID,
          payoutRoute: "freelance",
          platformHold: "true"
        })
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("booking:")
      })
    );
    const stripePayload = stripeCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(stripePayload).not.toHaveProperty("error_on_requires_action");
    expect(stripePayload).not.toHaveProperty("automatic_payment_methods");
    expect(stripePayload).not.toHaveProperty("transfer_data");
    expect(stripePayload).not.toHaveProperty("application_fee_amount");

    expect(tables.payments[0]).toMatchObject({
      appointment_id: appointment.id,
      client_id: CLIENT_ID,
      barber_id: BARBER_ID,
      shop_id: null,
      payment_method_id: PAYMENT_METHOD_ID,
      provider_payment_intent_id: "pi_core_loop",
      payment_status: "captured"
    });
    expect(tables.payment_routing_records[0]).toMatchObject({
      payment_id: tables.payments[0].id,
      appointment_id: appointment.id,
      routing_model: "freelance",
      money_routing_status: "pending",
      platform_fee_amount: 0.25,
      barber_payout_amount: 4.75,
      shop_split_amount: 0
    });

    const clientSnapshot = await provider.readSnapshot({ role: "client", clientId: "client-1fd26b88" });
    const barberSnapshot = await provider.readSnapshot({ role: "barber", barberId: "barber-43b3cda2", email: "phillipmcgee813@gmail.com" });
    expect(clientSnapshot.appointments).toHaveLength(1);
    expect(barberSnapshot.appointments).toHaveLength(1);
    expect(clientSnapshot.appointments[0]).toMatchObject({
      barberId: "barber-43b3cda2",
      serviceId: SERVICE_REFERENCE,
      chair: "Phils chair",
      status: "confirmed"
    });
    expect(barberSnapshot.appointments[0]).toMatchObject({
      clientId: "client-1fd26b88",
      serviceId: SERVICE_REFERENCE,
      chair: "Phils chair",
      status: "confirmed"
    });

    await provider.transitionAppointment({
      appointmentId: appointment.id as string,
      expectedRevision: Number(appointment.lifecycle_revision),
      action: "service_complete",
      actorRole: "barber",
      actorEmail: "phillipmcgee813@gmail.com"
    });
    const completePatch = findAppointmentUpdatePayload(tables, "completed");
    expect(completePatch).toEqual({
      status: "completed",
      completed_at: expect.any(String),
      updated_at: expect.any(String)
    });
    expectNoImmutableAppointmentFields(completePatch);
    expect(tables.appointments[0]).toMatchObject({
      status: "completed",
      completed_at: expect.any(String)
    });
    expect(tables.appointment_status_history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        appointment_id: appointment.id,
        status: "completed",
        old_status: "confirmed",
        new_status: "completed",
        change_reason: "barber_completed_service",
        changed_by: BARBER_PROFILE_ID,
        changed_at: expect.any(String)
      })
    ]));
    const completedHistory = tables.appointment_status_history.find((row) => row.new_status === "completed")!;
    expect(Object.keys(completedHistory)).not.toContain("changed_by_profile_id");
    expect(Object.keys(completedHistory)).not.toContain("created_at");
    expect(Object.keys(completedHistory)).not.toContain("reason");
  });

  it("confirms a guest appointment with its balance due and no payment capture", async () => {
    const tables = createTables();
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);
    const stripeCreateMock = vi.fn();
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: { create: stripeCreateMock },
      refunds: { create: vi.fn() }
    });

    const provider = await getLiveOperationsProvider();
    const booking = await provider.createBooking({
      barberId: "barber-43b3cda2",
      locationId: "independent-barber-43b3cda2",
      serviceId: SERVICE_REFERENCE,
      addOnIds: [],
      appointmentTime: "2026-05-16T16:30:00.000Z",
      clientName: "Guest Booker",
      clientPhone: "+18135550199",
      actorRole: "client",
      actorEmail: "guest@example.com",
      deferPaymentCollection: true
    });

    expect(booking.appointment).toMatchObject({
      status: "confirmed",
      depositAmount: 0,
      balanceDue: 5
    });
    expect(tables.appointments[0]).toMatchObject({
      status: "confirmed",
      deposit_amount: 0,
      balance_due: 5
    });
    expect(tables.payments).toEqual([]);
    expect(tables.payment_routing_records).toEqual([]);
    expect(stripeCreateMock).not.toHaveBeenCalled();
  });

  it("repairs missing routing for an already completed appointment without rewriting lifecycle history", async () => {
    const tables = createTables();
    const appointmentReference = "appt-already-completed";
    const appointment = {
      ...buildConfirmedAppointmentRow(appointmentReference),
      status: "completed",
      completed_at: "2026-05-16T15:20:00.000Z",
      lifecycle_revision: 2
    } as Row;
    const appointmentId = appointment.id as string;
    tables.appointments.push(appointment);
    tables.payments.push(buildCapturedPaymentRow(appointmentId));
    tables.appointment_status_history.push(
      {
        appointment_id: appointmentId,
        status: "confirmed",
        old_status: null,
        new_status: "confirmed",
        change_reason: "appointment_booked",
        changed_by: CLIENT_PROFILE_ID,
        changed_at: "2026-05-16T14:30:00.000Z"
      },
      {
        appointment_id: appointmentId,
        status: "completed",
        old_status: "confirmed",
        new_status: "completed",
        change_reason: "barber_completed_service",
        changed_by: BARBER_PROFILE_ID,
        changed_at: "2026-05-16T15:20:00.000Z"
      }
    );
    evaluatePayoutEligibilityForAppointmentMock.mockImplementation(async (_supabase: unknown, appointmentId: string) => {
      const payment = tables.payments.find((row) => row.appointment_id === appointmentId)!;
      if (!tables.payment_routing_records.some((row) => row.appointment_id === appointmentId)) {
        tables.payment_routing_records.push({
          id: "routing-repaired-1",
          payment_id: payment.id,
          appointment_id: appointmentId,
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
          eligible_at: "2026-05-16T15:21:00.000Z",
          released_at: null,
          held_at: null,
          reversed_at: null,
          processor_charge_id: null,
          processor_balance_transaction_id: null,
          reconciliation_status: "open",
          metadata: {
            repairReason: "missing_routing_record_on_completion",
            source: "barber_complete_service",
            relationshipType: "freelance",
            appointmentId,
            paymentId: payment.id,
            barberId: BARBER_ID,
            clientId: CLIENT_ID
          },
          created_at: "2026-05-16T15:21:00.000Z",
          updated_at: "2026-05-16T15:21:00.000Z"
        });
      }
      return {
        appointmentId,
        paymentId: payment.id,
        routingRecordId: "routing-repaired-1",
        relationshipType: "freelance",
        status: "eligible",
        payoutReadinessStatus: "eligible",
        moneyRoutingStatus: "pending",
        eligibleAt: "2026-05-16T15:21:00.000Z",
        releasedAt: null,
        barberAmountCents: 475,
        shopAmountCents: 0,
        platformAmountCents: 25
      };
    });
    const historyCount = tables.appointment_status_history.length;
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const provider = await getLiveOperationsProvider();
    const result = await provider.transitionAppointment({
      appointmentId: appointmentReference,
      expectedRevision: 1,
      action: "service_complete",
      actorRole: "barber",
      actorEmail: "phillipmcgee813@gmail.com"
    });

    expect(result.appointment.status).toBe("completed");
    expect(result.routing).toMatchObject({
      status: "eligible",
      payoutReadinessStatus: "eligible",
      barberAmountCents: 475,
      platformAmountCents: 25,
      shopAmountCents: 0
    });
    expect(tables.appointment_status_history).toHaveLength(historyCount);
    expect(findAppointmentUpdatePayload(tables, "completed")).toBeUndefined();
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      payment_id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
      appointment_id: appointmentId,
      routing_model: "freelance",
      payout_readiness_status: "eligible",
      eligible_at: expect.any(String),
      released_at: null,
      barber_payout_amount: 4.75,
      platform_fee_amount: 0.25,
      shop_split_amount: 0
    });
  });

  it("writes production status history when a barber cancels a confirmed appointment", async () => {
    const tables = createTables();
    const appointmentReference = "appt-cancel-tier1";
    tables.appointments.push(buildConfirmedAppointmentRow(appointmentReference));
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const provider = await getLiveOperationsProvider();
    await provider.cancelAppointment({
      appointmentId: appointmentReference,
      expectedRevision: 1,
      actorRole: "barber",
      actorEmail: "phillipmcgee813@gmail.com",
      reason: "Canceled by barber",
      statusHistoryReason: "barber_canceled_appointment"
    });

    expect(tables.appointments[0]).toMatchObject({
      reference_code: appointmentReference,
      status: "cancelled"
    });
    const cancelPatch = findAppointmentUpdatePayload(tables, "cancelled");
    expect(cancelPatch).toEqual({
      status: "cancelled",
      cancelled_at: expect.any(String),
      updated_at: expect.any(String)
    });
    expectNoImmutableAppointmentFields(cancelPatch);
    expect(tables.appointment_status_history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        appointment_id: canonicalAppointmentUuid(appointmentReference),
        status: "cancelled",
        old_status: "confirmed",
        new_status: "cancelled",
        change_reason: "barber_canceled_appointment",
        changed_by: BARBER_PROFILE_ID,
        changed_at: expect.any(String)
      })
    ]));
    const canceledHistory = tables.appointment_status_history.find((row) => row.new_status === "cancelled")!;
    expect(Object.keys(canceledHistory)).not.toContain("changed_by_profile_id");
    expect(Object.keys(canceledHistory)).not.toContain("created_at");
    expect(Object.keys(canceledHistory)).not.toContain("reason");
  });

  it("lets a client cancel their own confirmed appointment without deleting payment or releasing payout", async () => {
    const tables = createTables();
    const appointmentReference = "appt-client-cancel-tier1";
    const appointmentId = canonicalAppointmentUuid(appointmentReference);
    tables.appointments.push(buildConfirmedAppointmentRow(appointmentReference));
    tables.payments.push(buildCapturedPaymentRow(appointmentId));
    tables.payment_routing_records.push({
      id: "routing-client-cancel",
      payment_id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
      appointment_id: appointmentId,
      routing_model: "freelance",
      payout_recipient_type: "barber",
      provider_gross_amount: 5,
      platform_fee_amount: 0.25,
      barber_payout_amount: 4.75,
      shop_split_amount: 0,
      payout_readiness_status: "pending",
      money_routing_status: "pending",
      eligible_at: null,
      released_at: null
    });
    const paymentCount = tables.payments.length;
    const routingCount = tables.payment_routing_records.length;
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const provider = await getLiveOperationsProvider();
    const result = await provider.cancelAppointment({
      appointmentId: appointmentReference,
      expectedRevision: 1,
      actorRole: "client",
      actorEmail: "phillipmcgeeclient@outlook.com",
      reason: "Client cancelled from Activity",
      statusHistoryReason: "client_cancelled_appointment"
    });

    expect(result.appointment.status).toBe("cancelled");
    const cancelPatch = findAppointmentUpdatePayload(tables, "cancelled");
    expect(cancelPatch).toEqual({
      status: "cancelled",
      cancelled_at: expect.any(String),
      updated_at: expect.any(String)
    });
    expectNoImmutableAppointmentFields(cancelPatch);
    expect(tables.appointment_status_history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        appointment_id: appointmentId,
        status: "cancelled",
        old_status: "confirmed",
        new_status: "cancelled",
        change_reason: "client_cancelled_appointment",
        changed_by: CLIENT_PROFILE_ID,
        changed_at: expect.any(String)
      })
    ]));
    expect(tables.payments).toHaveLength(paymentCount);
    expect(tables.payments[0]).toMatchObject({
      appointment_id: appointmentId,
      status: "captured",
      payment_status: "captured"
    });
    expect(tables.payment_routing_records).toHaveLength(routingCount);
    expect(tables.payment_routing_records[0]).toMatchObject({
      appointment_id: appointmentId,
      payout_readiness_status: "pending",
      released_at: null
    });
    const clientSnapshot = await provider.readSnapshot({ role: "client", clientId: "client-1fd26b88" });
    expect(clientSnapshot.appointments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: appointmentReference,
        status: "cancelled"
      })
    ]));
  });

  it("releases a cancelled appointment slot for a new booking at the same time", async () => {
    const tables = createTables();
    tables.availability_rules = Array.from({ length: 7 }, (_, weekday) => ({
      barber_id: BARBER_ID,
      location_id: LOCATION_ID,
      weekday,
      start_time: "08:00:00",
      end_time: "09:00:00"
    }));
    const appointmentReference = "appt-cancelled-eight";
    const appointmentTime = "2026-05-16T08:00:00.000Z";
    tables.appointments.push(buildConfirmedAppointmentRow(appointmentReference, appointmentTime));
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: { create: vi.fn().mockResolvedValue({ id: "pi_rebook_same_slot", status: "succeeded" }) },
      refunds: { create: vi.fn() }
    });
    syncPaymentRoutingRecordMock.mockResolvedValue({
      id: "routing-same-slot",
      appointment_id: "unused",
      payout_readiness_status: "pending"
    });

    const provider = await getLiveOperationsProvider();
    await provider.cancelAppointment({
      appointmentId: appointmentReference,
      expectedRevision: 1,
      actorRole: "client",
      actorEmail: "phillipmcgeeclient@outlook.com",
      reason: "Client cancelled from Activity",
      statusHistoryReason: "client_cancelled_appointment"
    });

    expect(tables.appointments[0]).toMatchObject({
      reference_code: appointmentReference,
      status: "cancelled"
    });

    const booking = await provider.createBooking({
      barberId: "barber-43b3cda2",
      locationId: "independent-barber-43b3cda2",
      serviceId: SERVICE_REFERENCE,
      addOnIds: [],
      appointmentTime,
      clientName: "Phillip mcgee",
      clientPhone: "+18136250040",
      clientId: "client-1fd26b88",
      actorRole: "client",
      actorEmail: "phillipmcgeeclient@outlook.com",
      actorProfileId: CLIENT_PROFILE_ID,
      paymentMethodId: PAYMENT_METHOD_ID
    });

    expect(booking.appointment).toMatchObject({
      status: "confirmed",
      start: appointmentTime,
      barberId: BARBER_ID
    });
    expect(tables.appointments.filter((appointment) => appointment.starts_at === appointmentTime)).toEqual([
      expect.objectContaining({ reference_code: appointmentReference, status: "cancelled" }),
      expect.objectContaining({ status: "confirmed", barber_id: BARBER_ID })
    ]);
  });

  it("writes production status history when a barber marks a confirmed appointment no-show", async () => {
    const tables = createTables();
    const appointmentReference = "appt-noshow-tier1";
    tables.appointments.push(buildConfirmedAppointmentRow(appointmentReference, "2026-05-16T15:30:00.000Z"));
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const provider = await getLiveOperationsProvider();
    await provider.noShowAppointment({
      appointmentId: appointmentReference,
      expectedRevision: 1,
      actorRole: "barber",
      actorEmail: "phillipmcgee813@gmail.com",
      reason: "Marked no-show by barber"
    });

    expect(tables.appointments[0]).toMatchObject({
      reference_code: appointmentReference,
      status: "no_show"
    });
    const noShowPatch = findAppointmentUpdatePayload(tables, "no_show");
    expect(noShowPatch).toEqual({
      status: "no_show",
      updated_at: expect.any(String)
    });
    expectNoImmutableAppointmentFields(noShowPatch);
    expect(tables.appointment_status_history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        appointment_id: canonicalAppointmentUuid(appointmentReference),
        status: "no_show",
        old_status: "confirmed",
        new_status: "no_show",
        change_reason: "barber_marked_no_show",
        changed_by: BARBER_PROFILE_ID,
        changed_at: expect.any(String)
      })
    ]));
    const noShowHistory = tables.appointment_status_history.find((row) => row.new_status === "no_show")!;
    expect(Object.keys(noShowHistory)).not.toContain("changed_by_profile_id");
    expect(Object.keys(noShowHistory)).not.toContain("created_at");
    expect(Object.keys(noShowHistory)).not.toContain("reason");
  });

  it("refuses completion when no captured booking payment exists", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables = createTables();
    const appointmentReference = "appt-unpaid-tier1";
    tables.appointments.push(buildConfirmedAppointmentRow(appointmentReference));
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const provider = await getLiveOperationsProvider();

    await expect(provider.transitionAppointment({
      appointmentId: appointmentReference,
      expectedRevision: 1,
      action: "service_complete",
      actorRole: "barber",
      actorEmail: "phillipmcgee813@gmail.com"
    })).rejects.toMatchObject({
      status: 409,
      message: "Appointment cannot be completed for payout until payment is confirmed."
    });
    expect(tables.appointments[0]).toMatchObject({
      status: "confirmed",
      completed_at: null
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[barber-appointment] complete_failed",
      expect.objectContaining({
        appointmentId: canonicalAppointmentUuid(appointmentReference),
        errorName: "PaymentNotCaptured"
      })
    );
    warnSpy.mockRestore();
  });
});
