import { describe, expect, it } from "vitest";
import { createInitialLiveOperationsSnapshot } from "@/lib/operations/live-state";
import { createInitialEngagementState } from "@/lib/engagement/engine";
import {
  buildClientBarberRecommendations,
  buildClientHistoryIntelligence,
  buildClientIntelligenceSnapshot,
  buildLocationIntelligenceSnapshot
} from "@/lib/engagement/intelligence";

function cloneSnapshot() {
  return JSON.parse(JSON.stringify(createInitialLiveOperationsSnapshot())) as ReturnType<typeof createInitialLiveOperationsSnapshot>;
}

describe("phase 16 engagement intelligence", () => {
  it("prefers the client's strongest barber relationship in recommendations", () => {
    const state = createInitialEngagementState();
    const snapshot = createInitialLiveOperationsSnapshot();

    const recommendations = buildClientBarberRecommendations(state, snapshot, "client-jordan");

    expect(recommendations[0]?.barberId).toBe("barber-wave");
    expect(recommendations[0]?.reason).toMatch(/history|repeat|follow|favorite/i);
  });

  it("marks overdue clients as high churn risk when the cadence is badly missed", () => {
    const snapshot = cloneSnapshot();
    const template = snapshot.appointments[0];
    snapshot.appointments = [
      {
        ...template,
        id: "appt-overdue-1",
        clientId: "client-cam",
        barberId: "barber-wave",
        serviceId: "srv-signature",
        locationId: "loc-ybor",
        status: "completed",
        start: "2025-11-14T15:00:00.000Z",
        end: "2025-11-14T16:00:00.000Z",
        completedAt: "2025-11-14T16:00:00.000Z",
        totalAmount: 55,
        balanceDue: 0
      }
    ];
    const client = snapshot.clients.find((entry) => entry.id === "client-cam");

    expect(client).toBeTruthy();

    const intelligence = buildClientHistoryIntelligence({
      client: client!,
      appointments: snapshot.appointments
    });

    expect(intelligence.rebookingWindow).toBe("overdue");
    expect(intelligence.churnRisk).toBe("high");
    expect(intelligence.reengagementEligible).toBe(true);
  });

  it("builds client and location snapshots with rebooking opportunity counts", () => {
    const state = createInitialEngagementState();
    const snapshot = createInitialLiveOperationsSnapshot();

    const clientSnapshot = buildClientIntelligenceSnapshot(state, snapshot, "client-jordan");
    const locationSnapshot = buildLocationIntelligenceSnapshot(snapshot, "loc-ybor");

    expect(clientSnapshot).not.toBeNull();
    expect(clientSnapshot?.nextBestAction).toBeTruthy();
    expect(locationSnapshot.rebookingOpportunityCount).toBeGreaterThanOrEqual(0);
    expect(locationSnapshot.topReturningClients.length).toBeGreaterThan(0);
    expect(locationSnapshot.barberRetention.length).toBeGreaterThan(0);
  });
});
