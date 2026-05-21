import { beforeEach, describe, expect, it, vi } from "vitest";
import { ARCHITECT_USER } from "@/tests/unit/architect-debug-test-utils";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { getArchitectReportDetail, listArchitectReports } from "@/lib/architect/reports/service";

type FakeError = { code?: string; message?: string; name?: string };
type FakeTables = Record<string, Array<Record<string, unknown>>>;
type FakeErrors = Record<string, FakeError>;

class FakeQueryBuilder {
  private filters: Array<{ column: string; value: unknown; op: "eq" | "in" }> = [];
  private rowLimit: number | null = null;

  constructor(
    private readonly table: string,
    private readonly rows: Array<Record<string, unknown>>,
    private readonly errors: FakeErrors
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, op: "eq" });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ column, value, op: "in" });
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
    if (this.errors[this.table]) {
      return Promise.resolve({ data: null, error: this.errors[this.table] });
    }

    return Promise.resolve({ data: this.filteredRows()[0] ?? null, error: null });
  }

  single() {
    return this.maybeSingle();
  }

  then<TResult1 = { data: Array<Record<string, unknown>>; error: FakeError | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Array<Record<string, unknown>>; error: FakeError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }

  private result() {
    if (this.errors[this.table]) {
      return { data: [], error: this.errors[this.table] };
    }

    const rows = this.filteredRows();
    return { data: this.rowLimit === null ? rows : rows.slice(0, this.rowLimit), error: null };
  }

  private filteredRows() {
    return this.rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.op === "in") {
          return (filter.value as unknown[]).includes(row[filter.column]);
        }

        return row[filter.column] === filter.value;
      })
    );
  }
}

function createSupabaseMock(tables: FakeTables, errors: FakeErrors = {}) {
  return {
    from(table: string) {
      return new FakeQueryBuilder(table, tables[table] ?? [], errors);
    }
  };
}

const reportRow = {
  id: "safety-report-1",
  reporter_role: "client_user",
  reporter_reference: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
  reporter_email: "phillipmcgeeclient@outlook.com",
  subject_type: "barber",
  subject_reference: "barber-43b3cda2",
  category: "fake_profile",
  details: "This trust signal needs a closer review.",
  status: "open",
  location_reference: null,
  created_at: "2026-05-21T12:00:00.000Z",
  updated_at: "2026-05-21T12:00:00.000Z"
};

describe("architect reports service", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("keeps unresolved barber reports visible instead of failing the whole list", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      safety_reports: [reportRow],
      clients: [],
      profiles: [],
      thread_participants: [],
      message_threads: []
    }, {
      barbers: { code: "22P02", message: "invalid input syntax for type uuid" },
      barber_profiles: { code: "42P01", message: "relation barber_profiles does not exist" }
    }));

    const payload = await listArchitectReports(ARCHITECT_USER);

    expect(payload.summary.total).toBe(1);
    expect(payload.reports).toHaveLength(1);
    expect(payload.reports[0]).toMatchObject({
      id: "safety-report-1",
      targetName: "Unknown barber",
      targetReference: "barber-43b3cda2",
      targetResolution: "unresolved"
    });
  });

  it("resolves barber- fallback references without requiring a UUID lookup", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      safety_reports: [reportRow],
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "43b3cda2-3fe0-4632-95bb-56c005b5a3cf",
        reference_code: "barber-43b3cda2",
        booking_slug: "barber-43b3cda2"
      }],
      barber_profiles: [{
        barber_reference: "barber-43b3cda2",
        username: "barber-43b3cda2",
        display_name: "Phillip mcgee"
      }],
      clients: [],
      profiles: [{
        id: "43b3cda2-3fe0-4632-95bb-56c005b5a3cf",
        full_name: "Phillip mcgee",
        email: "phillipmcgee813@gmail.com",
        role: "barber_user"
      }],
      thread_participants: [],
      message_threads: []
    }));

    const payload = await listArchitectReports(ARCHITECT_USER);

    expect(payload.reports[0]).toMatchObject({
      targetName: "Phillip mcgee",
      targetHref: "/barber/barber-43b3cda2",
      targetReference: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
      targetResolution: "resolved"
    });
  });

  it("loads report detail with fallback metadata when target enrichment fails", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      safety_reports: [reportRow],
      report_events: [],
      clients: [],
      profiles: [],
      thread_participants: [],
      message_threads: []
    }, {
      barbers: { code: "42703", message: "column does not exist" }
    }));

    const payload = await getArchitectReportDetail(ARCHITECT_USER, "safety-report-1");

    expect(payload.report).toMatchObject({
      id: "safety-report-1",
      targetName: "Unknown barber",
      targetReference: "barber-43b3cda2",
      targetResolution: "unresolved"
    });
  });
});
