import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  isSupabaseEnabledMock,
  createSupabaseAdminClientMock,
  getClientHomePayloadMock,
  getClientBookingsPayloadMock,
  queryPlatformEventsByEntityMock,
  recordPlatformEventMock
} = vi.hoisted(() => ({
  isSupabaseEnabledMock: vi.fn(() => true),
  createSupabaseAdminClientMock: vi.fn(),
  getClientHomePayloadMock: vi.fn(),
  getClientBookingsPayloadMock: vi.fn(),
  queryPlatformEventsByEntityMock: vi.fn(),
  recordPlatformEventMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: isSupabaseEnabledMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  getClientHomePayload: getClientHomePayloadMock,
  getClientBookingsPayload: getClientBookingsPayloadMock
}));

vi.mock("@/lib/core/platform-events", () => ({
  buildPlatformEventIdempotencyKey: (parts: Array<string | number | null | undefined>) =>
    parts.filter((part) => part !== null && part !== undefined).join(":"),
  queryPlatformEventsByEntity: queryPlatformEventsByEntityMock,
  recordPlatformEvent: recordPlatformEventMock
}));

import {
  buildAvailableNowSuggestions,
  buildBarberGapAlerts,
  buildRebookingReminder,
  getClientAiSummary
} from "@/lib/ai/service";

type RebookingInput = Parameters<typeof buildRebookingReminder>[0];
type HomePayload = Parameters<typeof buildAvailableNowSuggestions>[0]["home"];
type GapInput = Parameters<typeof buildBarberGapAlerts>[0];

describe("phase 8 ai service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T16:00:00.000Z"));

    isSupabaseEnabledMock.mockReset();
    isSupabaseEnabledMock.mockReturnValue(true);
    createSupabaseAdminClientMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue({} as never);
    getClientHomePayloadMock.mockReset();
    getClientBookingsPayloadMock.mockReset();
    queryPlatformEventsByEntityMock.mockReset();
    queryPlatformEventsByEntityMock.mockResolvedValue({ data: [], error: null });
    recordPlatformEventMock.mockReset();
    recordPlatformEventMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives a due-for-rebook reminder from canonical cadence history", () => {
    const reminder = buildRebookingReminder({
      clientId: "client-jordan",
      nextAppointment: null,
      routine: ({
        cadenceId: "routine-monthly",
        label: "Monthly maintenance",
        averageCycleDays: 28,
        confidence: "strong",
        barberReference: "barber-wave",
        serviceReference: "srv-signature",
        lastCompletedAt: "2026-03-25T14:00:00.000Z",
        nextSuggestedAt: "2026-04-22T14:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      } as unknown as RebookingInput["routine"]),
      history: [
        {
          id: "appt-last",
          barberId: "barber-wave",
          serviceId: "srv-signature",
          locationId: "loc-ybor",
          status: "completed",
          start: "2026-03-25T14:00:00.000Z",
          view: {
            barber: { name: "Wave Carter" },
            service: { name: "Signature Precision Cut" }
          },
          serviceSnapshot: {
            service_name: "Signature Precision Cut"
          }
        }
      ] as RebookingInput["history"]
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.reason).toBe("Last cut was 28 days ago. Your typical cadence is about 28 days.");
    expect(reminder?.explanation).toMatch(/completed visit history/i);
  });

  it("does not create a rebooking reminder when history is too thin", () => {
    const reminder = buildRebookingReminder({
      clientId: "client-jordan",
      nextAppointment: null,
      routine: null,
      history: [
        {
          id: "appt-last",
          barberId: "barber-wave",
          serviceId: "srv-signature",
          locationId: "loc-ybor",
          status: "completed",
          start: "2026-04-10T14:00:00.000Z",
          view: {
            barber: { name: "Wave Carter" },
            service: { name: "Signature Precision Cut" }
          }
        },
        {
          id: "appt-older",
          barberId: "barber-wave",
          serviceId: "srv-signature",
          locationId: "loc-ybor",
          status: "completed",
          start: "2026-03-20T14:00:00.000Z",
          view: {
            barber: { name: "Wave Carter" },
            service: { name: "Signature Precision Cut" }
          }
        }
      ] as RebookingInput["history"]
    });

    expect(reminder).toBeNull();
  });

  it("builds available-now suggestions only from eligible canonical supply", () => {
    const suggestions = buildAvailableNowSuggestions({
      home: ({
        client: null,
        shops: [],
        locationId: "loc-ybor",
        hasResolvedLocation: true,
        favoriteBarber: null,
        trustedBarbers: [
          {
            barberId: "barber-wave",
            username: "wave",
            barberName: "Wave Carter",
            rating: 4.9,
            reviewCount: 120,
            priceRange: [55, 70],
            nextAvailableAt: "2026-04-22T18:00:00.000Z",
            distanceMiles: 1.2,
            shopName: "Centro Ybor Flagship",
            specialties: ["Precision fades"],
            badges: ["verified_identity"]
          }
        ],
        recommendedBarbers: [],
        recommendedShops: [],
        defaultPaymentMethod: null,
        nextAvailableChair: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          matchedFrom: "available_now",
          matchReason: "Fastest trusted chair near you.",
          appointmentTime: "2026-04-22T18:00:00.000Z",
          locationId: "loc-ybor",
          shopName: "Centro Ybor Flagship",
          priceFrom: 55,
          rating: 4.9
        }
      } as unknown as HomePayload)
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.reason).toMatch(/next real opening/i);
    expect(suggestions[0]?.specialties).toEqual(["Precision fades"]);
    expect(suggestions[0]?.explanation).toBe("Fastest trusted chair near you.");
  });

  it("does not suggest available-now supply that is not in the canonical trusted set", () => {
    const suggestions = buildAvailableNowSuggestions({
      home: {
        client: null,
        shops: [],
        locationId: "loc-ybor",
        hasResolvedLocation: true,
        favoriteBarber: null,
        trustedBarbers: [],
        recommendedBarbers: [],
        recommendedShops: [],
        defaultPaymentMethod: null,
        nextAvailableChair: {
          barberId: "barber-hidden",
          username: "hidden",
          barberName: "Hidden Barber",
          matchedFrom: "available_now",
          matchReason: "This should not surface.",
          appointmentTime: "2026-04-22T18:00:00.000Z",
          locationId: "loc-ybor",
          shopName: "Hidden Shop",
          priceFrom: 40,
          rating: 4.2
        }
      } as HomePayload
    });

    expect(suggestions).toEqual([]);
  });

  it("derives barber gap alerts from canonical schedule truth and ignores meaningless gaps", () => {
    const alerts = buildBarberGapAlerts({
      barberId: "barber-blaze",
      businessDate: "2026-04-23",
      currentShopId: "loc-ybor",
      currentShopLabel: "BVRB3R Ybor",
      workingHours: [
        { locationId: "loc-ybor", locationLabel: "BVRB3R Ybor", weekday: 4, startTime: "09:00", endTime: "17:00" }
      ] as GapInput["workingHours"],
      blockedTimes: [
        { id: "block-1", startsAt: "2026-04-23T12:45:00.000Z", endsAt: "2026-04-23T13:00:00.000Z", reason: "Reset" }
      ] as GapInput["blockedTimes"],
      appointments: [
        {
          id: "appt-1",
          clientId: "client-1",
          barberId: "barber-blaze",
          serviceId: "srv-fade",
          locationId: "loc-ybor",
          status: "completed",
          start: "2026-04-23T09:30:00.000Z",
          end: "2026-04-23T10:15:00.000Z"
        },
        {
          id: "appt-2",
          clientId: "client-2",
          barberId: "barber-blaze",
          serviceId: "srv-fade",
          locationId: "loc-ybor",
          status: "confirmed",
          start: "2026-04-23T10:30:00.000Z",
          end: "2026-04-23T11:00:00.000Z"
        },
        {
          id: "appt-3",
          clientId: "client-3",
          barberId: "barber-blaze",
          serviceId: "srv-beard",
          locationId: "loc-ybor",
          status: "confirmed",
          start: "2026-04-23T13:10:00.000Z",
          end: "2026-04-23T13:25:00.000Z"
        }
      ] as GapInput["appointments"],
      services: [
        { id: "srv-fade", name: "Premium Fade", durationMin: 45, displayOrder: 1 },
        { id: "srv-beard", name: "Beard Sculpt", durationMin: 30, displayOrder: 2 }
      ]
    });

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.reason).toMatch(/Premium Fade|Beard Sculpt/);
    expect(alerts.every((alert) => alert.durationMinutes >= 30)).toBe(true);
    expect(alerts[0]?.explanation).toMatch(/Live schedule, blocked time, and working hours/i);
  });

  it("returns an honest empty summary when canonical ai data is unavailable", async () => {
    isSupabaseEnabledMock.mockReturnValue(false);

    const summary = await getClientAiSummary({
      clientId: "client-jordan",
      actorId: "user-client",
      actorRole: "client"
    });

    expect(summary.rebookingReminder).toBeNull();
    expect(summary.availableNowSuggestions).toEqual([]);
    expect(getClientHomePayloadMock).not.toHaveBeenCalled();
    expect(getClientBookingsPayloadMock).not.toHaveBeenCalled();
  });

  it("records shown events for live recommendations without inventing synthetic history", async () => {
    getClientHomePayloadMock.mockResolvedValue(({
      client: null,
      shops: [],
      locationId: "loc-ybor",
      hasResolvedLocation: true,
      favoriteBarber: {
        barberId: "barber-wave",
        username: "wave",
        barberName: "Wave Carter",
        rating: 4.9,
        reviewCount: 120,
        priceRange: [55, 70],
        nextAvailableAt: "2026-04-22T18:00:00.000Z",
        distanceMiles: 1.2,
        shopName: "Centro Ybor Flagship",
        specialties: ["Precision fades"],
        badges: ["verified_identity"]
      },
      trustedBarbers: [],
      recommendedBarbers: [],
      recommendedShops: [],
      defaultPaymentMethod: null,
      nextAvailableChair: {
        barberId: "barber-wave",
        username: "wave",
        barberName: "Wave Carter",
        matchedFrom: "available_now",
        matchReason: "Fastest trusted chair near you.",
        appointmentTime: "2026-04-22T18:00:00.000Z",
        locationId: "loc-ybor",
        shopName: "Centro Ybor Flagship",
        priceFrom: 55,
        rating: 4.9
      }
    } as unknown as HomePayload));
    getClientBookingsPayloadMock.mockResolvedValue({
      nextAppointment: null,
      history: [
        {
          id: "appt-last",
          barberId: "barber-wave",
          serviceId: "srv-signature",
          locationId: "loc-ybor",
          status: "completed",
          start: "2026-03-25T14:00:00.000Z",
          view: {
            barber: { name: "Wave Carter" },
            service: { name: "Signature Precision Cut" }
          }
        }
      ],
      routine: {
        cadenceId: "routine-monthly",
        label: "Monthly maintenance",
        averageCycleDays: 28,
        confidence: "strong",
        barberReference: "barber-wave",
        serviceReference: "srv-signature",
        lastCompletedAt: "2026-03-25T14:00:00.000Z",
        nextSuggestedAt: "2026-04-22T14:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      }
    });

    const summary = await getClientAiSummary({
      clientId: "client-jordan",
      actorId: "user-client",
      actorRole: "client"
    });

    expect(summary.rebookingReminder).not.toBeNull();
    expect(summary.availableNowSuggestions).toHaveLength(1);
    expect(recordPlatformEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "ai_recommendation_shown",
        entityType: "ai_recommendation"
      })
    );
  });
});
