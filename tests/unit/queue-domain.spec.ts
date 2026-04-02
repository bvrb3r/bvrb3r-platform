import { describe, expect, it } from "vitest";
import {
  assertQueueStatusTransition,
  normalizeQueueCreateInput,
  pickBestQueueBarber,
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
    expect(normalized.notes).toBe("first time walk-in");
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
});
