import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  getBarberDashboardPayloadMock,
  getStripeConnectClientMock,
  syncPaymentRoutingRecordMock,
  syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutionsMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  getBarberDashboardPayloadMock: vi.fn(),
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

vi.mock("@/lib/booking/platform-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/booking/platform-service")>("@/lib/booking/platform-service");
  return {
    ...actual,
    getBarberDashboardPayload: getBarberDashboardPayloadMock
  };
});

import { buildCanonicalBarberProfile } from "@/lib/booking/intelligence";
import { getBarberAvailabilityPayload, getClientHomePayload, searchBarbersAndShopsPayload } from "@/lib/booking/platform-service";
import { getBarberOverviewPayload, getBarberSchedulePayload } from "@/lib/barber/service";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { getCanonicalAccountRole, normalizeBarberSubtype } from "@/lib/auth/roles";
import type { UserAccount } from "@/types/domain";

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | null; error: Row | null };

const CLIENT_PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const BARBER_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const BARBER_ID = "44444444-4444-5444-8444-444444444444";
const LOCATION_ID = "55555555-5555-5555-8555-555555555555";
const SERVICE_ID = "66666666-6666-5666-8666-666666666666";
const SERVICE_REFERENCE = "srv-test-cut-1777841145997";
const PAYMENT_METHOD_ID = "77777777-7777-5777-8777-777777777777";

function createTables() {
  return {
    shops: [],
    barbers: [{
      id: BARBER_ID,
      reference_code: "barber-43b3cda2",
      profile_id: BARBER_PROFILE_ID,
      compensation_model: "freelance",
      barber_subtype: "freelance",
      app_approval_status: "approved",
      shop_approval_status: "not_required",
      status: "active",
      is_bookable: true,
      is_discoverable: true,
      commission_rate: null,
      booth_rent_amount: null,
      booth_rent_frequency: null,
      bio: "Freelance Tampa barber.",
      booking_slug: "barber-43b3cda2"
    }],
    barber_profiles: [{
      barber_reference: "barber-43b3cda2",
      username: "philforsure",
      display_name: "Phillip mcgee",
      bio: "Freelance Tampa barber.",
      years_experience: 7,
      shop_reference: "independent-barber-43b3cda2",
      profile_photo_path: null,
      profile_photo_url: null,
      specialties: ["Haircut"],
      badges: [],
      service_area_label: "Phils chair / 2172 University Square More / Tampa, FL",
      next_available_at: null,
      visibility_state: "public"
    }],
    profiles: [{
      id: CLIENT_PROFILE_ID,
      full_name: "Phillip mcgee",
      email: "phillipmcgeeclient@outlook.com",
      phone: "+18136250040",
      role: "client_user",
      primary_onboarding_role: "client"
    }, {
      id: BARBER_PROFILE_ID,
      full_name: "Phillip mcgee",
      email: "phillipmcgee813@gmail.com",
      phone: "8135550101",
      role: "barber_user",
      primary_onboarding_role: "barber",
      onboarding_state: "active"
    }],
    clients: [{
      id: CLIENT_ID,
      reference_code: "client-1fd26b88",
      profile_id: CLIENT_PROFILE_ID,
      favorite_barber_id: null,
      loyalty_points: 0,
      retention_tag: "new",
      created_at: "2026-05-01T12:00:00.000Z"
    }],
    client_preferences: [{
      client_reference: "client-1fd26b88",
      client_email: "phillipmcgeeclient@outlook.com",
      client_id: CLIENT_ID,
      provider_customer_ref: "cus_phil_4242",
      default_payment_method_ref: "pm_phil_4242",
      default_payment_method_id: PAYMENT_METHOD_ID
    }],
    payment_methods: [{
      id: PAYMENT_METHOD_ID,
      client_id: CLIENT_ID,
      provider: "stripe",
      provider_customer_id: "cus_phil_4242",
      provider_payment_method_id: "pm_phil_4242",
      brand: "Visa",
      last4: "4242",
      exp_month: 12,
      exp_year: 2034,
      nickname: "phil stripe card",
      is_default: true,
      created_at: "2026-05-14T12:00:00.000Z"
    }],
    services: [{
      id: SERVICE_ID,
      reference_code: SERVICE_REFERENCE,
      location_id: LOCATION_ID,
      category: "Haircut",
      name: "test cut",
      description: "Cut",
      duration_min: 15,
      buffer_min: 0,
      price: 5,
      currency: "usd",
      deposit_amount: 0,
      full_prepay_required: true,
      active: true,
      is_bookable: true,
      display_order: 1,
      created_at: "2026-05-14T12:00:00.000Z",
      updated_at: "2026-05-14T12:00:00.000Z",
      service_owner: "barber",
      barber_reference: "barber-43b3cda2",
      shop_reference: "independent-barber-43b3cda2",
      booking_count: 0,
      popularity_rank: 1
    }],
    marketplace_services: [],
    locations: [{
      id: LOCATION_ID,
      reference_code: "independent-barber-43b3cda2",
      name: "Phils chair",
      neighborhood: "2172 University Square More",
      city: "Tampa",
      state: "FL",
      phone: "8135550101",
      address: "2172 University Square More",
      address_line_2: null,
      postal_code: "33612",
      latitude: null,
      longitude: null,
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
    appointments: [],
    appointment_services: [],
    appointment_add_ons: [],
    appointment_status_history: [],
    payments: [],
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
      accepts_instant_bookings: true,
      featured_rank: null
    }],
    barber_portfolios: [],
    barber_status: [{
      barber_reference: "barber-43b3cda2",
      status: "offline",
      live_status: "offline",
      accepting_bookings: false
    }, {
      barber_reference: BARBER_PROFILE_ID,
      status: "active",
      live_status: "available",
      accepting_bookings: true
    }],
    connected_accounts: [],
    memberships: [],
    client_memberships: [],
    membership_subscriptions: [],
    promotion_redemptions: []
  } satisfies Record<string, Row[]>;
}

function createSupabaseMock(
  tables: Record<string, Row[]>,
  options: { insertErrors?: Partial<Record<string, Row>> } = {}
) {
  class QueryBuilder {
    private filters: Array<(row: Row) => boolean> = [];
    private operation: "insert" | "update" | "delete" | null = null;
    private payload: Row | Row[] | null = null;
    private rowLimit: number | null = null;
    private orderBy: { column: string; ascending: boolean } | null = null;

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

    gte(column: string, value: unknown) {
      this.filters.push((row) => String(row[column] ?? "") >= String(value));
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
      const entries = Array.isArray(payload) ? payload : [payload];
      const conflict = options?.onConflict ?? "id";
      tables[this.table] ??= [];
      for (const entry of entries) {
        const existing = tables[this.table].find((row) => entry[conflict] && row[conflict] === entry[conflict]);
        if (existing) {
          Object.assign(existing, entry);
        } else {
          tables[this.table].push({ ...entry });
        }
      }
      return Promise.resolve({ data: entries, error: null });
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
        const insertError = options.insertErrors?.[this.table];
        if (insertError) {
          return Promise.resolve({ data: null, error: insertError });
        }
        const entries = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = entries.map((entry) => ({
          id: entry.id ?? `${this.table}-${tables[this.table].length + 1}`,
          created_at: entry.created_at ?? "2026-05-14T12:00:00.000Z",
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

      if (this.operation === "delete") {
        const rows = this.filteredRows();
        tables[this.table] = tables[this.table].filter((row) => !rows.includes(row));
        return Promise.resolve({ data: rows, error: null });
      }

      return Promise.resolve({ data: this.filteredRows(), error: null });
    }

    private filteredRows() {
      let rows = tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows = [...rows].sort((left, right) => {
          const comparison = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
          return ascending ? comparison : -comparison;
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

function appointmentRowsToDashboard(tables: Record<string, Row[]>) {
  const appointments = tables.appointments.map((row) => ({
    id: row.reference_code ?? row.id,
    locationId: "independent-barber-43b3cda2",
    shopId: undefined,
    barberId: "barber-43b3cda2",
    clientId: "client-1fd26b88",
    serviceId: SERVICE_REFERENCE,
    status: row.status,
    start: row.starts_at,
    end: row.ends_at,
    chair: row.chair_label ?? "Phils chair",
    addOnIds: [],
    depositAmount: Number(row.deposit_amount ?? 5),
    totalAmount: Number(row.total_amount ?? 5),
    balanceDue: Number(row.balance_due ?? 0),
    tipAmount: Number(row.tip_amount ?? 0),
    note: "",
    source: "booking",
    revision: Number(row.lifecycle_revision ?? 1),
    updatedAt: String(row.updated_at ?? "2026-05-14T12:00:00.000Z"),
    display: { serviceName: "test cut" }
  }));

  return {
    summary: {
      businessDate: "2026-05-15",
      activeCount: 0,
      serviceRevenueToday: 0,
      tipsToday: 0,
      commissionToday: 0,
      projectedPayout: 0,
      completedPaidCount: 0,
      rentCoverageToday: 0,
      bookedCount: appointments.length,
      checkedInCount: 0,
      inServiceCount: 0,
      completedCount: 0,
      cancelledCount: 0
    },
    appointments,
    clients: [{
      id: "client-1fd26b88",
      name: "Phillip mcgee",
      phone: "+18136250040",
      email: "phillipmcgeeclient@outlook.com",
      loyaltyPoints: 0,
      retentionTag: "new",
      notes: []
    }]
  };
}

describe("freelance client booking loop", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    getBarberDashboardPayloadMock.mockReset();
    getStripeConnectClientMock.mockReset();
    syncPaymentRoutingRecordMock.mockReset();
    syncStripeSettlementForPaymentMock.mockReset();
    reconcilePaymentPayoutExecutionsMock.mockReset();
  });

  it("client can discover and book a freelance barber and barber sees appointment", async () => {
    const tables = createTables();
    const supabase = createSupabaseMock(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);
    getBarberDashboardPayloadMock.mockImplementation(async () => appointmentRowsToDashboard(tables));
    const stripeCreateMock = vi.fn().mockResolvedValue({ id: "pi_freelance_loop", status: "succeeded" });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: { create: stripeCreateMock },
      refunds: { create: vi.fn() }
    });
    const barberUser: UserAccount = {
      id: BARBER_PROFILE_ID,
      role: "barber_user",
      email: "phillipmcgee813@gmail.com",
      password: "DevOnly!123",
      name: "philforsure",
      title: "Freelance Barber",
      locationIds: [],
      barberId: "barber-43b3cda2",
      barberSubtype: "freelance"
    };

    expect(getCanonicalAccountRole(tables.profiles[1].role as string)).toBe("barber_user");
    expect(normalizeBarberSubtype(tables.barbers[0].barber_subtype as string)).toBe("freelance");

    const home = await getClientHomePayload("client-1fd26b88");
    const search = await searchBarbersAndShopsPayload({ query: "philforsure", clientId: "client-1fd26b88" });
    const profile = await buildCanonicalBarberProfile(supabase as never, "philforsure");
    const availability = await getBarberAvailabilityPayload("philforsure", {
      serviceId: SERVICE_REFERENCE,
      locationId: "independent-barber-43b3cda2",
      days: 2
    });
    const beforeMore = await getBarberOverviewPayload(barberUser);
    const beforeCalendar = await getBarberSchedulePayload(barberUser, { viewMode: "day", anchorDate: "2026-05-15" });

    expect(home.recommendedBarbers.some((barber) => barber.username === "philforsure")).toBe(true);
    expect(search.barbers.some((barber) => barber.username === "philforsure")).toBe(true);
    expect(profile?.services.some((entry) => entry.service.name === "test cut")).toBe(true);
    expect(availability?.slots.length).toBeGreaterThan(0);
    expect(beforeMore.workingHours.length).toBeGreaterThan(0);
    expect(beforeMore.activationSetup.hasAvailabilityDraft).toBe(true);
    expect(beforeMore.activationSetup.hasServiceLocation).toBe(true);
    expect(beforeMore.status.liveStatus).toBe("available");
    expect(beforeMore.status.isOnline).toBe(true);
    expect(beforeCalendar.shops).toEqual([expect.objectContaining({
      id: "independent-barber-43b3cda2"
    })]);
    expect(beforeCalendar.timeline.appointments).toEqual([]);

    const provider = await getLiveOperationsProvider();
    const booking = await provider.createBooking({
      locationId: "independent-barber-43b3cda2",
      barberId: "barber-43b3cda2",
      serviceId: SERVICE_REFERENCE,
      addOnIds: [],
      appointmentTime: "2026-05-15T14:00:00.000Z",
      clientName: "Phillip mcgee",
      clientPhone: "+18136250040",
      clientId: "client-1fd26b88",
      actorRole: "client",
      actorEmail: "phillipmcgeeclient@outlook.com",
      actorProfileId: CLIENT_PROFILE_ID,
      paymentMethodId: PAYMENT_METHOD_ID
    });

    expect(booking.appointment.status).toBe("confirmed");
    expect(booking.appointment.barberId).toBe(BARBER_ID);
    expect(booking.appointment.clientId).toBe(CLIENT_ID);
    expect(booking.appointment.serviceId).toBe(SERVICE_ID);
    expect(booking.appointment.locationId).toBe(LOCATION_ID);
    expect(booking.appointment.shopId).toBeUndefined();

    const insertedAppointment = tables.appointments[0] as {
      id: string;
      reference_code: string;
    } & Record<string, unknown>;
    const insertedPayment = tables.payments[0] as Record<string, unknown>;
    expect(insertedAppointment).toMatchObject({
      client_id: CLIENT_ID,
      barber_id: BARBER_ID,
      service_id: SERVICE_ID,
      location_id: LOCATION_ID,
      shop_id: null,
      status: "confirmed"
    });
    expect(insertedPayment).toMatchObject({
      appointment_id: insertedAppointment.id,
      client_id: CLIENT_ID,
      barber_id: BARBER_ID,
      shop_id: null,
      payment_method_id: PAYMENT_METHOD_ID,
      provider: "stripe",
      provider_payment_intent_id: "pi_freelance_loop",
      payment_status: "captured",
      payment_type: "booking"
    });
    expect(tables.appointment_status_history[0]).toMatchObject({
      appointment_id: insertedAppointment.id,
      new_status: "confirmed"
    });
    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500,
        currency: "usd",
        customer: "cus_phil_4242",
        payment_method: "pm_phil_4242",
        confirm: true,
        metadata: expect.objectContaining({
          barber_id: BARBER_ID,
          service_id: SERVICE_ID,
          payoutRoute: "freelance",
          platformHold: "true"
        })
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("booking:")
      })
    );

    const clientSnapshot = await provider.readSnapshot({ role: "client", clientId: "client-1fd26b88" });
    expect(clientSnapshot.appointments).toHaveLength(1);
    expect(clientSnapshot.appointments[0]).toMatchObject({
      barberId: "barber-43b3cda2",
      clientId: "client-1fd26b88",
      serviceId: SERVICE_REFERENCE,
      status: "confirmed"
    });

    const afterCalendar = await getBarberSchedulePayload(barberUser, { viewMode: "day", anchorDate: "2026-05-15" });
    expect(afterCalendar.timeline.appointments).toHaveLength(1);
    expect(afterCalendar.timeline.appointments[0]).toMatchObject({
      id: insertedAppointment.reference_code,
      barberId: "barber-43b3cda2",
      clientId: "client-1fd26b88",
      serviceId: SERVICE_REFERENCE,
      status: "confirmed"
    });

    expect(JSON.stringify(tables.appointments)).not.toContain("independent-barber-43b3cda2");
    expect(JSON.stringify(tables.appointments)).not.toContain("client-1fd26b88");
    expect(JSON.stringify(tables.appointments)).not.toContain("barber-43b3cda2");
    expect(JSON.stringify(tables.appointments)).not.toContain(SERVICE_REFERENCE);
  });

  it("returns a safe appointment save failure and skips Stripe when appointment insert fails", async () => {
    const tables = createTables();
    const supabase = createSupabaseMock(tables, {
      insertErrors: {
        appointments: {
          code: "23502",
          message: 'null value in column "shop_id" of relation "appointments" violates not-null constraint',
          details: "Failing row contains a freelance appointment with shop_id null.",
          hint: null
        }
      }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);
    getBarberDashboardPayloadMock.mockImplementation(async () => appointmentRowsToDashboard(tables));
    const stripeCreateMock = vi.fn().mockResolvedValue({ id: "pi_should_not_run", status: "succeeded" });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: { create: stripeCreateMock },
      refunds: { create: vi.fn() }
    });

    const provider = await getLiveOperationsProvider();

    await expect(provider.createBooking({
      locationId: "independent-barber-43b3cda2",
      barberId: "barber-43b3cda2",
      serviceId: SERVICE_REFERENCE,
      addOnIds: [],
      appointmentTime: "2026-05-15T14:00:00.000Z",
      clientName: "Phillip mcgee",
      clientPhone: "+18136250040",
      clientId: "client-1fd26b88",
      actorRole: "client",
      actorEmail: "phillipmcgeeclient@outlook.com",
      actorProfileId: CLIENT_PROFILE_ID,
      paymentMethodId: PAYMENT_METHOD_ID
    })).rejects.toMatchObject({
      bookingTransaction: {
        stage: "appointment_insert_failed",
        safeMessage: "Appointment could not be saved.",
        appointmentInsertStarted: true,
        appointmentInsertSucceeded: false,
        paymentIntentCreateStarted: false,
        paymentRecordInsertStarted: false
      }
    });

    expect(tables.appointments).toHaveLength(0);
    expect(tables.payments).toHaveLength(0);
    expect(stripeCreateMock).not.toHaveBeenCalled();
  });
});
