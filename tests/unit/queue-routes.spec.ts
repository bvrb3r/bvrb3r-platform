import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { QueueServiceError } from "@/lib/queue/service";

const {
  getSessionUserMock,
  getQueueWorkspacePayloadMock,
  createQueueEntryMock,
  callQueueEntryMock,
  assignQueueEntryMock,
  reassignQueueEntryMock,
  convertQueueEntryMock,
  cancelQueueEntryMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getQueueWorkspacePayloadMock: vi.fn(),
  createQueueEntryMock: vi.fn(),
  callQueueEntryMock: vi.fn(),
  assignQueueEntryMock: vi.fn(),
  reassignQueueEntryMock: vi.fn(),
  convertQueueEntryMock: vi.fn(),
  cancelQueueEntryMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/queue/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queue/service")>("@/lib/queue/service");
  return {
    ...actual,
    getQueueWorkspacePayload: getQueueWorkspacePayloadMock,
    createQueueEntry: createQueueEntryMock,
    callQueueEntry: callQueueEntryMock,
    assignQueueEntry: assignQueueEntryMock,
    reassignQueueEntry: reassignQueueEntryMock,
    convertQueueEntry: convertQueueEntryMock,
    cancelQueueEntry: cancelQueueEntryMock
  };
});

import { GET as getQueue, POST as postQueue } from "@/app/api/operations/queue/route";
import { POST as postCall } from "@/app/api/operations/queue/[id]/call/route";
import { POST as postAssign } from "@/app/api/operations/queue/[id]/assign/route";
import { POST as postReassign } from "@/app/api/operations/queue/[id]/reassign/route";
import { POST as postConvert } from "@/app/api/operations/queue/[id]/convert/route";
import { POST as postCancel } from "@/app/api/operations/queue/[id]/cancel/route";

describe("phase 11 queue routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getQueueWorkspacePayloadMock.mockReset();
    createQueueEntryMock.mockReset();
    callQueueEntryMock.mockReset();
    assignQueueEntryMock.mockReset();
    reassignQueueEntryMock.mockReset();
    convertQueueEntryMock.mockReset();
    cancelQueueEntryMock.mockReset();
  });

  it("returns the scoped queue workspace payload", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    getQueueWorkspacePayloadMock.mockResolvedValue({
      summary: { activeCount: 1, calledCount: 0, assignedCount: 1, averageWaitMinutes: 12 },
      shops: [{ id: "loc-ybor", label: "BVRB3R Ybor / Ybor City / Tampa" }],
      barbers: [],
      services: [],
      entries: [],
      recentResolvedEntries: []
    });

    const response = await getQueue();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.activeCount).toBe(1);
  });

  it("rejects invalid queue creation payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("frontdesk@bvrb3r.demo"));

    const response = await postQueue(new NextRequest("https://bvrb3r.demo/api/operations/queue", {
      method: "POST",
      body: JSON.stringify({ clientName: "J" })
    }));

    expect(response.status).toBe(400);
  });

  it("creates a queue entry with a stable response shape", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("frontdesk@bvrb3r.demo"));
    createQueueEntryMock.mockResolvedValue({
      entry: {
        id: "queue-1",
        clientId: "client-1",
        clientName: "Jordan Ellis",
        clientPhone: "8135550101",
        clientEmail: "jordan@bvrb3r.demo",
        shopId: "loc-ybor",
        shopLabel: "BVRB3R Ybor / Ybor City / Tampa",
        serviceId: "srv-signature",
        serviceName: "Signature Precision Cut",
        flexibilityMinutes: 0,
        queueSource: "walk_in",
        status: "active",
        statusLabel: "Waiting",
        createdAt: "2026-03-20T14:00:00.000Z",
        waitMinutes: 0
      }
    });

    const response = await postQueue(new NextRequest("https://bvrb3r.demo/api/operations/queue", {
      method: "POST",
      body: JSON.stringify({
        clientName: "Jordan Ellis",
        clientPhone: "8135550101",
        shopId: "loc-ybor",
        serviceId: "srv-signature"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.entry.status).toBe("active");
  });

  it("calls a queue entry", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("frontdesk@bvrb3r.demo"));
    callQueueEntryMock.mockResolvedValue({ entry: { id: "queue-1", status: "called" } });

    const response = await postCall(new NextRequest("https://bvrb3r.demo/api/operations/queue/queue-1/call", {
      method: "POST"
    }), { params: Promise.resolve({ id: "queue-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry.status).toBe("called");
  });

  it("assigns a queue entry to a barber", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    assignQueueEntryMock.mockResolvedValue({ entry: { id: "queue-1", status: "assigned", assignedBarberId: "barber-blaze" } });

    const response = await postAssign(new NextRequest("https://bvrb3r.demo/api/operations/queue/queue-1/assign", {
      method: "POST",
      body: JSON.stringify({ barberId: "barber-blaze" })
    }), { params: Promise.resolve({ id: "queue-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry.assignedBarberId).toBe("barber-blaze");
  });

  it("requires and records a cash walk-in reassignment reason", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    reassignQueueEntryMock.mockResolvedValue({
      entry: {
        id: "queue-1",
        status: "assigned",
        publicState: "reassigned",
        assignedBarberId: "barber-wave",
        statusReason: "Blaze chair went offline"
      }
    });

    const response = await postReassign(new NextRequest("https://bvrb3r.demo/api/operations/queue/queue-1/reassign", {
      method: "POST",
      body: JSON.stringify({
        barberId: "barber-wave",
        reason: "Blaze chair went offline"
      })
    }), { params: Promise.resolve({ id: "queue-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(reassignQueueEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryId: "queue-1",
        barberId: "barber-wave",
        reason: "Blaze chair went offline"
      })
    );
    expect(body.entry.publicState).toBe("reassigned");
  });

  it("rejects a reassignment without an audit reason", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));

    const response = await postReassign(new NextRequest("https://bvrb3r.demo/api/operations/queue/queue-1/reassign", {
      method: "POST",
      body: JSON.stringify({ barberId: "barber-wave", reason: "" })
    }), { params: Promise.resolve({ id: "queue-1" }) });

    expect(response.status).toBe(400);
    expect(reassignQueueEntryMock).not.toHaveBeenCalled();
  });

  it("converts a queue entry into an appointment", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("frontdesk@bvrb3r.demo"));
    convertQueueEntryMock.mockResolvedValue({
      entry: { id: "queue-1", status: "converted", convertedAppointmentId: "appt-queue-1" },
      appointment: { id: "appt-queue-1", status: "booked" }
    });

    const response = await postConvert(new NextRequest("https://bvrb3r.demo/api/operations/queue/queue-1/convert", {
      method: "POST",
      body: JSON.stringify({ barberId: "barber-blaze", serviceId: "srv-signature" })
    }), { params: Promise.resolve({ id: "queue-1" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.entry.status).toBe("converted");
    expect(body.appointment.id).toBe("appt-queue-1");
  });

  it("propagates queue-safe cancellation errors", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    cancelQueueEntryMock.mockRejectedValue(new QueueServiceError("Only owner, manager, or front desk can manage the walk-in queue.", 403));

    const response = await postCancel(new NextRequest("https://bvrb3r.demo/api/operations/queue/queue-1/cancel", {
      method: "POST",
      body: JSON.stringify({ reason: "Guest left the shop" })
    }), { params: Promise.resolve({ id: "queue-1" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/owner, manager, or front desk/i);
  });
});
