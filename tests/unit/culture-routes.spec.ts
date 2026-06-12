import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  createCulturePostDraftMock,
  attachCulturePostImageMediaMock,
  createCulturePostFromProfileMediaMock,
  listCultureFeedMock,
  listMyCulturePostsMock,
  recordCultureFeedEventMock,
  recordCultureEngagementMock,
  submitCulturePostForReviewMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  createCulturePostDraftMock: vi.fn(),
  attachCulturePostImageMediaMock: vi.fn(),
  createCulturePostFromProfileMediaMock: vi.fn(),
  listCultureFeedMock: vi.fn(),
  listMyCulturePostsMock: vi.fn(),
  recordCultureFeedEventMock: vi.fn(),
  recordCultureEngagementMock: vi.fn(),
  submitCulturePostForReviewMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/culture/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/culture/service")>("@/lib/culture/service");

  return {
    ...actual,
    attachCulturePostImageMedia: attachCulturePostImageMediaMock,
    createCulturePostFromProfileMedia: createCulturePostFromProfileMediaMock,
    createCulturePostDraft: createCulturePostDraftMock,
    listCultureFeed: listCultureFeedMock,
    listMyCulturePosts: listMyCulturePostsMock,
    recordCultureFeedEvent: recordCultureFeedEventMock,
    recordCultureEngagement: recordCultureEngagementMock,
    submitCulturePostForReview: submitCulturePostForReviewMock
  };
});

import { GET as getCultureFeed } from "@/app/api/culture/feed/route";
import { POST as postCultureEvent } from "@/app/api/culture/events/route";
import { GET as getMyCulturePosts } from "@/app/api/culture/my-posts/route";
import { POST as createCulturePost } from "@/app/api/culture/posts/route";
import { POST as shareProfileMediaToCulture } from "@/app/api/culture/profile-media/route";
import { POST as attachCultureMedia } from "@/app/api/culture/posts/[postId]/media/route";
import { POST as submitCulturePost } from "@/app/api/culture/posts/[postId]/submit/route";
import { CultureComposerError } from "@/lib/culture/service";

type FormDataLike = {
  get(name: string): FormDataEntryValue | null;
};

function createFormDataRequest(formData: FormDataLike): Request {
  return {
    formData: async () => formData
  } as Request;
}

function createFormDataLike(entries: Record<string, FormDataEntryValue>): FormDataLike {
  return {
    get: (name: string) => entries[name] ?? null
  };
}

function createUploadFile(name: string, type: string, size: number): FormDataEntryValue {
  return {
    name,
    type,
    size,
    arrayBuffer: async () => new ArrayBuffer(size)
  } as unknown as FormDataEntryValue;
}

describe("Culture API routes", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    attachCulturePostImageMediaMock.mockReset();
    createCulturePostFromProfileMediaMock.mockReset();
    createCulturePostDraftMock.mockReset();
    listCultureFeedMock.mockReset();
    listMyCulturePostsMock.mockReset();
    recordCultureFeedEventMock.mockReset();
    recordCultureEngagementMock.mockReset();
    submitCulturePostForReviewMock.mockReset();

    createCulturePostDraftMock.mockResolvedValue({
      post: { id: "post-draft-1" },
      summary: { id: "post-draft-1", caption: "Draft", postType: "barber_cut" }
    });
    attachCulturePostImageMediaMock.mockResolvedValue({
      media: {
        id: "media-1",
        url: "https://signed.bvrb3r.test/media.jpg",
        thumbnailUrl: "https://signed.bvrb3r.test/media.jpg",
        mediaType: "image",
        width: null,
        height: null,
        durationSeconds: null
      }
    });
    createCulturePostFromProfileMediaMock.mockResolvedValue({
      post: { id: "post-profile-media-1" },
      summary: { id: "post-profile-media-1", caption: "Profile Studio media", postType: "barber_cut" },
      media: {
        id: "culture-media-1",
        url: "https://cdn.bvrb3r.test/profile-media.jpg",
        thumbnailUrl: "https://cdn.bvrb3r.test/profile-media.jpg",
        mediaType: "image",
        width: null,
        height: null,
        durationSeconds: null
      },
      message: "Culture draft created from Profile Studio media."
    });
    listCultureFeedMock.mockResolvedValue({ items: [], cursor: null, hasMore: false });
    listMyCulturePostsMock.mockResolvedValue({ drafts: [], pendingReview: [], published: [], archived: [] });
    recordCultureFeedEventMock.mockResolvedValue({ id: "event-1", event_type: "feed_loaded" });
    recordCultureEngagementMock.mockResolvedValue({ id: "engagement-1", engagement_type: "save" });
    submitCulturePostForReviewMock.mockResolvedValue({
      summary: { id: "post-draft-1", caption: "Draft", postType: "barber_cut" },
      message: "Post submitted for review."
    });
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

  it("returns a clear Culture feed API error without pretending the feed is empty", async () => {
    listCultureFeedMock.mockRejectedValueOnce(new Error("Unable to load Culture feed."));

    const response = await getCultureFeed(new NextRequest("https://bvrb3r.test/api/culture/feed?role=client"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      error: "Unable to load Culture feed."
    });
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

  it("creates a barber Culture draft through the service", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        role: "barber_user",
        email: "blaze@bvrb3r.demo",
        password: "",
        name: "Blaze",
        title: "Barber",
        locationIds: [],
        barberId: "barber-blaze"
      }
    });

    const response = await createCulturePost(new NextRequest("https://bvrb3r.test/api/culture/posts", {
      method: "POST",
      body: JSON.stringify({
        role: "barber",
        postType: "barber_cut",
        caption: "Fresh work."
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, postId: "post-draft-1" });
    expect(createCulturePostDraftMock).toHaveBeenCalledWith(expect.objectContaining({ role: "barber_user" }), expect.objectContaining({
      role: "barber",
      postType: "barber_cut",
      caption: "Fresh work."
    }));
  });

  it("rejects unauthenticated Culture draft creation", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: false,
      user: { id: "guest-user" }
    });

    const response = await createCulturePost(new NextRequest("https://bvrb3r.test/api/culture/posts", {
      method: "POST",
      body: JSON.stringify({ role: "barber", postType: "barber_cut" })
    }));

    expect(response.status).toBe(401);
    expect(createCulturePostDraftMock).not.toHaveBeenCalled();
  });

  it("submits a Culture draft for review through the service", async () => {
    const response = await submitCulturePost(new NextRequest("https://bvrb3r.test/api/culture/posts/post-draft-1/submit", {
      method: "POST",
      body: JSON.stringify({ role: "barber" })
    }), { params: Promise.resolve({ postId: "post-draft-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, message: "Post submitted for review." });
    expect(submitCulturePostForReviewMock).toHaveBeenCalledWith(expect.any(Object), {
      role: "barber",
      postId: "post-draft-1"
    });
  });

  it("lists current user's Culture posts through the service", async () => {
    const response = await getMyCulturePosts(new NextRequest("https://bvrb3r.test/api/culture/my-posts?role=owner"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, posts: { drafts: [] } });
    expect(listMyCulturePostsMock).toHaveBeenCalledWith(expect.any(Object), "owner");
  });

  it("attaches valid Culture image media through the service", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        role: "barber_user",
        email: "blaze@bvrb3r.demo",
        password: "",
        name: "Blaze",
        title: "Barber",
        locationIds: [],
        barberId: "barber-blaze"
      }
    });
    const formData = createFormDataLike({
      role: "barber",
      file: createUploadFile("work.jpg", "image/jpeg", 5)
    });

    const response = await attachCultureMedia(createFormDataRequest(formData), {
      params: Promise.resolve({ postId: "post-draft-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, media: { id: "media-1", mediaType: "image" } });
    expect(attachCulturePostImageMediaMock).toHaveBeenCalledWith(expect.objectContaining({ role: "barber_user" }), expect.objectContaining({
      role: "barber",
      postId: "post-draft-1",
      fileName: "work.jpg",
      contentType: "image/jpeg",
      size: 5
    }));
  });

  it("rejects unauthenticated Culture media upload", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: false,
      user: { id: "guest-user" }
    });
    const formData = createFormDataLike({
      role: "barber",
      file: createUploadFile("work.jpg", "image/jpeg", 5)
    });

    const response = await attachCultureMedia(createFormDataRequest(formData), {
      params: Promise.resolve({ postId: "post-draft-1" })
    });

    expect(response.status).toBe(401);
    expect(attachCulturePostImageMediaMock).not.toHaveBeenCalled();
  });

  it("rejects client-role Culture media upload requests", async () => {
    const formData = createFormDataLike({
      role: "client",
      file: createUploadFile("work.jpg", "image/jpeg", 5)
    });

    const response = await attachCultureMedia(createFormDataRequest(formData), {
      params: Promise.resolve({ postId: "post-draft-1" })
    });

    expect(response.status).toBe(400);
    expect(attachCulturePostImageMediaMock).not.toHaveBeenCalled();
  });

  it("rejects malformed Culture media payloads before calling the service", async () => {
    const formData = createFormDataLike({ role: "barber" });

    const response = await attachCultureMedia(createFormDataRequest(formData), {
      params: Promise.resolve({ postId: "post-draft-1" })
    });

    expect(response.status).toBe(400);
    expect(attachCulturePostImageMediaMock).not.toHaveBeenCalled();
  });

  it("shares owned Profile Studio media to a Culture draft through the service", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        role: "barber_user",
        email: "blaze@bvrb3r.demo",
        password: "",
        name: "Blaze",
        title: "Barber",
        locationIds: [],
        barberId: "barber-blaze"
      }
    });

    const response = await shareProfileMediaToCulture(new NextRequest("https://bvrb3r.test/api/culture/profile-media", {
      method: "POST",
      body: JSON.stringify({
        role: "barber",
        sourceType: "barber_portfolio",
        sourceId: "portfolio-1"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      postId: "post-profile-media-1",
      composerHref: "/dashboard/barber/culture/new?draft=post-profile-media-1"
    });
    expect(createCulturePostFromProfileMediaMock).toHaveBeenCalledWith(expect.objectContaining({ role: "barber_user" }), {
      role: "barber",
      sourceType: "barber_portfolio",
      sourceId: "portfolio-1"
    });
  });

  it("rejects client Profile Studio media sharing before service writes", async () => {
    createCulturePostFromProfileMediaMock.mockRejectedValueOnce(
      new CultureComposerError("Client Culture posting unlocks later.", 403)
    );

    const response = await shareProfileMediaToCulture(new NextRequest("https://bvrb3r.test/api/culture/profile-media", {
      method: "POST",
      body: JSON.stringify({
        role: "client",
        sourceType: "client_profile_post",
        sourceId: "client-media-1"
      })
    }));

    expect(response.status).toBe(403);
    expect(createCulturePostFromProfileMediaMock).toHaveBeenCalledWith(expect.objectContaining({ role: "client_user" }), {
      role: "client",
      sourceType: "client_profile_post",
      sourceId: "client-media-1"
    });
  });
});
