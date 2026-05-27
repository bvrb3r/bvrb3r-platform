import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  isSupabaseEnabledMock,
  createStripeTransferMock,
  getStripeConnectEnvironmentMock,
  retrieveStripePlatformAccountMock,
  retrieveStripePlatformBalanceMock,
  syncWalletBalancesForPaymentMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn(() => true),
  createStripeTransferMock: vi.fn(),
  getStripeConnectEnvironmentMock: vi.fn(),
  retrieveStripePlatformAccountMock: vi.fn(),
  retrieveStripePlatformBalanceMock: vi.fn(),
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

vi.mock("@/lib/stripe/connect", () => ({
  StripeConnectError: class StripeConnectError extends Error {
    status = 502;
  },
  buildStripeReturnUrl: vi.fn(),
  createStripeConnectedAccount: vi.fn(),
  createStripeDashboardLoginLink: vi.fn(),
  createStripeOnboardingLink: vi.fn(),
  getStripeConnectEnvironment: getStripeConnectEnvironmentMock,
  getStripeConnectOnboardingPath: vi.fn(),
  createStripeTransfer: createStripeTransferMock,
  createStripeTransferReversal: vi.fn(),
  retrieveStripeConnectedAccount: vi.fn(),
  retrieveStripePlatformAccount: retrieveStripePlatformAccountMock,
  retrieveStripePlatformBalance: retrieveStripePlatformBalanceMock,
  retrieveStripePaymentIntentSettlement: vi.fn(),
  verifyStripeWebhookEvent: vi.fn()
}));

import {
  approveFreelancePayoutReadinessForRouting,
  getArchitectStripePlatformDiagnostics,
  getBarberStripePayoutReadiness,
  listArchitectFreelancePayoutQueue,
  releaseFreelanceRoutingPayout,
  validateFreelancePayoutReleaseEligibility
} from "@/lib/fintech/service";

type Row = Record<string, unknown>;

const ROUTING_ID = "routing-freelance";
const PAYMENT_ID = "payment-pos";
const POS_SALE_ID = "pos-sale-paid";
const BARBER_ID = "barber-1";
const BARBER_PROFILE_ID = "profile-barber";
const CONNECTED_ACCOUNT_ID = "connected-account-1";

function createBaseTables(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    payment_routing_records: [{
      id: ROUTING_ID,
      payment_id: PAYMENT_ID,
      appointment_id: null,
      pos_sale_id: POS_SALE_ID,
      membership_id: null,
      routing_model: "freelance",
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
      eligible_at: "2026-05-26T13:00:00.000Z",
      held_at: null,
      released_at: null,
      reversed_at: null,
      processor_charge_id: "ch_test",
      processor_balance_transaction_id: "txn_test",
      reconciliation_status: "open",
      metadata: {},
      created_at: "2026-05-26T13:00:00.000Z",
      updated_at: "2026-05-26T13:00:00.000Z"
    }],
    payments: [{
      id: PAYMENT_ID,
      appointment_id: null,
      pos_sale_id: POS_SALE_ID,
      client_id: "client-1",
      shop_id: null,
      barber_id: BARBER_ID,
      provider: "stripe",
      provider_payment_intent_id: "pi_paid",
      amount: 100,
      currency: "usd",
      status: "captured",
      payment_status: "captured",
      payment_type: "pos_sale",
      paid_at: "2026-05-26T13:00:00.000Z",
      created_at: "2026-05-26T13:00:00.000Z",
      updated_at: "2026-05-26T13:00:00.000Z"
    }],
    pos_sales: [{
      id: POS_SALE_ID,
      barber_id: BARBER_ID,
      shop_id: null,
      client_id: "client-1",
      source: "barber_keypad",
      status: "paid",
      payment_method: "card_on_file",
      payment_status: "paid",
      subtotal_cents: 10000,
      discount_cents: 0,
      tip_cents: 0,
      platform_fee_cents: 500,
      client_fee_cents: 0,
      total_cents: 10000,
      amount_cents: 10000,
      total_amount_cents: 10000,
      payment_id: PAYMENT_ID,
      customer_name: null,
      customer_phone: null,
      customer_email: null,
      note: null,
      cash_recorded_at: null,
      completed_at: "2026-05-26T13:00:00.000Z",
      created_at: "2026-05-26T13:00:00.000Z",
      updated_at: "2026-05-26T13:00:00.000Z"
    }],
    refunds: [],
    disputes: [],
    connected_accounts: [{
      id: CONNECTED_ACCOUNT_ID,
      subject_type: "barber",
      barber_id: BARBER_ID,
      shop_id: null,
      provider: "stripe_connect",
      provider_account_id: "acct_barber",
      onboarding_status: "verified",
      payout_readiness_status: "ready",
      legal_readiness_status: "accepted",
      tax_readiness_status: "verified",
      requirements_currently_due: [],
      requirements_eventually_due: [],
      requirements_past_due: [],
      disabled_reason: null,
      charges_enabled: true,
      payouts_enabled: true,
      last_checked_at: null,
      onboarding_started_at: null,
      onboarding_completed_at: null,
      processor_last_synced_at: null,
      processor_last_event_id: null,
      processor_last_event_type: null,
      dashboard_last_accessed_at: null,
      created_by: null,
      created_at: "2026-05-26T13:00:00.000Z",
      updated_at: "2026-05-26T13:00:00.000Z"
    }],
    payout_executions: [],
    barbers: [{
      id: BARBER_ID,
      reference_code: "barber-phillip",
      profile_id: BARBER_PROFILE_ID,
      compensation_model: "freelance",
      commission_rate: null,
      booth_rent_amount: null,
      booth_rent_frequency: null
    }],
    profiles: [{
      id: BARBER_PROFILE_ID,
      email: "phillip@example.com",
      full_name: "Phillip mcgee",
      role: "barber_user"
    }],
    platform_events: [],
    ...overrides
  } satisfies Record<string, Row[]>;
}

function createSupabaseStub(
  tables: Record<string, Row[]>,
  tableErrors: Partial<Record<string, { message: string; code?: string; details?: string; hint?: string }>> = {},
  operationErrors: Partial<Record<string, Partial<Record<"insert" | "update" | "upsert", { message: string; code?: string; details?: string; hint?: string }>>>> = {}
) {
  class QueryBuilder {
    private filters: Array<(row: Row) => boolean> = [];
    private operation: "insert" | "update" | "upsert" | null = null;
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

    is(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    gt(column: string, value: number) {
      this.filters.push((row) => Number(row[column] ?? 0) > value);
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

    upsert(payload: Row | Row[]) {
      this.operation = "upsert";
      this.payload = payload;
      return this;
    }

    update(payload: Row) {
      this.operation = "update";
      this.payload = payload;
      return this;
    }

    private rows() {
      const source = tables[this.table] ?? [];
      let rows = source.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows = [...rows].sort((left, right) => `${left[column] ?? ""}`.localeCompare(`${right[column] ?? ""}`));
        if (!ascending) {
          rows.reverse();
        }
      }
      return this.rowLimit === null ? rows : rows.slice(0, this.rowLimit);
    }

    private execute() {
      tables[this.table] ??= [];
      const operationError = this.operation ? operationErrors[this.table]?.[this.operation] : null;
      if (operationError) {
        return { data: [], error: operationError };
      }
      const error = tableErrors[this.table];
      if (error) {
        return { data: [], error };
      }

      if (this.operation === "insert" || this.operation === "upsert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        if (this.table === "payout_executions") {
          const duplicate = rows.find((row) =>
            row.idempotency_key
            && tables[this.table].some((existing) => existing.idempotency_key === row.idempotency_key)
          );
          if (duplicate) {
            return {
              data: [],
              error: {
                code: "23505",
                message: "duplicate key value violates unique constraint \"payout_executions_idempotency_uidx\"",
                details: `Key (idempotency_key)=(${String(duplicate.idempotency_key)}) already exists.`,
                hint: ""
              }
            };
          }
        }
        const inserted = rows.map((row, index) => ({
          id: row.id ?? `${this.table}-${tables[this.table].length + index + 1}`,
          created_at: row.created_at ?? "2026-05-26T14:00:00.000Z",
          updated_at: row.updated_at ?? "2026-05-26T14:00:00.000Z",
          ...row
        }));
        tables[this.table].push(...inserted);
        return { data: inserted, error: null };
      }

      if (this.operation === "update") {
        const rows = this.rows();
        for (const row of rows) {
          Object.assign(row, this.payload);
        }
        return { data: rows, error: null };
      }

      return { data: this.rows(), error: null };
    }

    maybeSingle() {
      const result = this.execute();
      return Promise.resolve({ data: result.data[0] ?? null, error: result.error });
    }

    single() {
      const result = this.execute();
      return Promise.resolve({ data: result.data[0] ?? null, error: result.error });
    }

    then(resolve: (value: { data: Row[]; error: null | { message: string; code?: string; details?: string; hint?: string } }) => void, reject: (reason?: unknown) => void) {
      return Promise.resolve(this.execute()).then(resolve, reject);
    }
  }

  return {
    from: (table: string) => new QueryBuilder(table),
    tables
  };
}

describe("freelance payout execution", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    createStripeTransferMock.mockReset();
    getStripeConnectEnvironmentMock.mockReset();
    retrieveStripePlatformAccountMock.mockReset();
    retrieveStripePlatformBalanceMock.mockReset();
    syncWalletBalancesForPaymentMock.mockReset();
    isSupabaseEnabledMock.mockReturnValue(true);
    createStripeTransferMock.mockResolvedValue({ id: "tr_freelance" });
    getStripeConnectEnvironmentMock.mockReturnValue({
      mode: "test",
      label: "Stripe test mode.",
      blocksLivePayouts: true
    });
    retrieveStripePlatformAccountMock.mockResolvedValue({
      id: "acct_1L0nesLDU3d4YToG",
      country: "US",
      default_currency: "usd",
      charges_enabled: true,
      payouts_enabled: true,
      business_profile: { name: "BVRB3R Platform" },
      settings: { dashboard: { display_name: "BVRB3R Dashboard" } },
      livemode: false
    });
    retrieveStripePlatformBalanceMock.mockResolvedValue({
      available: [{ amount: 10000, currency: "usd" }],
      pending: [{ amount: 425, currency: "usd" }]
    });
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_EXPECTED_PLATFORM_ACCOUNT_ID;
  });

  it("validates a ready freelance POS routing record as eligible", async () => {
    const supabase = createSupabaseStub(createBaseTables());
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await validateFreelancePayoutReleaseEligibility(ROUTING_ID);

    expect(result.eligible).toBe(true);
    expect(result.releaseAmount).toBe(95);
    expect(result.stripeConnectAccountId).toBe("acct_barber");
    expect(result.stripePayoutReadiness?.canReceivePayouts).toBe(true);
  });

  it("returns safe Stripe platform diagnostics for the server key account", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_hidden";
    process.env.STRIPE_EXPECTED_PLATFORM_ACCOUNT_ID = "acct_1L0nesLDU3d4YToG";

    const result = await getArchitectStripePlatformDiagnostics();

    expect(result).toMatchObject({
      ok: true,
      platformAccountId: "acct_1L0nesLDU3d4YToG",
      country: "US",
      defaultCurrency: "usd",
      chargesEnabled: true,
      payoutsEnabled: true,
      dashboardDisplayName: "BVRB3R Platform",
      livemode: false,
      availableBalances: [{ currency: "usd", amount: 100 }],
      pendingBalances: [{ currency: "usd", amount: 4.25 }],
      stripeKeyMode: "test",
      expectedPlatformAccountId: "acct_1L0nesLDU3d4YToG",
      accountMatchesExpected: true,
      mismatchWarning: null
    });
    expect(JSON.stringify(result)).not.toContain("sk_test_hidden");
  });

  it("warns when the expected Stripe platform account does not match the server key account", async () => {
    process.env.STRIPE_EXPECTED_PLATFORM_ACCOUNT_ID = "acct_expected";

    const result = await getArchitectStripePlatformDiagnostics();

    expect(result.accountMatchesExpected).toBe(false);
    expect(result.mismatchWarning).toBe("Stripe account mismatch: the app is using acct_1L0nesLDU3d4YToG, but expected acct_expected.");
    expect(result.warnings).toContain("Stripe account mismatch: the app is using acct_1L0nesLDU3d4YToG, but expected acct_expected.");
  });

  it("returns no-account Stripe payout readiness when the barber has no Connect account", async () => {
    const supabase = createSupabaseStub(createBaseTables({
      connected_accounts: []
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await getBarberStripePayoutReadiness(BARBER_ID);

    expect(result.displayStatus).toBe("no_account");
    expect(result.canReceivePayouts).toBe(false);
    expect(result.displayMessage).toBe("Stripe payout account has not been created.");
  });

  it("returns payouts-disabled Stripe readiness when payouts are not enabled", async () => {
    const tables = createBaseTables({
      connected_accounts: [{
        ...createBaseTables().connected_accounts[0],
        payouts_enabled: false,
        payout_readiness_status: "needs_attention",
        requirements_currently_due: [],
        requirements_past_due: []
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await getBarberStripePayoutReadiness(BARBER_ID);

    expect(result.displayStatus).toBe("payouts_disabled");
    expect(result.canReceivePayouts).toBe(false);
    expect(result.displayMessage).toBe("Payouts are not enabled yet.");
  });

  it("returns incomplete Stripe readiness when account requirements are due", async () => {
    const supabase = createSupabaseStub(createBaseTables({
      connected_accounts: [{
        ...createBaseTables().connected_accounts[0],
        payouts_enabled: true,
        payout_readiness_status: "needs_attention",
        requirements_currently_due: ["external_account", "business_profile.url"]
      }]
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await getBarberStripePayoutReadiness(BARBER_ID);

    expect(result.displayStatus).toBe("incomplete");
    expect(result.canReceivePayouts).toBe(false);
    expect(result.currentlyDue).toEqual(["external_account", "business_profile.url"]);
    expect(result.displayMessage).toBe("Missing: external_account, business_profile.url.");
  });

  it("returns ready Stripe payout readiness when payouts are enabled with no blockers", async () => {
    const supabase = createSupabaseStub(createBaseTables());
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await getBarberStripePayoutReadiness(BARBER_ID);

    expect(result.displayStatus).toBe("ready");
    expect(result.canReceivePayouts).toBe(true);
    expect(result.displayMessage).toBe("Payout account ready.");
  });

  it("lists ready freelance POS payouts without requiring an appointment", async () => {
    const base = createBaseTables();
    const secondRouting = {
      ...base.payment_routing_records[0],
      id: "routing-card-35",
      payment_id: "payment-card-35",
      pos_sale_id: "pos-sale-card-35",
      provider_gross_amount: 35,
      platform_fee_amount: 1.75,
      provider_net_amount: 35,
      barber_payout_amount: 33.25,
      eligible_at: "2026-05-26T14:00:00.000Z",
      updated_at: "2026-05-26T14:00:00.000Z"
    };
    const secondPayment = {
      ...base.payments[0],
      id: "payment-card-35",
      pos_sale_id: "pos-sale-card-35",
      amount: 35
    };
    const secondSale = {
      ...base.pos_sales[0],
      id: "pos-sale-card-35",
      payment_id: "payment-card-35",
      total_cents: 3500,
      amount_cents: 3500,
      total_amount_cents: 3500
    };
    const supabase = createSupabaseStub(createBaseTables({
      payment_routing_records: [base.payment_routing_records[0], secondRouting],
      payments: [base.payments[0], secondPayment],
      pos_sales: [base.pos_sales[0], secondSale]
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await listArchitectFreelancePayoutQueue();

    expect(result.summary.readyCount).toBe(2);
    expect(result.summary.readyAmount).toBe(128.25);
    expect(result.items).toHaveLength(2);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        routingRecordId: ROUTING_ID,
        appointmentId: null,
        posSaleId: POS_SALE_ID,
        barberPayoutAmount: 95,
        canRelease: true
      }),
      expect.objectContaining({
        routingRecordId: "routing-card-35",
        appointmentId: null,
        posSaleId: "pos-sale-card-35",
        barberPayoutAmount: 33.25,
        canRelease: true
      })
    ]));
  });

  it("returns queue rows with a warning when dispute inspection is unavailable", async () => {
    const appointmentId = "appointment-paid";
    const base = createBaseTables({
      payment_routing_records: [{
        ...createBaseTables().payment_routing_records[0],
        id: "routing-appointment",
        payment_id: "payment-appointment",
        appointment_id: appointmentId,
        pos_sale_id: null
      }],
      payments: [{
        ...createBaseTables().payments[0],
        id: "payment-appointment",
        appointment_id: appointmentId,
        pos_sale_id: null,
        payment_type: "booking"
      }],
      pos_sales: [],
      appointments: [{
        id: appointmentId,
        reference_code: "BVRB-APPT-1",
        status: "completed",
        completed_at: "2026-05-26T13:00:00.000Z",
        starts_at: "2026-05-26T12:30:00.000Z",
        service_id: "service-1",
        membership_id: null,
        barber_id: BARBER_ID,
        shop_id: null,
        location_id: "location-1",
        client_id: "client-1"
      }]
    });
    const supabase = createSupabaseStub(base, {
      disputes: { message: "relation public.disputes is unavailable", code: "PGRST205" }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await listArchitectFreelancePayoutQueue();

    expect(result.items).toHaveLength(1);
    expect(result.summary.readyCount).toBe(1);
    expect(result.warnings).toContain("Dispute hold inspection unavailable. Manual review required.");
    expect(result.items[0].warnings).toContain("Dispute hold inspection unavailable. Manual review required.");
  });

  it("keeps enrichment failures visible without erasing healthy queue rows", async () => {
    const base = createBaseTables();
    const brokenRouting = {
      ...base.payment_routing_records[0],
      id: "routing-missing-payment",
      payment_id: "missing-payment",
      pos_sale_id: "pos-sale-missing-payment"
    };
    const supabase = createSupabaseStub(createBaseTables({
      payment_routing_records: [base.payment_routing_records[0], brokenRouting]
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await listArchitectFreelancePayoutQueue();

    expect(result.items).toHaveLength(2);
    expect(result.summary.readyCount).toBe(2);
    expect(result.warnings).toContain("Some payout rows could not be fully enriched. Visible rows may need manual repair before release.");
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        routingRecordId: ROUTING_ID,
        canRelease: true
      }),
      expect.objectContaining({
        routingRecordId: "routing-missing-payment",
        canRelease: false,
        releaseBlockedReason: "Payout context could not be fully loaded. Validate this row before release.",
        releaseActionLabel: "Cannot release yet",
        ineligibleReasons: ["Payout context could not be fully loaded. Validate this row before release."]
      })
    ]));
  });

  it("keeps failed release attempts visible in the payout queue while allowing safe retry", async () => {
    const tables = createBaseTables({
      payout_executions: [{
        id: "execution-failed",
        routing_record_id: ROUTING_ID,
        payment_id: PAYMENT_ID,
        appointment_id: null,
        membership_id: null,
        target_subject_type: "barber",
        execution_type: "transfer",
        target_connected_account_id: CONNECTED_ACCOUNT_ID,
        target_provider_account_id: "acct_barber",
        amount: 95,
        currency: "usd",
        execution_status: "failed",
        blocked_reason: null,
        failure_reason: "You have insufficient available funds in your Stripe account.",
        processor_transfer_id: null,
        processor_reversal_id: null,
        idempotency_key: "freelance_payout_release:routing-freelance:barber-1:95.00:usd",
        source_execution_id: null,
        source_refund_id: null,
        payout_reference: "payout:routing-freelance:barber",
        payout_speed: "standard",
        instant_payout_fee_amount: 0,
        net_transfer_amount: 95,
        processor_payout_id: null,
        reconciliation_status: "manual_review",
        metadata: {},
        initiated_by: "architect-profile",
        attempt_count: 1,
        last_attempted_at: "2026-05-26T13:05:00.000Z",
        executed_at: null,
        failed_at: "2026-05-26T13:05:00.000Z",
        reversed_at: null,
        created_at: "2026-05-26T13:05:00.000Z",
        updated_at: "2026-05-26T13:05:00.000Z"
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await listArchitectFreelancePayoutQueue();

    expect(result.items[0]).toMatchObject({
      routingRecordId: ROUTING_ID,
      canRelease: true,
      existingExecutionId: "execution-failed",
      existingExecutionStatus: "failed",
      lastFailedExecutionId: "execution-failed",
      lastFailedExecutionReason: "You have insufficient available funds in your Stripe account.",
      lastReleaseFailureMessage: "Release failed: insufficient available Stripe platform balance.",
      releaseActionLabel: "Retry release"
    });
  });

  it("blocks only rows with a confirmed active dispute", async () => {
    const appointmentId = "appointment-disputed";
    const base = createBaseTables();
    const disputedRouting = {
      ...base.payment_routing_records[0],
      id: "routing-disputed-appointment",
      payment_id: "payment-disputed-appointment",
      appointment_id: appointmentId,
      pos_sale_id: null
    };
    const disputedPayment = {
      ...base.payments[0],
      id: "payment-disputed-appointment",
      appointment_id: appointmentId,
      pos_sale_id: null,
      payment_type: "booking"
    };
    const supabase = createSupabaseStub(createBaseTables({
      payment_routing_records: [base.payment_routing_records[0], disputedRouting],
      payments: [base.payments[0], disputedPayment],
      appointments: [{
        id: appointmentId,
        reference_code: "BVRB-DISPUTED",
        status: "completed",
        completed_at: "2026-05-26T13:00:00.000Z",
        starts_at: "2026-05-26T12:30:00.000Z",
        service_id: "service-1",
        membership_id: null,
        barber_id: BARBER_ID,
        shop_id: null,
        location_id: "location-1",
        client_id: "client-1"
      }],
      disputes: [{
        id: "dispute-1",
        appointment_reference: "BVRB-DISPUTED",
        dispute_status: "open"
      }]
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await listArchitectFreelancePayoutQueue();

    expect(result.items).toHaveLength(2);
    expect(result.summary.readyCount).toBe(2);
    expect(result.summary.blockedCount).toBe(1);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        routingRecordId: ROUTING_ID,
        canRelease: true
      }),
      expect.objectContaining({
        routingRecordId: "routing-disputed-appointment",
        canRelease: false,
        releaseBlockedReason: "An active dispute hold blocks payout release.",
        releaseActionLabel: "Cannot release yet",
        ineligibleReasons: expect.arrayContaining(["An active dispute hold blocks payout release."])
      })
    ]));
  });

  it("excludes released, held, and reversed routing rows from the manual queue", async () => {
    const base = createBaseTables();
    const supabase = createSupabaseStub(createBaseTables({
      payment_routing_records: [
        base.payment_routing_records[0],
        { ...base.payment_routing_records[0], id: "routing-released", released_at: "2026-05-26T15:00:00.000Z" },
        { ...base.payment_routing_records[0], id: "routing-held", held_at: "2026-05-26T15:00:00.000Z" },
        { ...base.payment_routing_records[0], id: "routing-reversed", reversed_at: "2026-05-26T15:00:00.000Z" },
        { ...base.payment_routing_records[0], id: "routing-paid-out", money_routing_status: "paid_out" }
      ]
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await listArchitectFreelancePayoutQueue();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].routingRecordId).toBe(ROUTING_ID);
  });

  it("does not validate cash or missing-routing POS sales for release", async () => {
    const supabase = createSupabaseStub(createBaseTables({
      payment_routing_records: []
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    await expect(validateFreelancePayoutReleaseEligibility(ROUTING_ID)).rejects.toMatchObject({
      status: 404
    });
  });

  it("ignores booth rent and commission routing in Phase 1 release", async () => {
    for (const routingModel of ["booth_rent", "commission"]) {
      const supabase = createSupabaseStub(createBaseTables({
        payment_routing_records: [createBaseTables().payment_routing_records[0], {
          ...createBaseTables().payment_routing_records[0],
          id: `routing-${routingModel}`,
          routing_model: routingModel
        }]
      }));
      createSupabaseAdminClientMock.mockReturnValue(supabase);

      const result = await validateFreelancePayoutReleaseEligibility(`routing-${routingModel}`);
      expect(result.eligible).toBe(false);
      expect(result.reasons.join(" ")).toMatch(/Only freelance/i);
    }
  });

  it("returns a clear ineligible reason when the Stripe Connect account is missing", async () => {
    const supabase = createSupabaseStub(createBaseTables({
      connected_accounts: []
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await validateFreelancePayoutReleaseEligibility(ROUTING_ID);

    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/Stripe payout account has not been created/i);
  });

  it("rejects release validation with precise Stripe requirement reasons", async () => {
    const supabase = createSupabaseStub(createBaseTables({
      connected_accounts: [{
        ...createBaseTables().connected_accounts[0],
        payout_readiness_status: "needs_attention",
        requirements_currently_due: ["external_account", "business_profile.url"]
      }]
    }));
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await validateFreelancePayoutReleaseEligibility(ROUTING_ID);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Missing: external_account, business_profile.url.");
    expect(result.stripePayoutReadiness?.displayStatus).toBe("incomplete");
  });

  it("approves a Stripe-clean connected account that is pending internal payout review", async () => {
    const tables = createBaseTables({
      connected_accounts: [{
        ...createBaseTables().connected_accounts[0],
        payout_readiness_status: "needs_attention",
        legal_readiness_status: "pending",
        requirements_currently_due: [],
        requirements_past_due: [],
        disabled_reason: null,
        charges_enabled: true,
        payouts_enabled: true
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const before = await listArchitectFreelancePayoutQueue();
    expect(before.items[0]).toEqual(expect.objectContaining({
      canRelease: false,
      canApprovePayoutSetup: true,
      releaseBlockedReason: "Payout setup pending BVRB3R review."
    }));

    const result = await approveFreelancePayoutReadinessForRouting({
      routingRecordId: ROUTING_ID,
      approvedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(true);
    expect(result.previousPayoutReadinessStatus).toBe("needs_attention");
    expect(result.newPayoutReadinessStatus).toBe("ready");
    expect(result.previousLegalReadinessStatus).toBe("pending");
    expect(result.newLegalReadinessStatus).toBe("accepted");
    expect(tables.connected_accounts[0]).toMatchObject({
      payout_readiness_status: "ready",
      legal_readiness_status: "accepted"
    });
    expect(tables.platform_events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_type: "payout_readiness_approved",
        entity_id: CONNECTED_ACCOUNT_ID,
        actor_id: "architect-profile"
      })
    ]));

    const after = await listArchitectFreelancePayoutQueue();
    expect(after.items[0]).toEqual(expect.objectContaining({
      canRelease: true,
      canApprovePayoutSetup: false,
      releaseBlockedReason: null
    }));
  });

  it("rejects final payout approval when Stripe requirements are not clean", async () => {
    const tables = createBaseTables({
      connected_accounts: [{
        ...createBaseTables().connected_accounts[0],
        payout_readiness_status: "needs_attention",
        legal_readiness_status: "pending",
        payouts_enabled: false,
        requirements_currently_due: ["external_account"]
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await approveFreelancePayoutReadinessForRouting({
      routingRecordId: ROUTING_ID,
      approvedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "Stripe payouts are not enabled.",
      "Missing: external_account."
    ]));
    expect(tables.connected_accounts[0]).toMatchObject({
      payout_readiness_status: "needs_attention",
      legal_readiness_status: "pending"
    });
    expect(tables.platform_events).toHaveLength(0);
  });

  it("does not create a payout execution when release is blocked by Stripe readiness", async () => {
    const tables = createBaseTables({
      connected_accounts: [{
        ...createBaseTables().connected_accounts[0],
        payout_readiness_status: "needs_attention",
        requirements_currently_due: ["external_account"]
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Missing: external_account.");
    expect(result.eligibility.reasons).toContain("Missing: external_account.");
    expect(tables.payout_executions).toHaveLength(0);
    expect(tables.payment_routing_records[0].released_at).toBeNull();
    expect(createStripeTransferMock).not.toHaveBeenCalled();
  });

  it("supports dry-run without creating executions or marking released", async () => {
    const tables = createBaseTables();
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile",
      dryRun: true
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(tables.payout_executions).toHaveLength(0);
    expect(tables.payment_routing_records[0].released_at).toBeNull();
    expect(createStripeTransferMock).not.toHaveBeenCalled();
  });

  it("blocks release before transfer when Stripe platform available balance is too low", async () => {
    retrieveStripePlatformBalanceMock.mockResolvedValue({
      available: [{ amount: 9000, currency: "usd" }],
      pending: []
    });
    const tables = createBaseTables();
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("platform_balance_preflight");
    expect(result.errorCode).toBe("stripe_platform_balance_insufficient");
    expect(result.errorMessage).toBe("Release blocked: Stripe platform available balance is below payout amount.");
    expect(createStripeTransferMock).not.toHaveBeenCalled();
    expect(tables.payout_executions[0]).toMatchObject({
      execution_status: "failed",
      failure_reason: "Release blocked: Stripe platform available balance is below payout amount."
    });
    expect(tables.payment_routing_records[0]).toMatchObject({
      money_routing_status: "pending",
      released_at: null
    });
  });

  it("releases a ready freelance routing record through Stripe and marks routing paid out", async () => {
    const tables = createBaseTables();
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(true);
    expect(createStripeTransferMock).toHaveBeenCalledWith(expect.objectContaining({
      amount: 95,
      destinationAccountId: "acct_barber",
      idempotencyKey: "freelance_payout_release:routing-freelance:attempt:1"
    }));
    expect(tables.payout_executions[0]).toMatchObject({
      routing_record_id: ROUTING_ID,
      execution_status: "executed",
      processor_transfer_id: "tr_freelance"
    });
    expect(tables.payment_routing_records[0]).toMatchObject({
      money_routing_status: "paid_out",
      reconciliation_status: "settled"
    });
    expect(tables.payment_routing_records[0].released_at).toBeTruthy();
    expect(syncWalletBalancesForPaymentMock).toHaveBeenCalledWith(expect.anything(), PAYMENT_ID);
  });

  it("stores Stripe transfer failure and leaves routing unreleased", async () => {
    createStripeTransferMock.mockRejectedValue(new Error("Stripe account rejected transfer."));
    const tables = createBaseTables();
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Stripe account rejected transfer/i);
    expect(tables.payout_executions[0]).toMatchObject({
      execution_status: "failed",
      failure_reason: "Stripe account rejected transfer."
    });
    expect(tables.payment_routing_records[0].released_at).toBeNull();
  });

  it("surfaces insufficient Stripe platform balance without marking routing released", async () => {
    const stripeError = Object.assign(
      new Error("You have insufficient available funds in your Stripe account."),
      { code: "balance_insufficient" }
    );
    createStripeTransferMock.mockRejectedValue(stripeError);
    const tables = createBaseTables();
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("stripe_transfer");
    expect(result.errorCode).toBe("stripe_insufficient_funds");
    expect(result.errorMessage).toBe("Release failed: insufficient available Stripe platform balance.");
    expect(result.payoutExecutionId).toBe((tables.payout_executions[0] as Row).id);
    expect(tables.payout_executions[0]).toMatchObject({
      execution_status: "failed",
      failure_reason: "You have insufficient available funds in your Stripe account."
    });
    expect(tables.payment_routing_records[0]).toMatchObject({
      money_routing_status: "pending",
      released_at: null
    });
  });

  it("retries a failed release with a fresh execution row and idempotency key", async () => {
    const tables = createBaseTables({
      payout_executions: [{
        id: "execution-failed",
        routing_record_id: ROUTING_ID,
        payment_id: PAYMENT_ID,
        appointment_id: null,
        membership_id: null,
        target_subject_type: "barber",
        execution_type: "transfer",
        target_connected_account_id: CONNECTED_ACCOUNT_ID,
        target_provider_account_id: "acct_barber",
        amount: 95,
        currency: "usd",
        execution_status: "failed",
        blocked_reason: null,
        failure_reason: "You have insufficient available funds in your Stripe account.",
        processor_transfer_id: null,
        processor_reversal_id: null,
        idempotency_key: "freelance_payout_release:routing-freelance:attempt:1",
        source_execution_id: null,
        source_refund_id: null,
        payout_reference: "payout:routing-freelance:barber",
        payout_speed: "standard",
        instant_payout_fee_amount: 0,
        net_transfer_amount: 95,
        processor_payout_id: null,
        reconciliation_status: "manual_review",
        metadata: {},
        initiated_by: "architect-profile",
        attempt_count: 6,
        last_attempted_at: "2026-05-26T13:00:00.000Z",
        executed_at: null,
        failed_at: "2026-05-26T13:00:00.000Z",
        reversed_at: null,
        created_at: "2026-05-26T13:00:00.000Z",
        updated_at: "2026-05-26T13:00:00.000Z"
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(true);
    expect(createStripeTransferMock).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "freelance_payout_release:routing-freelance:attempt:7"
    }));
    expect(tables.payout_executions).toHaveLength(2);
    expect(tables.payout_executions[0]).toMatchObject({
      id: "execution-failed",
      execution_status: "failed",
      failure_reason: "You have insufficient available funds in your Stripe account.",
      processor_transfer_id: null
    });
    expect(tables.payout_executions[1]).toMatchObject({
      execution_status: "executed",
      failure_reason: null,
      attempt_count: 7,
      processor_transfer_id: "tr_freelance",
      idempotency_key: "freelance_payout_release:routing-freelance:attempt:7"
    });
    expect(tables.payment_routing_records[0]).toMatchObject({
      money_routing_status: "paid_out",
      blocked_reason: null
    });
    expect(tables.payment_routing_records[0].released_at).toBeTruthy();
  });

  it("skips occupied retry idempotency keys before inserting a fresh execution", async () => {
    const failedExecution = {
      id: "execution-failed",
      routing_record_id: ROUTING_ID,
      payment_id: PAYMENT_ID,
      appointment_id: null,
      membership_id: null,
      target_subject_type: "barber",
      execution_type: "transfer",
      target_connected_account_id: CONNECTED_ACCOUNT_ID,
      target_provider_account_id: "acct_barber",
      amount: 95,
      currency: "usd",
      execution_status: "failed",
      blocked_reason: null,
      failure_reason: "You have insufficient available funds in your Stripe account.",
      processor_transfer_id: null,
      processor_reversal_id: null,
      idempotency_key: "freelance_payout_release:routing-freelance:attempt:1",
      source_execution_id: null,
      source_refund_id: null,
      payout_reference: "payout:routing-freelance:barber:attempt:1",
      payout_speed: "standard",
      instant_payout_fee_amount: 0,
      net_transfer_amount: 95,
      processor_payout_id: null,
      reconciliation_status: "manual_review",
      metadata: {},
      initiated_by: "architect-profile",
      attempt_count: 6,
      last_attempted_at: "2026-05-26T13:00:00.000Z",
      executed_at: null,
      failed_at: "2026-05-26T13:00:00.000Z",
      reversed_at: null,
      created_at: "2026-05-26T13:00:00.000Z",
      updated_at: "2026-05-26T13:00:00.000Z"
    };
    const occupiedAttempt = {
      ...failedExecution,
      id: "execution-failed-occupied",
      idempotency_key: "freelance_payout_release:routing-freelance:attempt:7",
      payout_reference: "payout:routing-freelance:barber:attempt:7",
      attempt_count: 1,
      created_at: "2026-05-26T13:01:00.000Z",
      updated_at: "2026-05-26T13:01:00.000Z"
    };
    const tables = createBaseTables({
      payout_executions: [failedExecution, occupiedAttempt]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(true);
    expect(createStripeTransferMock).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "freelance_payout_release:routing-freelance:attempt:8"
    }));
    expect(tables.payout_executions).toHaveLength(3);
    expect(tables.payout_executions[2]).toMatchObject({
      execution_status: "executed",
      attempt_count: 8,
      idempotency_key: "freelance_payout_release:routing-freelance:attempt:8",
      processor_transfer_id: "tr_freelance"
    });
  });

  it("returns safe insert diagnostics when payout execution creation fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tables = createBaseTables();
    const supabase = createSupabaseStub(tables, {}, {
      payout_executions: {
        insert: {
          code: "23505",
          message: "duplicate key value violates unique constraint \"payout_executions_idempotency_uidx\"",
          details: "Key (idempotency_key)=(freelance_payout_release:routing-freelance:attempt:1) already exists.",
          hint: ""
        }
      }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("create_payout_execution");
    expect(result.errorCode).toBe("payout_execution_insert_failed");
    expect(result.errorMessage).toBe("Unable to create the payout execution record.");
    expect(result.debugSafeDetails).toMatchObject({
      table: "payout_executions",
      constraint: "payout_executions_idempotency_uidx",
      supabaseCode: "23505",
      supabaseMessage: "duplicate key value violates unique constraint \"payout_executions_idempotency_uidx\"",
      supabaseDetails: "Key (idempotency_key)=(freelance_payout_release:routing-freelance:attempt:1) already exists.",
      supabaseHint: null,
      attemptedIdempotencyKey: "freelance_payout_release:routing-freelance:attempt:1",
      attemptedAttemptCount: 1,
      nextAttemptNumber: 1,
      routingRecordId: ROUTING_ID,
      paymentId: PAYMENT_ID,
      targetConnectedAccountId: CONNECTED_ACCOUNT_ID,
      targetProviderAccountId: "acct_barber",
      amount: 95,
      currency: "usd",
      executionStatus: "pending",
      executionType: "transfer",
      targetSubjectType: "barber"
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith("BVRB3R_PAYOUT_EXECUTION_INSERT_FAILED", expect.objectContaining({
      code: "23505",
      message: "duplicate key value violates unique constraint \"payout_executions_idempotency_uidx\"",
      attemptedPayloadKeys: expect.arrayContaining(["idempotency_key", "attempt_count", "routing_record_id"]),
      attemptedIdempotencyKey: "freelance_payout_release:routing-freelance:attempt:1",
      attemptedAttemptCount: 1,
      routingRecordId: ROUTING_ID,
      paymentId: PAYMENT_ID,
      targetConnectedAccountId: CONNECTED_ACCOUNT_ID,
      targetProviderAccountId: "acct_barber",
      amount: 95,
      currency: "usd",
      executionStatus: "pending",
      executionType: "transfer",
      targetSubjectType: "barber"
    }));
    expect(createStripeTransferMock).not.toHaveBeenCalled();
    expect(tables.payment_routing_records[0].released_at).toBeNull();
    consoleErrorSpy.mockRestore();
  });

  it("does not double-release an already executed routing record", async () => {
    const tables = createBaseTables({
      payout_executions: [{
        id: "execution-done",
        routing_record_id: ROUTING_ID,
        payment_id: PAYMENT_ID,
        appointment_id: null,
        membership_id: null,
        target_subject_type: "barber",
        execution_type: "transfer",
        target_connected_account_id: CONNECTED_ACCOUNT_ID,
        target_provider_account_id: "acct_barber",
        amount: 95,
        currency: "usd",
        execution_status: "executed",
        blocked_reason: null,
        failure_reason: null,
        processor_transfer_id: "tr_existing",
        processor_reversal_id: null,
        idempotency_key: "existing",
        source_execution_id: null,
        source_refund_id: null,
        payout_reference: "payout:existing",
        payout_speed: "standard",
        instant_payout_fee_amount: 0,
        net_transfer_amount: 95,
        processor_payout_id: null,
        reconciliation_status: "settled",
        metadata: {},
        initiated_by: "architect-profile",
        attempt_count: 1,
        last_attempted_at: "2026-05-26T13:00:00.000Z",
        executed_at: "2026-05-26T13:00:00.000Z",
        failed_at: null,
        reversed_at: null,
        created_at: "2026-05-26T13:00:00.000Z",
        updated_at: "2026-05-26T13:00:00.000Z"
      }]
    });
    const supabase = createSupabaseStub(tables);
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await releaseFreelanceRoutingPayout({
      routingRecordId: ROUTING_ID,
      requestedByProfileId: "architect-profile"
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already released/i);
    expect(createStripeTransferMock).not.toHaveBeenCalled();
  });
});
