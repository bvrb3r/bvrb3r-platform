import type { Mock } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
type QueryResult = { data: Row[] | Row | null; error: Row | null };

export const ARCHITECT_USER = makePlatformAdminUser();
export const CLIENT_PROFILE_ID = "1fd26b88-3c68-465f-8a71-f09e614b1bd4";
export const CLIENT_ID = "6607bce8-3636-46e8-9bbd-eabd9e5ad065";
export const BARBER_PROFILE_ID = "43b3cda2-3fe0-4632-95bb-56c005b5a3cf";
export const BARBER_ID = "455c2930-7255-418b-bd2b-cc64bc0fc9b7";
export const APPOINTMENT_ID = "2090ae1e-3b7c-59d2-81ac-9f88908fd735";
export const SERVICE_ID = "ad4e3664-6609-556e-ae9e-53c5ba50ef9a";
export const LOCATION_ID = "67ad0d9b-4f60-44e6-a213-86f665324574";
export const PAYMENT_ID = "e681ffde-7a67-4277-96c0-a35519ba4acd";

export function createArchitectDebugTables(overrides: Partial<Tables> = {}): Tables {
  const schemaRows: Row[] = [
    ...["status", "completed_at", "updated_at"].map((column_name, ordinal_position) => ({ table_name: "appointments", column_name, data_type: "text", is_nullable: "YES", ordinal_position })),
    ...["amount", "payment_status", "status"].map((column_name, ordinal_position) => ({ table_name: "payments", column_name, data_type: "text", is_nullable: "YES", ordinal_position })),
    ...["provider_gross_amount", "barber_payout_amount", "payout_readiness_status"].map((column_name, ordinal_position) => ({ table_name: "payment_routing_records", column_name, data_type: "text", is_nullable: "YES", ordinal_position })),
    ...["changed_at", "change_reason"].map((column_name, ordinal_position) => ({ table_name: "appointment_status_history", column_name, data_type: "text", is_nullable: "YES", ordinal_position }))
  ];

  return {
    profiles: [
      { id: CLIENT_PROFILE_ID, email: "phillipmcgeeclient@outlook.com", full_name: "Phillip mcgee", role: "client_user", account_status: "active" },
      { id: BARBER_PROFILE_ID, email: "phillipmcgee813@gmail.com", full_name: "Phillip mcgee", role: "barber_user", account_status: "active" },
      { id: ARCHITECT_USER.id, email: ARCHITECT_USER.email, full_name: ARCHITECT_USER.name, role: "platform_admin", primary_onboarding_role: "platform_admin", account_status: "active" }
    ],
    clients: [{ id: CLIENT_ID, profile_id: CLIENT_PROFILE_ID }],
    barbers: [{
      id: BARBER_ID,
      profile_id: BARBER_PROFILE_ID,
      reference_code: "barber-43b3cda2",
      booking_slug: "barber-43b3cda2",
      barber_subtype: "freelance",
      status: "active"
    }],
    services: [{
      id: SERVICE_ID,
      reference_code: "srv-test-cut-1777841145997",
      name: "test cut",
      price: 5,
      duration_min: 15,
      location_id: LOCATION_ID,
      service_owner: "barber",
      barber_reference: "barber-43b3cda2"
    }],
    appointments: [{
      id: APPOINTMENT_ID,
      reference_code: "appt-1778939666238-vgukd",
      client_id: CLIENT_ID,
      barber_id: BARBER_ID,
      service_id: SERVICE_ID,
      location_id: LOCATION_ID,
      shop_id: null,
      status: "completed",
      completed_at: "2026-05-17T13:51:03.886Z",
      updated_at: "2026-05-17T13:51:03.886Z",
      total_amount: 5,
      grand_total: 5,
      balance_due: 0,
      chair_label: "Phils chair"
    }],
    payments: [{
      id: PAYMENT_ID,
      appointment_id: APPOINTMENT_ID,
      client_id: CLIENT_ID,
      barber_id: BARBER_ID,
      amount: 5,
      provider: "stripe",
      status: "captured",
      payment_status: "captured",
      payment_type: "booking",
      provider_payment_intent_id: "pi_test_paid",
      payment_method_id: "1cfaff6a-9b94-4d68-8b8e-2f0f875f8482",
      currency: "usd",
      paid_at: "2026-05-17T13:40:00.000Z",
      created_at: "2026-05-17T13:40:00.000Z"
    }],
    payment_methods: [{
      id: "1cfaff6a-9b94-4d68-8b8e-2f0f875f8482",
      client_id: CLIENT_ID,
      brand: "visa",
      last4: "4242",
      provider_payment_method_id: "pm_test_4242"
    }],
    payment_routing_records: [],
    appointment_status_history: [{
      id: "history-completed",
      appointment_id: APPOINTMENT_ID,
      status: "completed",
      changed_by: BARBER_PROFILE_ID,
      changed_at: "2026-05-17T13:51:03.886Z",
      old_status: "confirmed",
      new_status: "completed",
      change_reason: "barber_completed_service"
    }],
    platform_events: [],
    architect_debug_sessions: [],
    architect_repair_audit_logs: [],
    "information_schema.columns": schemaRows,
    ...overrides
  };
}

export function createSupabaseStub(tables: Tables) {
  class QueryBuilder {
    private filters: Array<(row: Row) => boolean> = [];
    private orderBy: { column: string; ascending: boolean } | null = null;
    private rowLimit: number | null = null;
    private operation: "insert" | "update" | null = null;
    private payload: Row | Row[] | null = null;

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
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
          ...entry
        }));
        tables[this.table].push(...inserted);
        return Promise.resolve({ data: inserted, error: null });
      }

      let rows = [...tables[this.table].filter((row) => this.filters.every((filter) => filter(row)))];
      if (this.operation === "update" && this.payload) {
        rows.forEach((row) => Object.assign(row, this.payload));
      }
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows = rows.sort((a, b) => `${a[column] ?? ""}`.localeCompare(`${b[column] ?? ""}`) * (ascending ? 1 : -1));
      }
      if (this.rowLimit !== null) {
        rows = rows.slice(0, this.rowLimit);
      }
      return Promise.resolve({ data: rows, error: null });
    }
  }

  return {
    from: (table: string) => new QueryBuilder(table)
  };
}

export function mockArchitectSession(getCurrentUserFromServerMock: Mock, user = ARCHITECT_USER) {
  getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user });
}
