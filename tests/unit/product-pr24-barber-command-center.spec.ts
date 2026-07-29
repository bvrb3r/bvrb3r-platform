import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isBvrb3rFinancialAppointment,
  normalizeExternalCalendarStatus,
  resolveExternalCalendarProvider
} from "@/lib/barber/command-center";
import {
  isQueueEntryOwnedByBarber,
  QueueServiceError,
  toBarberQueueEntry,
  type QueueEntryView
} from "@/lib/queue/service";

const {
  getBarberQueuePayloadMock,
  getSessionUserMock
} = vi.hoisted(() => ({
  getBarberQueuePayloadMock: vi.fn(),
  getSessionUserMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/queue/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queue/service")>("@/lib/queue/service");
  return {
    ...actual,
    getBarberQueuePayload: getBarberQueuePayloadMock
  };
});

import { GET as getBarberQueue } from "@/app/api/barber/queue/route";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260729021500_product_pr24_barber_command_center.sql"
  ),
  "utf8"
).replace(/\s+/g, " ").toLowerCase();

describe("Product PR24 calendar and financial ownership", () => {
  it("recognizes only BVRB3R-owned, non-private appointments as financial", () => {
    expect(isBvrb3rFinancialAppointment({
      sourceProvider: "bvrb3r",
      paymentOwner: "bvrb3r_card",
      externalFinancialDataPrivate: false
    })).toBe(true);
    expect(isBvrb3rFinancialAppointment({
      sourceProvider: "booksy",
      paymentOwner: "external:booksy",
      externalFinancialDataPrivate: true
    })).toBe(false);
    expect(isBvrb3rFinancialAppointment({
      sourceProvider: "bvrb3r",
      paymentOwner: "external:square",
      externalFinancialDataPrivate: true
    })).toBe(false);
  });

  it("resolves legacy external ownership without inventing a provider", () => {
    expect(resolveExternalCalendarProvider({
      sourceProvider: "booksy",
      paymentOwner: "external:booksy"
    })).toBe("booksy");
    expect(resolveExternalCalendarProvider({
      sourceProvider: "bvrb3r",
      paymentOwner: "external:thecut"
    })).toBe("thecut");
    expect(resolveExternalCalendarProvider({
      sourceProvider: "bvrb3r",
      paymentOwner: "unpaid_manual"
    })).toBeNull();
  });

  it("maps external source statuses into the read-only calendar vocabulary", () => {
    expect(normalizeExternalCalendarStatus("cancelled")).toBe("canceled");
    expect(normalizeExternalCalendarStatus("checked_in")).toBe("checked_in");
    expect(normalizeExternalCalendarStatus("pending")).toBe("booked");
  });
});

describe("Product PR24 barber queue route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getBarberQueuePayloadMock.mockReset();
  });

  it("returns the privacy-minimized barber queue payload", async () => {
    const user = { id: "barber-profile", role: "barber_user" };
    const payload = {
      summary: {
        activeCount: 1,
        calledCount: 0,
        assignedCount: 0,
        averageWaitMinutes: 8,
        sourceCounts: { bvrb3r: 1, booksy: 0, square: 0, thecut: 0 }
      },
      entries: [{ id: "queue-24", clientName: "Queue Guest" }],
      recentResolvedEntries: []
    };
    getSessionUserMock.mockResolvedValue(user);
    getBarberQueuePayloadMock.mockResolvedValue(payload);

    const response = await getBarberQueue();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
    expect(getBarberQueuePayloadMock).toHaveBeenCalledWith(user);
  });

  it("preserves barber-safe queue access errors", async () => {
    getSessionUserMock.mockResolvedValue({ id: "client-profile", role: "client" });
    getBarberQueuePayloadMock.mockRejectedValue(
      new QueueServiceError("Only barbers can open the barber command queue.", 403)
    );

    const response = await getBarberQueue();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only barbers can open the barber command queue."
    });
  });

  it("uses the assigned barber as the authoritative queue owner", () => {
    const barberIds = new Set(["barber-24"]);
    expect(isQueueEntryOwnedByBarber({
      assignedBarberId: "barber-other",
      preferredBarberId: "barber-24"
    }, barberIds)).toBe(false);
    expect(isQueueEntryOwnedByBarber({
      assignedBarberId: "barber-24",
      preferredBarberId: "barber-other"
    }, barberIds)).toBe(true);
    expect(isQueueEntryOwnedByBarber({
      assignedBarberId: undefined,
      preferredBarberId: "barber-24"
    }, barberIds)).toBe(true);
  });

  it("removes direct contact fields and cross-chair suggestions from barber queue rows", () => {
    const entry = {
      id: "queue-24",
      clientPhone: "8135550101",
      clientEmail: "guest@example.com",
      bestAvailableBarber: {
        barberId: "barber-other",
        barberName: "Other Barber",
        nextAvailableAt: null,
        liveStatusLabel: "Available"
      }
    } as QueueEntryView;

    const safeEntry = toBarberQueueEntry(entry);
    expect(safeEntry).not.toHaveProperty("clientPhone");
    expect(safeEntry).not.toHaveProperty("clientEmail");
    expect(safeEntry).not.toHaveProperty("bestAvailableBarber");
  });
});

describe("Product PR24 database guard", () => {
  it("is transactional, pinned, private, and validates the PR23 privacy contract", () => {
    expect(migration.startsWith("--")).toBe(true);
    expect(migration).toContain("begin;");
    expect(migration.trim().endsWith("commit;")).toBe(true);
    expect(migration).toContain("validate constraint appointments_external_financial_privacy_ck");
    expect(migration).toContain("security definer set search_path = ''");
    expect(migration).toContain("revoke all on function private.product_pr24_guard_external_appointment_financial_write() from public, anon, authenticated");
  });

  it("blocks external appointment writes across every BVRB3R financial ledger", () => {
    expect(migration).toContain("appointment_source <> 'bvrb3r'");
    expect(migration).toContain("appointment_payment_owner like 'external:%'");
    expect(migration).toContain("coalesce(external_financial_private, false)");
    for (const table of ["public.payments", "public.tips", "public.payment_routing_records"]) {
      expect(migration).toContain(`on ${table}`);
    }
    expect(migration.match(/execute function private\.product_pr24_guard_external_appointment_financial_write\(\)/g))
      .toHaveLength(3);
    expect(migration.match(/before insert or update on public\.(payments|tips|payment_routing_records)/g))
      .toHaveLength(3);
  });

  it("blocks native appointments with money truth from being retargeted as external", () => {
    expect(migration).toContain("private.product_pr24_guard_external_source_retarget()");
    expect(migration).toContain("before update of source_provider, payment_owner, external_financial_data_private on public.appointments");
    expect(migration).toContain("from public.payments p where p.appointment_id = new.id");
    expect(migration).toContain("from public.tips t where t.appointment_id = new.id");
    expect(migration).toContain("from public.payment_routing_records r where r.appointment_id = new.id");
    expect(migration).toContain("appointments with bvrb3r financial records cannot be retargeted to an external source");
  });

  it("adds only operational indexes and no external money columns", () => {
    expect(migration).toContain("chairsync_barber_range_status_idx");
    expect(migration).toContain("waitlist_entries_barber_command_idx");
    expect(migration).toContain("waitlist_entries_preference_command_idx");
    expect(migration).not.toMatch(/alter table public\.chairsync_appointments[^;]+add column[^;]+(amount|price|fee|tip|revenue)/);
  });
});
