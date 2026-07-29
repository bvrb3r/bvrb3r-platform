import { describe, expect, it } from "vitest";
import {
  assertQueueStatusTransition,
  getQueueSyncHealth,
  normalizeQueueCreateInput,
  pickBestQueueBarber,
  projectCanonicalQueueTruth,
  sortQueueEntries
} from "@/lib/queue/domain";

describe("phase 11 queue domain", () => {
  it("normalizes a valid queue intake payload", () => {
    const normalized = normalizeQueueCreateInput({
      clientName: "  Jordan Ellis  ",
      clientPhone: "(813) 555-0101",
      clientEmail: " JORDAN@BVRB3R.DEMO ",
      shopId: "loc-ybor",
      flexibilityMinutes: 12.9,
      notes: "  first time walk-in  "
    });

    expect(normalized.clientName).toBe("Jordan Ellis");
    expect(normalized.clientPhone).toBe("8135550101");
    expect(normalized.clientEmail).toBe("jordan@bvrb3r.demo");
    expect(normalized.flexibilityMinutes).toBe(13);
    expect(normalized.queueSource).toBe("walk_in");
    expect(normalized.entryType).toBe("walkin");
    expect(normalized.sourceProvider).toBe("bvrb3r");
    expect(normalized.paymentOwner).toBe("bvrb3r_cash");
    expect(normalized.notes).toBe("first time walk-in");
  });

  it("preserves external appointment and payment ownership truth", () => {
    const normalized = normalizeQueueCreateInput({
      clientName: "Jordan Ellis",
      clientPhone: "8135550101",
      shopId: "loc-ybor",
      chairsyncAppointmentId: "11111111-1111-4111-8111-111111111111",
      sourceProvider: "booksy",
      sourceServiceName: "Executive Fade",
      idempotencyKey: "booksy-checkin-jordan"
    });

    expect(normalized.entryType).toBe("booked");
    expect(normalized.sourceProvider).toBe("booksy");
    expect(normalized.paymentOwner).toBe("external:booksy");
    expect(normalized.sourceServiceName).toBe("Executive Fade");
    expect(normalized.idempotencyKey).toBe("booksy-checkin-jordan");
  });

  it("rejects invalid queue intake payloads", () => {
    expect(() =>
      normalizeQueueCreateInput({
        clientName: "J",
        clientPhone: "555",
        shopId: "loc-ybor"
      })
    ).toThrow(/client name/i);
  });

  it("allows valid queue status transitions", () => {
    expect(() => assertQueueStatusTransition("active", "called")).not.toThrow();
    expect(() => assertQueueStatusTransition("called", "assigned")).not.toThrow();
    expect(() => assertQueueStatusTransition("assigned", "converted")).not.toThrow();
  });

  it("rejects invalid queue status transitions", () => {
    expect(() => assertQueueStatusTransition("converted", "active")).toThrow(/cannot move/i);
    expect(() => assertQueueStatusTransition("active", "converted")).toThrow(/cannot move/i);
  });

  it("picks the best eligible barber using preference and live status", () => {
    const candidate = pickBestQueueBarber([
      {
        barberId: "barber-wave",
        barberName: "Wave Carter",
        liveStatus: "busy",
        isOnline: true,
        acceptsWalkIns: true,
        nextAvailableAt: "2026-03-20T15:00:00.000Z",
        supportsRequestedService: true,
        preferredMatch: false
      },
      {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        liveStatus: "available",
        isOnline: true,
        acceptsWalkIns: true,
        nextAvailableAt: "2026-03-20T14:30:00.000Z",
        supportsRequestedService: true,
        preferredMatch: true
      }
    ]);

    expect(candidate?.barberId).toBe("barber-blaze");
  });

  it("returns no assignment candidate when nobody is eligible", () => {
    const candidate = pickBestQueueBarber([
      {
        barberId: "barber-offline",
        barberName: "Offline Barber",
        liveStatus: "offline",
        isOnline: false,
        acceptsWalkIns: false,
        nextAvailableAt: null,
        supportsRequestedService: true,
        preferredMatch: true
      }
    ]);

    expect(candidate).toBeNull();
  });

  it("keeps queue ordering deterministic by created time then id", () => {
    const sorted = sortQueueEntries([
      { id: "b", createdAt: "2026-03-20T14:00:00.000Z" },
      { id: "a", createdAt: "2026-03-20T14:00:00.000Z" },
      { id: "c", createdAt: "2026-03-20T13:45:00.000Z" }
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });

  it("projects one canonical service-duration wait across active chairs", () => {
    const projection = projectCanonicalQueueTruth([
      {
        id: "queue-b",
        createdAt: "2026-07-28T12:01:00.000Z",
        serviceDurationMinutes: 45,
        serviceBufferMinutes: 5
      },
      {
        id: "queue-a",
        createdAt: "2026-07-28T12:00:00.000Z",
        serviceDurationMinutes: 30,
        serviceBufferMinutes: 10
      },
      {
        id: "queue-c",
        createdAt: "2026-07-28T12:02:00.000Z",
        serviceDurationMinutes: null
      }
    ], 2);

    expect(projection).toEqual([
      expect.objectContaining({ id: "queue-a", position: 1, estimatedWaitMinutes: 0 }),
      expect.objectContaining({ id: "queue-b", position: 2, estimatedWaitMinutes: 20 }),
      expect.objectContaining({ id: "queue-c", position: 3, estimatedWaitMinutes: 45 })
    ]);
  });

  it("marks the server projection stale when realtime has not refreshed it", () => {
    const now = new Date("2026-07-28T12:01:00.000Z");
    expect(getQueueSyncHealth("2026-07-28T12:00:30.000Z", now)).toMatchObject({
      ageSeconds: 30,
      stale: false
    });
    expect(getQueueSyncHealth("2026-07-28T12:00:00.000Z", now)).toMatchObject({
      ageSeconds: 60,
      stale: true
    });
  });
});
