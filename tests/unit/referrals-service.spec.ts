import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordRequiredPlatformEventsMock } = vi.hoisted(() => ({
  recordRequiredPlatformEventsMock: vi.fn()
}));

vi.mock("@/lib/core/platform-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/core/platform-events")>("@/lib/core/platform-events");
  return {
    ...actual,
    recordRequiredPlatformEvents: recordRequiredPlatformEventsMock
  };
});

import {
  ReferralServiceError,
  createReferralInvite,
  finalizeReferralReward,
  readQualifyingReferralEvent,
  recordReferralBookingProgress,
  syncReferralAttribution
} from "@/lib/referrals/service";

type ReferralCodeRow = {
  id: string;
  client_reference: string;
  client_email: string;
  code: string;
  reward_points: number | string | null;
  active: boolean;
  created_at: string;
};

type ReferralEventRow = {
  id: string;
  referral_code_id: string;
  referrer_client_reference: string;
  referrer_client_email: string;
  referred_client_email: string;
  referred_client_reference: string | null;
  status: "invited" | "signed_up" | "booked" | "completed" | "credited";
  reward_points: number | string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  signed_up_at: string | null;
  booked_at: string | null;
  completed_at: string | null;
  appointment_reference: string | null;
  credited_at: string | null;
  credited_transaction_reference: string | null;
};

type ReferralState = {
  referral_codes: ReferralCodeRow[];
  referral_events: ReferralEventRow[];
};

function createReferralSupabase(initial?: Partial<ReferralState>) {
  const state: ReferralState = {
    referral_codes: [...(initial?.referral_codes ?? [])],
    referral_events: [...(initial?.referral_events ?? [])]
  };

  function tableRows(table: keyof ReferralState) {
    return state[table];
  }

  function applyFilters(
    rows: Array<Record<string, unknown>>,
    filters: Array<{ field: string; value: unknown }>
  ) {
    return rows.filter((row) => filters.every((filter) => row[filter.field] === filter.value));
  }

  function createSelectQuery(table: keyof ReferralState) {
    const filters: Array<{ field: string; value: unknown }> = [];
    const query = {
      eq(field: string, value: unknown) {
        filters.push({ field, value });
        return query;
      },
      maybeSingle: async () => ({
        data: applyFilters(tableRows(table) as unknown as Array<Record<string, unknown>>, filters)[0] ?? null,
        error: null
      }),
      order: async (field: string, options?: { ascending?: boolean }) => {
        const rows = [...applyFilters(tableRows(table) as unknown as Array<Record<string, unknown>>, filters)].sort((left, right) => {
          const leftValue = String(left[field] ?? "");
          const rightValue = String(right[field] ?? "");
          return options?.ascending === false
            ? rightValue.localeCompare(leftValue)
            : leftValue.localeCompare(rightValue);
        });
        return {
          data: rows,
          error: null
        };
      },
      single: async () => ({
        data: applyFilters(tableRows(table) as unknown as Array<Record<string, unknown>>, filters)[0] ?? null,
        error: null
      })
    };

    return query;
  }

  function insertRows(table: keyof ReferralState, value: Record<string, unknown> | Array<Record<string, unknown>>) {
    const rows = Array.isArray(value) ? value : [value];
    tableRows(table).push(...rows as never[]);
    return rows[0] ?? null;
  }

  const supabase = {
    from(table: string) {
      if (table === "referral_codes" || table === "referral_events") {
        const typedTable = table as keyof ReferralState;
        return {
          select: () => createSelectQuery(typedTable),
          insert: (value: Record<string, unknown> | Array<Record<string, unknown>>) => ({
            select: () => ({
              single: async () => ({
                data: insertRows(typedTable, value),
                error: null
              })
            })
          }),
          upsert: (value: Record<string, unknown> | Array<Record<string, unknown>>) => ({
            select: () => ({
              single: async () => {
                const row = Array.isArray(value) ? value[0] : value;
                const rows = tableRows(typedTable) as Array<Record<string, unknown>>;
                const existingIndex = rows.findIndex((candidate) => candidate.id === row.id);
                if (existingIndex >= 0) {
                  rows[existingIndex] = {
                    ...rows[existingIndex],
                    ...row
                  };
                } else {
                  rows.push(row);
                }

                return {
                  data: row,
                  error: null
                };
              }
            })
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (field: string, value: unknown) => ({
              select: () => ({
                single: async () => {
                  const rows = tableRows(typedTable) as Array<Record<string, unknown>>;
                  const index = rows.findIndex((candidate) => candidate[field] === value);
                  if (index < 0) {
                    return {
                      data: null,
                      error: { message: "not found" }
                    };
                  }

                  rows[index] = {
                    ...rows[index],
                    ...patch
                  };

                  return {
                    data: rows[index],
                    error: null
                  };
                }
              })
            })
          })
        };
      }

      if (table === "platform_events") {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          insert: vi.fn().mockResolvedValue({ error: null })
        };
      }

      throw new Error(`Unsupported table in referral test double: ${table}`);
    }
  };

  return {
    supabase: supabase as never,
    state
  };
}

describe("referral service", () => {
  beforeEach(() => {
    recordRequiredPlatformEventsMock.mockReset();
    recordRequiredPlatformEventsMock.mockResolvedValue(undefined);
  });

  it("qualifies and rewards a referral only after the canonical signup -> booking -> completion chain", async () => {
    const store = createReferralSupabase();

    const invite = await createReferralInvite({
      clientId: "client-referrer",
      clientEmail: "referrer@bvrb3r.app",
      referredClientEmail: "friend@bvrb3r.app"
    }, store.supabase);

    const signedUp = await syncReferralAttribution({
      referralCode: invite.referralCode.code,
      referredClientId: "client-friend",
      referredClientEmail: "friend@bvrb3r.app"
    }, store.supabase);

    expect(signedUp.referralEvent?.status).toBe("signed_up");
    expect(await readQualifyingReferralEvent({
      clientId: "client-friend",
      appointmentId: "appt-referral-1"
    }, store.supabase)).toBeNull();

    const booked = await recordReferralBookingProgress({
      clientId: "client-friend",
      appointmentId: "appt-referral-1"
    }, store.supabase);

    expect(booked.referralEvent?.status).toBe("booked");

    const qualifying = await readQualifyingReferralEvent({
      clientId: "client-friend",
      appointmentId: "appt-referral-1"
    }, store.supabase);

    expect(qualifying?.id).toBe(booked.referralEvent?.id);

    const finalized = await finalizeReferralReward({
      referralEventId: qualifying!.id,
      appointmentId: "appt-referral-1",
      creditedTransactionId: "pts-ledger-1",
      rewardPointsIssued: 45,
      occurredAt: "2026-04-22T10:00:00.000Z"
    }, store.supabase);

    expect(finalized.referralEvent.status).toBe("credited");
    expect(finalized.referralEvent.creditedTransactionId).toBe("pts-ledger-1");
    expect(recordRequiredPlatformEventsMock).toHaveBeenCalledTimes(1);
    expect(recordRequiredPlatformEventsMock).toHaveBeenCalledWith(store.supabase, expect.arrayContaining([
      expect.objectContaining({ eventType: "referral_qualified" }),
      expect.objectContaining({ eventType: "referral_rewarded" })
    ]));
  });

  it("blocks self-referral and duplicate reward finalization", async () => {
    const createdAt = "2026-04-21T08:00:00.000Z";
    const store = createReferralSupabase({
      referral_codes: [
        {
          id: "ref-code-1",
          client_reference: "client-referrer",
          client_email: "referrer@bvrb3r.app",
          code: "BVRREF01",
          reward_points: 10,
          active: true,
          created_at: createdAt
        }
      ],
      referral_events: [
        {
          id: "ref-event-1",
          referral_code_id: "ref-code-1",
          referrer_client_reference: "client-referrer",
          referrer_client_email: "referrer@bvrb3r.app",
          referred_client_email: "friend@bvrb3r.app",
          referred_client_reference: "client-friend",
          status: "booked",
          reward_points: 10,
          metadata: {},
          created_at: createdAt,
          signed_up_at: createdAt,
          booked_at: "2026-04-21T09:00:00.000Z",
          completed_at: null,
          appointment_reference: "appt-referral-2",
          credited_at: null,
          credited_transaction_reference: null
        }
      ]
    });

    const selfReferral = await syncReferralAttribution({
      referralCode: "BVRREF01",
      referredClientId: "client-referrer",
      referredClientEmail: "referrer@bvrb3r.app"
    }, store.supabase);

    expect(selfReferral.referralEvent).toBeNull();

    await finalizeReferralReward({
      referralEventId: "ref-event-1",
      appointmentId: "appt-referral-2",
      creditedTransactionId: "pts-ledger-2",
      rewardPointsIssued: 45,
      occurredAt: "2026-04-22T12:00:00.000Z"
    }, store.supabase);

    recordRequiredPlatformEventsMock.mockClear();

    const idempotent = await finalizeReferralReward({
      referralEventId: "ref-event-1",
      appointmentId: "appt-referral-2",
      creditedTransactionId: "pts-ledger-2",
      rewardPointsIssued: 45,
      occurredAt: "2026-04-22T12:00:00.000Z"
    }, store.supabase);

    expect(idempotent.referralEvent.status).toBe("credited");
    expect(recordRequiredPlatformEventsMock).not.toHaveBeenCalled();

    await expect(finalizeReferralReward({
      referralEventId: "ref-event-1",
      appointmentId: "appt-referral-2",
      creditedTransactionId: "pts-ledger-other",
      rewardPointsIssued: 45,
      occurredAt: "2026-04-22T12:00:00.000Z"
    }, store.supabase)).rejects.toBeInstanceOf(ReferralServiceError);
  });
});
