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

import { BarberPosSaleError, quoteBarberPosSale, quoteBarberPosSaleForUser } from "@/lib/barber/pos-sales";

type FakeRow = Record<string, unknown>;
type FakeTables = Record<string, FakeRow[]>;

class FakeQueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];

  constructor(
    private readonly table: string,
    private readonly rows: FakeRow[]
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.filteredRows()[0] ?? null,
      error: null
    });
  }

  private filteredRows() {
    return this.rows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value)
    );
  }
}

function createSupabaseMock(tables: FakeTables) {
  return {
    from(table: string) {
      return new FakeQueryBuilder(table, tables[table] ?? []);
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
});
