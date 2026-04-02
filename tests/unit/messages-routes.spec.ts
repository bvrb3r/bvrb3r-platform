import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { MessagingServiceError } from "@/lib/messages/service";

const {
  getSessionUserMock,
  getMessagingInboxPayloadMock,
  getMessagingThreadPayloadMock,
  createMessagingThreadMock,
  sendThreadMessageMock,
  sendMessagingBroadcastMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getMessagingInboxPayloadMock: vi.fn(),
  getMessagingThreadPayloadMock: vi.fn(),
  createMessagingThreadMock: vi.fn(),
  sendThreadMessageMock: vi.fn(),
  sendMessagingBroadcastMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/messages/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/messages/service")>("@/lib/messages/service");
  return {
    ...actual,
    getMessagingInboxPayload: getMessagingInboxPayloadMock,
    getMessagingThreadPayload: getMessagingThreadPayloadMock,
    createMessagingThread: createMessagingThreadMock,
    sendThreadMessage: sendThreadMessageMock,
    sendMessagingBroadcast: sendMessagingBroadcastMock
  };
});

import { GET as getThreads, POST as postThreads } from "@/app/api/messages/threads/route";
import { GET as getThread } from "@/app/api/messages/threads/[id]/route";
import { POST as postMessage } from "@/app/api/messages/threads/[id]/messages/route";
import { POST as postBroadcast } from "@/app/api/messages/broadcasts/route";

describe("phase 8 messaging routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getMessagingInboxPayloadMock.mockReset();
    getMessagingThreadPayloadMock.mockReset();
    createMessagingThreadMock.mockReset();
    sendThreadMessageMock.mockReset();
    sendMessagingBroadcastMock.mockReset();
  });

  it("returns the messaging inbox for an allowed client role", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    getMessagingInboxPayloadMock.mockResolvedValue({
      available: true,
      viewer: {
        profileId: "profile-client",
        fullName: "Jordan Ellis",
        role: "client"
      },
      threads: [],
      eligibleAppointments: [],
      eligibleContacts: [],
      broadcastTargets: []
    });

    const response = await getThreads();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewer.role).toBe("client");
    expect(Array.isArray(body.threads)).toBe(true);
  });

  it("returns the messaging inbox for a shop-facing role", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    getMessagingInboxPayloadMock.mockResolvedValue({
      available: true,
      viewer: {
        profileId: "profile-owner",
        fullName: "Brandon Rivers",
        role: "owner"
      },
      threads: [],
      eligibleAppointments: [],
      eligibleContacts: [],
      broadcastTargets: []
    });

    const response = await getThreads();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewer.role).toBe("owner");
  });

  it("rejects invalid thread creation payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/messages/threads", {
      method: "POST",
      body: JSON.stringify({ appointmentId: "" })
    });

    const response = await postThreads(request);

    expect(response.status).toBe(400);
  });

  it("creates a thread with a stable response shape", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    createMessagingThreadMock.mockResolvedValue({
      available: true,
      viewer: {
        profileId: "profile-client",
        fullName: "Jordan Ellis",
        role: "client"
      },
      thread: {
        id: "thread-1",
        threadType: "client_barber",
        appointmentId: "11111111-1111-1111-1111-111111111111",
        createdAt: "2026-03-20T12:00:00.000Z",
        updatedAt: "2026-03-20T12:00:00.000Z",
        counterpart: {
          profileId: "profile-barber",
          fullName: "Blaze King",
          role: "booth_rent_barber"
        },
        appointmentContext: null,
        lastMessage: null,
        participants: []
      },
      messages: []
    });
    const request = new NextRequest("https://bvrb3r.demo/api/messages/threads", {
      method: "POST",
      body: JSON.stringify({ appointmentId: "11111111-1111-1111-1111-111111111111" })
    });

    const response = await postThreads(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.thread.id).toBe("thread-1");
    expect(body.thread.threadType).toBe("client_barber");
  });

  it("creates a shop conversation thread from a location starter", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    createMessagingThreadMock.mockResolvedValue({
      available: true,
      viewer: {
        profileId: "profile-manager",
        fullName: "Mia Torres",
        role: "manager"
      },
      thread: {
        id: "thread-shop-1",
        threadType: "client_shop",
        appointmentId: null,
        locationId: "loc-ybor",
        locationContext: {
          locationId: "loc-ybor",
          locationLabel: "Centro Ybor Flagship | Ybor City"
        },
        createdAt: "2026-03-20T12:00:00.000Z",
        updatedAt: "2026-03-20T12:00:00.000Z",
        counterpart: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        appointmentContext: null,
        lastMessage: null,
        participants: []
      },
      messages: []
    });
    const request = new NextRequest("https://bvrb3r.demo/api/messages/threads", {
      method: "POST",
      body: JSON.stringify({ threadType: "client_shop", profileId: "profile-client", locationId: "loc-ybor" })
    });

    const response = await postThreads(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.thread.threadType).toBe("client_shop");
    expect(createMessagingThreadMock).toHaveBeenCalledWith(expect.anything(), {
      threadType: "client_shop",
      profileId: "profile-client",
      locationId: "loc-ybor"
    });
  });

  it("enforces participant access on thread detail reads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    getMessagingThreadPayloadMock.mockRejectedValue(new MessagingServiceError("Only thread participants can view this conversation.", 403));

    const response = await getThread(new NextRequest("https://bvrb3r.demo/api/messages/threads/thread-1"), {
      params: Promise.resolve({ id: "thread-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/participants/i);
  });

  it("rejects empty message bodies", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/messages/threads/thread-1/messages", {
      method: "POST",
      body: JSON.stringify({ body: "" })
    });

    const response = await postMessage(request, {
      params: Promise.resolve({ id: "thread-1" })
    });

    expect(response.status).toBe(400);
  });

  it("sends a message for a thread participant", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    sendThreadMessageMock.mockResolvedValue({
      message: {
        id: "msg-1",
        body: "I have chair three ready for you.",
        messageType: "text",
        createdAt: "2026-03-20T12:15:00.000Z",
        senderName: "Blaze King",
        senderRole: "booth_rent_barber",
        isOwn: true
      }
    });
    const request = new NextRequest("https://bvrb3r.demo/api/messages/threads/thread-1/messages", {
      method: "POST",
      body: JSON.stringify({ body: "I have chair three ready for you." })
    });

    const response = await postMessage(request, {
      params: Promise.resolve({ id: "thread-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message.body).toBe("I have chair three ready for you.");
    expect(body.message.messageType).toBe("text");
  });

  it("sends a shop broadcast through the canonical messaging route", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    sendMessagingBroadcastMock.mockResolvedValue({
      locationId: "loc-ybor",
      locationLabel: "Centro Ybor Flagship | Ybor City",
      audience: "all",
      deliveredCount: 3,
      threadIds: ["thread-1", "thread-2", "thread-3"]
    });
    const request = new NextRequest("https://bvrb3r.demo/api/messages/broadcasts", {
      method: "POST",
      body: JSON.stringify({ locationId: "loc-ybor", audience: "all", body: "Late afternoon demand is rising. Please tighten arrival windows." })
    });

    const response = await postBroadcast(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.broadcast.deliveredCount).toBe(3);
  });
});
