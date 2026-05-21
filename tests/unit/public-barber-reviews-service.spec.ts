import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  isSupabaseEnabledMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: isSupabaseEnabledMock
  };
});

import { submitPublicBarberReview } from "@/lib/booking/platform-service";

type MockSupabaseInput = {
  clientRow?: Record<string, unknown> | null;
  barberRow?: Record<string, unknown> | null;
  appointmentRows?: Array<Record<string, unknown>>;
  existingReviewRows?: Array<Record<string, unknown>>;
  insertError?: { code?: string; details?: string; message?: string } | null;
};

function createReviewSupabaseMock(input: MockSupabaseInput) {
  const state = {
    insertPayload: null as Record<string, unknown> | null
  };

  function selectRows(table: string) {
    if (table === "appointments") {
      return { data: input.appointmentRows ?? [], error: null };
    }

    if (table === "reviews") {
      return { data: input.existingReviewRows ?? [], error: null };
    }

    return { data: [], error: null };
  }

  const supabase = {
    state,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let insertPayload: Record<string, unknown> | null = null;

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve(selectRows(table));
        },
        in(column: string, value: unknown) {
          filters[column] = value;
          return Promise.resolve(selectRows(table));
        },
        maybeSingle() {
          if (table === "clients") {
            return Promise.resolve({ data: input.clientRow ?? null, error: null });
          }

          if (table === "barbers") {
            return Promise.resolve({ data: input.barberRow ?? null, error: null });
          }

          return Promise.resolve({ data: null, error: null });
        },
        insert(payload: Record<string, unknown>) {
          insertPayload = payload;
          state.insertPayload = payload;
          return builder;
        },
        single() {
          if (input.insertError) {
            return Promise.resolve({ data: null, error: input.insertError });
          }

          return Promise.resolve({
            data: {
              id: "review-1",
              ...(insertPayload ?? {}),
              created_at: insertPayload?.created_at ?? "2026-05-20T12:00:00.000Z"
            },
            error: null
          });
        }
      };

      return builder;
    }
  };

  return supabase;
}

describe("public barber review service", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    isSupabaseEnabledMock.mockReturnValue(true);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a public barber reference and inserts using production reviews columns only", async () => {
    const supabase = createReviewSupabaseMock({
      clientRow: {
        id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        reference_code: null,
        profile_id: "1fd26b88-3c68-465f-8a71-f09e614b1bd4"
      },
      barberRow: {
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        reference_code: "barber-43b3cda2",
        profile_id: "43b3cda2-3fe0-4632-95bb-56c005b5a3cf"
      },
      appointmentRows: [
        {
          id: "appt-complete",
          client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
          barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
          location_id: "67ad0d9b-4f60-44e6-a213-86f665324574",
          status: "completed",
          completed_at: "2026-05-20T12:00:00.000Z"
        }
      ]
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await submitPublicBarberReview({
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
      clientProfileId: "1fd26b88-3c68-465f-8a71-f09e614b1bd4",
      barberId: "barber-43b3cda2",
      barberAliases: ["43b3cda2-3fe0-4632-95bb-56c005b5a3cf"],
      rating: 5,
      message: "Great barber!"
    });

    expect(result.review.rating).toBe(5);
    expect(supabase.state.insertPayload).toMatchObject({
      appointment_id: "appt-complete",
      barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
      client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
      location_id: "67ad0d9b-4f60-44e6-a213-86f665324574",
      rating: 5,
      message: "Great barber!"
    });
    expect(Object.keys(supabase.state.insertPayload ?? {}).sort()).toEqual([
      "appointment_id",
      "barber_id",
      "client_id",
      "created_at",
      "location_id",
      "message",
      "rating"
    ]);
    expect(supabase.state.insertPayload).not.toHaveProperty("review_text");
    expect(supabase.state.insertPayload).not.toHaveProperty("comment");
  });

  it("allows a review when completed_at is populated even if status has drifted", async () => {
    const supabase = createReviewSupabaseMock({
      clientRow: {
        id: "client-id",
        reference_code: "client-ref",
        profile_id: "profile-id"
      },
      barberRow: {
        id: "barber-id",
        reference_code: "barber-ref",
        profile_id: "barber-profile"
      },
      appointmentRows: [
        {
          id: "appt-completed-at",
          client_id: "client-id",
          barber_id: "barber-id",
          location_id: "location-id",
          status: "confirmed",
          completed_at: "2026-05-20T12:00:00.000Z"
        }
      ]
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const result = await submitPublicBarberReview({
      clientId: "client-ref",
      clientProfileId: "profile-id",
      barberId: "barber-ref",
      rating: 4,
      message: "Clean work."
    });

    expect(result.review.rating).toBe(4);
    expect(supabase.state.insertPayload?.appointment_id).toBe("appt-completed-at");
  });

  it("blocks duplicate completed appointment reviews with a clean message", async () => {
    const supabase = createReviewSupabaseMock({
      clientRow: {
        id: "client-id",
        reference_code: "client-ref",
        profile_id: "profile-id"
      },
      barberRow: {
        id: "barber-id",
        reference_code: "barber-ref",
        profile_id: "barber-profile"
      },
      appointmentRows: [
        {
          id: "2090ae1e-3b7c-59d2-81ac-9f88908fd735",
          client_id: "client-id",
          barber_id: "barber-id",
          location_id: "location-id",
          status: "completed",
          completed_at: "2026-05-20T12:00:00.000Z"
        }
      ],
      existingReviewRows: [
        {
          id: "review-existing",
          appointment_id: "2090ae1e-3b7c-59d2-81ac-9f88908fd735",
          rating: 5,
          message: "Already posted.",
          created_at: "2026-05-20T12:00:00.000Z"
        }
      ]
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    await expect(submitPublicBarberReview({
      clientId: "client-ref",
      clientProfileId: "profile-id",
      barberId: "barber-ref",
      rating: 5,
      message: "Again."
    })).rejects.toMatchObject({
      code: "review_already_exists",
      message: "You already reviewed this appointment."
    });
  });

  it("blocks clients without a completed appointment", async () => {
    const supabase = createReviewSupabaseMock({
      clientRow: {
        id: "client-id",
        reference_code: "client-ref",
        profile_id: "profile-id"
      },
      barberRow: {
        id: "barber-id",
        reference_code: "barber-ref",
        profile_id: "barber-profile"
      },
      appointmentRows: [
        {
          id: "appt-confirmed",
          client_id: "client-id",
          barber_id: "barber-id",
          location_id: "location-id",
          status: "confirmed",
          completed_at: null
        }
      ]
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    await expect(submitPublicBarberReview({
      clientId: "client-ref",
      clientProfileId: "profile-id",
      barberId: "barber-ref",
      rating: 5,
      message: "Too soon."
    })).rejects.toMatchObject({
      code: "review_not_eligible",
      message: "Complete an appointment before leaving a review."
    });
  });
});
