import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  listCultureFeedMock,
  recordCultureFeedEventMock,
  recordCultureEngagementMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  listCultureFeedMock: vi.fn(),
  recordCultureFeedEventMock: vi.fn(),
  recordCultureEngagementMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/culture/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/culture/service")>("@/lib/culture/service");

  return {
    ...actual,
    listCultureFeed: listCultureFeedMock,
    recordCultureFeedEvent: recordCultureFeedEventMock,
    recordCultureEngagement: recordCultureEngagementMock
  };
});

import { GET as getCultureFeed } from "@/app/api/culture/feed/route";
import { POST as postCultureEvent } from "@/app/api/culture/events/route";

describe("Culture API routes", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    listCultureFeedMock.mockReset();
    recordCultureFeedEventMock.mockReset();
    recordCultureEngagementMock.mockReset();

    listCultureFeedMock.mockResolvedValue({ items: [], cursor: null, hasMore: false });
    recordCultureFeedEventMock.mockResolvedValue({ id: "event-1", event_type: "feed_loaded" });
    recordCultureEngagementMock.mockResolvedValue({ id: "engagement-1", engagement_type: "save" });
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        role: "client_user",
        email: "client@bvrb3r.demo",
        password: "",
        name: "Client",
        title: "Client",
        locationIds: []
      }
    });
  });

  it("loads the role-scoped Culture feed through the service", async () => {
    const response = await getCultureFeed(new NextRequest("https://bvrb3r.test/api/culture/feed?role=barber&limit=8"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, items: [], hasMore: false });
    expect(listCultureFeedMock).toHaveBeenCalledWith({ role: "barber", cursor: null, limit: 8 });
  });

  it("records signed-in Culture feed events", async () => {
    const response = await postCultureEvent(new NextRequest("https://bvrb3r.test/api/culture/events", {
      method: "POST",
      body: JSON.stringify({
        action: "feed_event",
        eventType: "feed_loaded",
        surface: "culture_feed"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(recordCultureFeedEventMock).toHaveBeenCalledWith(expect.objectContaining({
      actorProfileId: "22222222-2222-4222-8222-222222222222",
      actorRole: "client_user",
      eventType: "feed_loaded"
    }));
  });

  it("records signed-in Culture engagements", async () => {
    const response = await postCultureEvent(new NextRequest("https://bvrb3r.test/api/culture/events", {
      method: "POST",
      body: JSON.stringify({
        action: "engagement",
        postId: "11111111-1111-4111-8111-111111111111",
        engagementType: "save"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(recordCultureEngagementMock).toHaveBeenCalledWith(expect.objectContaining({
      postId: "11111111-1111-4111-8111-111111111111",
      actorProfileId: "22222222-2222-4222-8222-222222222222",
      actorRole: "client_user",
      engagementType: "save"
    }));
  });

  it("rejects unauthenticated Culture event writes", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: false,
      user: { id: "guest-user" }
    });

    const response = await postCultureEvent(new NextRequest("https://bvrb3r.test/api/culture/events", {
      method: "POST",
      body: JSON.stringify({ action: "feed_event", eventType: "feed_loaded" })
    }));

    expect(response.status).toBe(401);
    expect(recordCultureFeedEventMock).not.toHaveBeenCalled();
  });
});
