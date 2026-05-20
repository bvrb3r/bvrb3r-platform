import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ARCHITECT_USER } from "@/tests/unit/architect-debug-test-utils";

const {
  requireArchitectDebugAccessMock,
  getArchitectSupportInboxPayloadMock,
  getArchitectSupportThreadPayloadMock,
  sendArchitectSupportThreadReplyMock
} = vi.hoisted(() => ({
  requireArchitectDebugAccessMock: vi.fn(),
  getArchitectSupportInboxPayloadMock: vi.fn(),
  getArchitectSupportThreadPayloadMock: vi.fn(),
  sendArchitectSupportThreadReplyMock: vi.fn()
}));

vi.mock("@/lib/architect/debug/guards", () => ({
  requireArchitectDebugAccess: requireArchitectDebugAccessMock
}));

vi.mock("@/lib/messages/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/messages/service")>("@/lib/messages/service");
  return {
    ...actual,
    getArchitectSupportInboxPayload: getArchitectSupportInboxPayloadMock,
    getArchitectSupportThreadPayload: getArchitectSupportThreadPayloadMock,
    sendArchitectSupportThreadReply: sendArchitectSupportThreadReplyMock
  };
});

import { GET as getArchitectMessages } from "@/app/api/architect/messages/route";
import {
  GET as getArchitectMessageThread,
  POST as postArchitectMessageReply
} from "@/app/api/architect/messages/[threadId]/route";

describe("architect support messages routes", () => {
  beforeEach(() => {
    requireArchitectDebugAccessMock.mockReset();
    getArchitectSupportInboxPayloadMock.mockReset();
    getArchitectSupportThreadPayloadMock.mockReset();
    sendArchitectSupportThreadReplyMock.mockReset();
    requireArchitectDebugAccessMock.mockResolvedValue({
      ok: true,
      actor: ARCHITECT_USER
    });
  });

  it("lists support/report conversations for an architect", async () => {
    getArchitectSupportInboxPayloadMock.mockResolvedValue({
      available: true,
      viewer: {
        profileId: "profile-support",
        fullName: "BVRB3R Support",
        role: "platform_admin"
      },
      threads: [{
        id: "thread-support-1",
        threadType: "support",
        appointmentId: null,
        locationId: null,
        locationContext: null,
        createdAt: "2026-05-20T15:00:00.000Z",
        updatedAt: "2026-05-20T15:01:00.000Z",
        counterpart: {
          profileId: "profile-client",
          fullName: "Phillip mcgee",
          role: "client_user"
        },
        appointmentContext: null,
        lastMessage: {
          id: "message-report-1",
          body: "Report submitted for Phillip mcgee.",
          messageType: "system",
          createdAt: "2026-05-20T15:01:00.000Z",
          senderName: null
        },
        client: {
          profileId: "profile-client",
          fullName: "Phillip mcgee",
          role: "client_user"
        },
        reportContext: {
          present: true,
          preview: "Report submitted for Phillip mcgee."
        },
        status: "open"
      }]
    });

    const response = await getArchitectMessages();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].reportContext.present).toBe(true);
    expect(getArchitectSupportInboxPayloadMock).toHaveBeenCalledWith(ARCHITECT_USER);
  });

  it("allows an architect to reply to the support thread", async () => {
    sendArchitectSupportThreadReplyMock.mockResolvedValue({
      message: {
        id: "message-reply-1",
        body: "We received this and are reviewing it.",
        messageType: "text",
        createdAt: "2026-05-20T15:05:00.000Z",
        senderName: "BVRB3R Support",
        senderRole: "platform_admin",
        isOwn: true
      }
    });

    const response = await postArchitectMessageReply(new NextRequest("https://bvrb3r.test/api/architect/messages/thread-support-1", {
      method: "POST",
      body: JSON.stringify({ body: "We received this and are reviewing it." })
    }), {
      params: Promise.resolve({ threadId: "thread-support-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message.id).toBe("message-reply-1");
    expect(sendArchitectSupportThreadReplyMock).toHaveBeenCalledWith(ARCHITECT_USER, "thread-support-1", {
      body: "We received this and are reviewing it."
    });
  });

  it("blocks non-architect access through the architect guard", async () => {
    requireArchitectDebugAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Architect debug access is restricted to platform administrators." }, { status: 403 })
    });

    const response = await getArchitectMessageThread(new NextRequest("https://bvrb3r.test/api/architect/messages/thread-support-1"), {
      params: Promise.resolve({ threadId: "thread-support-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/restricted/i);
  });
});
