import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  getBarberDashboardPayloadMock,
  readCanonicalWorkingHoursMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  getBarberDashboardPayloadMock: vi.fn(),
  readCanonicalWorkingHoursMock: vi.fn()
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

vi.mock("@/lib/booking/platform-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/booking/platform-service")>("@/lib/booking/platform-service");
  return {
    ...actual,
    getBarberDashboardPayload: getBarberDashboardPayloadMock
  };
});

vi.mock("@/lib/booking/canonical-booking", async () => {
  const actual = await vi.importActual<typeof import("@/lib/booking/canonical-booking")>("@/lib/booking/canonical-booking");
  return {
    ...actual,
    readCanonicalWorkingHours: readCanonicalWorkingHoursMock
  };
});

import { RETIRED_REVENUE_SHARE_MODEL } from "@/lib/doctrine/legacy-data-aliases";
import { getBarberSchedulePayload } from "@/lib/barber/service";
import { canonicalAppointmentUuid } from "@/lib/booking/canonical-booking";

const freelanceBarber = {
  id: "12345678-1234-5123-9234-123456789abc",
  reference_code: "barber-43b3cda2",
  profile_id: "22345678-1234-5123-9234-123456789abc",
  compensation_model: "freelance"
};

function createSupabaseMock(input?: {
  locationLookupFails?: boolean;
  barber?: typeof freelanceBarber;
  staffLocations?: Array<{ location_id: string }>;
}) {
  const locationLookupFails = input?.locationLookupFails ?? false;
  const barber = input?.barber ?? freelanceBarber;
  const staffLocations = input?.staffLocations ?? [{ location_id: "stale-shop-location" }];

  function resultFor(table: string, single: boolean) {
    if (table === "barbers" && single) {
      return { data: barber, error: null };
    }

    if (table === "staff_locations") {
      return {
        data: staffLocations,
        error: null
      };
    }

    if (table === "locations") {
      return locationLookupFails
        ? {
            data: null,
            error: {
              code: "PGRST116",
              message: "location lookup unavailable"
            }
          }
        : {
            data: [],
            error: null
          };
    }

    if (table === "barber_profiles" && single) {
      return {
        data: {
          display_name: "philforsure",
          service_area_label: "Phils chair\n2172 University Square More\nTampa, FL"
        },
        error: null
      };
    }

    if (table === "barber_status" && single) {
      return { data: null, error: null };
    }

    if (table === "blocked_times") {
      return { data: [], error: null };
    }

    if (table === "payments" || table === "tips") {
      return { data: [], error: null };
    }

    return single ? { data: null, error: null } : { data: [], error: null };
  }

  function builder(table: string) {
    const query: Record<string, unknown> = {
      select: () => query,
      eq: () => query,
      or: () => query,
      in: () => query,
      gte: () => query,
      gt: () => query,
      lt: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => resultFor(table, true),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(resultFor(table, false)).then(resolve, reject)
    };
    return query;
  }

  return {
    from: (table: string) => builder(table)
  };
}

function buildDashboard(appointments: Array<Record<string, unknown>> = []) {
  return {
    summary: {
      businessDate: "2026-05-14",
      activeCount: 0,
      serviceRevenueToday: 0,
      tipsToday: 0,
      rentAppliedToday: 0,
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
    clients: []
  };
}

describe("freelance barber calendar", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    getBarberDashboardPayloadMock.mockReset();
    readCanonicalWorkingHoursMock.mockReset();
    getBarberDashboardPayloadMock.mockResolvedValue(buildDashboard());
    readCanonicalWorkingHoursMock.mockResolvedValue([]);
  });

  it("loads the barber calendar in freelance mode when stale shop assignments cannot be resolved", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({ locationLookupFails: true }));

    const payload = await getBarberSchedulePayload({
      id: "22345678-1234-5123-9234-123456789abc",
      role: "booth_rent_barber",
      email: "philforsure@example.com",
      password: "DevOnly!123",
      name: "philforsure",
      title: "Freelance Barber",
      locationIds: [],
      barberId: "barber-43b3cda2"
    }, { viewMode: "day", anchorDate: "2026-05-14" });

    expect(payload.shops).toEqual([expect.objectContaining({
      id: "independent-barber-43b3cda2",
      label: expect.stringContaining("Phils chair")
    })]);
    expect(payload.timeline.appointments).toEqual([]);
  });

  it("keeps barber-direct appointments visible on a freelance barber calendar", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock());
    getBarberDashboardPayloadMock.mockResolvedValue(buildDashboard([{
      id: "appt-phil-1",
      locationId: "independent-barber-43b3cda2",
      barberId: "barber-43b3cda2",
      clientId: "client-1",
      serviceId: "srv-test-cut",
      status: "confirmed",
      start: "2026-05-14T16:00:00.000Z",
      end: "2026-05-14T16:15:00.000Z",
      chair: "Phils chair",
      addOnIds: [],
      depositAmount: 5,
      totalAmount: 5,
      balanceDue: 0,
      tipAmount: 0,
      note: "",
      source: "booking",
      revision: 1,
      updatedAt: "2026-05-14T15:00:00.000Z",
      display: {
        serviceName: "test cut"
      }
    }]));

    const payload = await getBarberSchedulePayload({
      id: "22345678-1234-5123-9234-123456789abc",
      role: "booth_rent_barber",
      email: "philforsure@example.com",
      password: "DevOnly!123",
      name: "philforsure",
      title: "Freelance Barber",
      locationIds: [],
      barberId: "barber-43b3cda2"
    }, { viewMode: "day", anchorDate: "2026-05-14" });

    expect(payload.timeline.appointments).toHaveLength(1);
    expect(payload.timeline.appointments[0].id).toBe(canonicalAppointmentUuid("appt-phil-1"));
    expect(payload.upcomingAppointments).toHaveLength(1);
  });

  it("normalizes a retired revenue-share barber with no active assignment to freelance", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      barber: {
        ...freelanceBarber,
        compensation_model: RETIRED_REVENUE_SHARE_MODEL
      },
      staffLocations: [],
      locationLookupFails: true
    }));

    const payload = await getBarberSchedulePayload({
      id: "22345678-1234-5123-9234-123456789abc",
      role: "barber_user",
      email: "philforsure@example.com",
      password: "DevOnly!123",
      name: "philforsure",
      title: "Freelance Barber",
      locationIds: [],
      barberId: "barber-43b3cda2"
    }, { viewMode: "day", anchorDate: "2026-05-14" });

    expect(payload.shops).toEqual([expect.objectContaining({
      id: "independent-barber-43b3cda2"
    })]);
    expect(payload.timeline.appointments).toEqual([]);
  });
});
