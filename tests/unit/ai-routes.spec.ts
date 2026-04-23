import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  getClientAiSummaryMock,
  getSessionUserMock,
  getBarberAiSummaryMock,
  getCurrentUserFromServerMock,
  trackAiRecommendationMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  getClientAiSummaryMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getBarberAiSummaryMock: vi.fn(),
  getCurrentUserFromServerMock: vi.fn(),
  trackAiRecommendationMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/ai/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/service")>("@/lib/ai/service");
  return {
    ...actual,
    getClientAiSummary: getClientAiSummaryMock,
    getBarberAiSummary: getBarberAiSummaryMock,
    trackAiRecommendation: trackAiRecommendationMock
  };
});

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

import { GET as getBarberSummary } from "@/app/api/ai/barber/summary/route";
import { GET as getClientSummary } from "@/app/api/ai/client/summary/route";
import { POST as postTrackRecommendation } from "@/app/api/ai/recommendations/track/route";

describe("phase 8 ai routes", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    getClientAiSummaryMock.mockReset();
    getSessionUserMock.mockReset();
    getBarberAiSummaryMock.mockReset();
    getCurrentUserFromServerMock.mockReset();
    trackAiRecommendationMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        id: "user-client",
        role: "client"
      },
      clientId: "client-jordan",
      isSignedInClient: true
    });
    getClientAiSummaryMock.mockResolvedValue({
      generatedAt: "2026-04-22T16:00:00.000Z",
      rebookingReminder: null,
      availableNowSuggestions: [],
      nextLayer: {
        personalization: { status: "scaffolded", signalKeys: [], notes: [] },
        pricingSuggestions: { status: "scaffolded", signalKeys: [], notes: [] },
        churnPrediction: { status: "scaffolded", signalKeys: [], notes: [] }
      }
    });
    getSessionUserMock.mockResolvedValue({
      id: "user-barber",
      role: "commission_barber",
      barberId: "barber-wave"
    });
    getBarberAiSummaryMock.mockResolvedValue({
      generatedAt: "2026-04-22T16:00:00.000Z",
      gapAlerts: [],
      nextLayer: {
        personalization: { status: "scaffolded", signalKeys: [], notes: [] },
        pricingSuggestions: { status: "scaffolded", signalKeys: [], notes: [] },
        churnPrediction: { status: "scaffolded", signalKeys: [], notes: [] }
      }
    });
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: "user-client",
        role: "client"
      }
    });
    trackAiRecommendationMock.mockResolvedValue({ ok: true });
  });

  it("returns the canonical client ai summary", async () => {
    const response = await getClientSummary();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generatedAt).toBe("2026-04-22T16:00:00.000Z");
    expect(getClientAiSummaryMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      actorId: "user-client",
      actorRole: "client"
    });
  });

  it("blocks barber ai summary for non-barber roles", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-client",
      role: "client",
      barberId: null
    });

    const response = await getBarberSummary();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/only barbers can read barber ai summary/i);
  });

  it("tracks a valid recommendation action for authenticated users", async () => {
    const response = await postTrackRecommendation(
      new NextRequest("https://bvrb3r.app/api/ai/recommendations/track", {
        method: "POST",
        body: JSON.stringify({
          recommendationId: "rebooking:client-jordan:appt-last:28",
          recommendationType: "rebooking_reminder",
          action: "clicked",
          surface: "client_home",
          relatedIds: {
            barberId: "barber-wave"
          }
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(trackAiRecommendationMock).toHaveBeenCalledWith({
      recommendationId: "rebooking:client-jordan:appt-last:28",
      recommendationType: "rebooking_reminder",
      action: "clicked",
      surface: "client_home",
      relatedIds: {
        barberId: "barber-wave"
      },
      actorId: "user-client",
      actorRole: "client"
    });
  });

  it("rejects invalid tracking payloads", async () => {
    const response = await postTrackRecommendation(
      new NextRequest("https://bvrb3r.app/api/ai/recommendations/track", {
        method: "POST",
        body: JSON.stringify({
          recommendationId: "",
          recommendationType: "rebooking_reminder",
          action: "shown",
          surface: "client_home"
        })
      })
    );

    expect(response.status).toBe(400);
  });

  it("requires authentication for tracking", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: false,
      user: {
        id: "guest-user",
        role: "client"
      }
    });

    const response = await postTrackRecommendation(
      new NextRequest("https://bvrb3r.app/api/ai/recommendations/track", {
        method: "POST",
        body: JSON.stringify({
          recommendationId: "gap-alert:barber-wave:start:end",
          recommendationType: "barber_gap_alert",
          action: "clicked",
          surface: "barber_dashboard"
        })
      })
    );

    expect(response.status).toBe(401);
  });
});
