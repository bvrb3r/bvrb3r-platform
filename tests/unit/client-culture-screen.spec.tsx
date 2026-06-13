import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CultureFeedItem, CultureFeedModule } from "@/lib/culture/service";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";

function culturePost(id: string, overrides: Partial<CultureFeedItem> = {}): CultureFeedItem {
  return {
    id,
    authorProfileId: "22222222-2222-4222-8222-222222222222",
    authorTargetKind: "barber",
    authorTarget: "blaze",
    barberId: "33333333-3333-4333-8333-333333333333",
    shopId: "shop-ybor",
    serviceId: "44444444-4444-4444-8444-444444444444",
    authorDisplayName: "Blaze King",
    authorUsername: "@blaze",
    authorAvatarUrl: "https://cdn.bvrb3r.test/blaze.jpg",
    authorRoleLabel: "Barber",
    authorVerified: false,
    caption: `Culture caption ${id}`,
    postType: "barber_cut",
    media: {
      id: `${id}-media`,
      url: `https://cdn.bvrb3r.test/${id}.jpg`,
      thumbnailUrl: `https://cdn.bvrb3r.test/${id}-thumb.jpg`,
      mediaType: "image",
      width: 1200,
      height: 1500,
      durationSeconds: null
    },
    createdAt: "2026-06-12T12:00:00.000Z",
    serviceName: "Signature Cut",
    shopName: "BVRB3R Ybor",
    shopUsername: "bvrb3r-ybor",
    profileUrl: `/barber/blaze?source=culture&culturePostId=${id}&cta=view_profile`,
    bookingUrl: `/booking/new?source=culture&culturePostId=${id}&barberId=33333333-3333-4333-8333-333333333333&serviceId=44444444-4444-4444-8444-444444444444&cta=book_service`,
    shopUrl: null,
    canViewProfile: true,
    canViewShop: false,
    bookLabel: "Book Signature Cut",
    bookingDisabledReason: null,
    canLike: true,
    canSave: true,
    canShare: true,
    canReport: true,
    canBook: true,
    canComment: false,
    isPromoted: false,
    promotionLabel: null,
    reasonCodes: ["barber_work", "bookable_barber", "recent_public_post"],
    reasonLabel: "Barber work",
    ...overrides
  };
}

function discoveryModule(): CultureFeedModule {
  return {
    id: "barber-work",
    type: "discovery_grid",
    moduleTitle: "Barber Work",
    moduleSubtitle: "Approved barber work from the BVRB3R community.",
    reason: "Barber work",
    reasonCodes: ["barber_work"],
    items: [{
      id: "barber-work-post-1",
      postId: "post-1",
      title: "Blaze King",
      subtitle: "Signature Cut",
      imageUrl: "https://cdn.bvrb3r.test/post-thumb.jpg",
      route: "/booking/new?source=culture&culturePostId=post-1&cta=book_service",
      ctaLabel: "Book Signature Cut",
      itemType: "barber_work",
      reasonCodes: ["barber_work", "bookable_barber"]
    }]
  };
}

function feedDomEntries(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid="culture-post-card"],[data-testid="culture-discovery-grid"]'));
}

function mockEmptyFeedFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      items: [],
      cursor: null,
      hasMore: false
    })
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("client culture screen", () => {
  beforeEach(() => {
    mockEmptyFeedFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders only the minimal social pulse header above the feed", () => {
    render(<ClientCultureScreen feed={{ items: [culturePost("post-1")], cursor: null, hasMore: false }} />);

    expect(screen.getByText("Feed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Culture pulse" })).toBeInTheDocument();
    expect(screen.getByText("Live feed")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Culture" })).not.toBeInTheDocument();
    expect(screen.queryByText("Client Culture")).not.toBeInTheDocument();
    expect(screen.queryByText("Barber Culture")).not.toBeInTheDocument();
    expect(screen.queryByText("Shop Owner Culture")).not.toBeInTheDocument();
    expect(screen.queryByText("Cuts, shops, style, and community.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "For You" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Near You" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Available Today" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Discover barbers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View shops/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Saved culture")).not.toBeInTheDocument();
    expect(screen.queryByText("Share your next cut")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh/i })).not.toBeInTheDocument();
  });

  it("renders a safe empty feed state distinct from a feed error", () => {
    const { rerender } = render(<ClientCultureScreen feed={{ items: [], cursor: null, hasMore: false }} />);

    expect(screen.getByText("Culture posts will appear here as the BVRB3R community grows.")).toBeInTheDocument();
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.queryByTestId("culture-post-card")).not.toBeInTheDocument();

    rerender(<ClientCultureScreen feed={{
      items: [],
      cursor: null,
      hasMore: false,
      error: "Unable to load Culture feed. Try again."
    }} />);

    expect(screen.getByText("Unable to load Culture feed. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Feed error")).toBeInTheDocument();
    expect(screen.queryByText("Culture posts will appear here as the BVRB3R community grows.")).not.toBeInTheDocument();
  });

  it("auto-loads the latest feed on mount without a manual refresh button", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        items: [culturePost("post-loaded", { caption: "Loaded automatically" })],
        cursor: null,
        hasMore: false,
        feedSessionId: "11111111-1111-4111-8111-111111111111"
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{ items: [], cursor: null, hasMore: false, feedSessionId: "11111111-1111-4111-8111-111111111111" }} />);

    expect(await screen.findByText("Loaded automatically")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/culture/feed?role=client"));
  });

  it("checks for updates when the page regains focus and inserts naturally near the top", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, items: [culturePost("post-1")], cursor: null, hasMore: false })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, items: [culturePost("post-new", { caption: "New focused post" }), culturePost("post-1")], cursor: null, hasMore: false })
      });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });

    render(<ClientCultureScreen feed={{ items: [culturePost("post-1")], cursor: null, hasMore: false }} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(await screen.findByText("New focused post")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Culture posts" })).not.toBeInTheDocument();
  });

  it("queues new posts while deep in the feed without resetting scroll", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, items: [culturePost("post-1")], cursor: null, hasMore: false })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, items: [culturePost("post-new", { caption: "Queued Culture post" }), culturePost("post-1")], cursor: null, hasMore: false })
      });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "scrollY", { value: 900, configurable: true });

    render(<ClientCultureScreen feed={{ items: [culturePost("post-1")], cursor: null, hasMore: false }} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(await screen.findByRole("button", { name: "New Culture posts" })).toBeInTheDocument();
    expect(screen.queryByText("Queued Culture post")).not.toBeInTheDocument();
    expect(window.scrollY).toBe(900);

    fireEvent.click(screen.getByRole("button", { name: "New Culture posts" }));
    expect(screen.getByText("Queued Culture post")).toBeInTheDocument();
  });

  it("keeps full posts first and discovery modules lower in the feed only", () => {
    const gridModule = discoveryModule();
    const fourPosts = ["post-1", "post-2", "post-3", "post-4"].map((id) => culturePost(id));
    const fivePosts = [...fourPosts, culturePost("post-5")];
    const firstRender = render(<ClientCultureScreen feed={{
      items: fourPosts,
      modules: [gridModule],
      cursor: null,
      hasMore: false
    }} />);

    expect(feedDomEntries(firstRender.container).map((entry) => entry.getAttribute("data-testid"))).toEqual([
      "culture-post-card",
      "culture-post-card",
      "culture-post-card",
      "culture-post-card"
    ]);
    expect(screen.queryByTestId("culture-discovery-grid")).not.toBeInTheDocument();
    expect(screen.getByText("More culture is building.")).toBeInTheDocument();

    firstRender.unmount();

    const secondRender = render(<ClientCultureScreen feed={{
      items: fivePosts,
      modules: [gridModule],
      cursor: null,
      hasMore: false
    }} />);

    expect(feedDomEntries(secondRender.container).map((entry) => entry.getAttribute("data-testid"))).toEqual([
      "culture-post-card",
      "culture-post-card",
      "culture-post-card",
      "culture-post-card",
      "culture-post-card",
      "culture-discovery-grid"
    ]);
    expect(screen.queryByText(/Top Rated|rating|from \$45|Available Today|Near You/i)).not.toBeInTheDocument();
  });

  it("renders a social post card with real actions, book CTA, detail sheet, and no fake counts", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, items: [], cursor: null, hasMore: false })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      feedSessionId: "11111111-1111-4111-8111-111111111111",
      items: [culturePost("post-1", { authorVerified: true, caption: "Low taper transformation." })]
    }} />);

    const card = screen.getByTestId("culture-post-card");
    expect(card).toHaveTextContent("Blaze King");
    expect(card).toHaveTextContent("@blaze");
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Low taper transformation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Culture post detail" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute("href", expect.stringContaining("/barber/blaze?source=culture"));
    expect(screen.getByRole("link", { name: /Book Signature Cut/i })).toHaveAttribute("href", expect.stringContaining("/booking/new?source=culture"));
    expect(screen.getByRole("button", { name: /Comment is not available for this post yet/i })).toBeDisabled();
    expect(screen.queryByText(/1\.2k|views:|followers:|engagement rate|Top Rated|from \$45/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Culture post detail" }));
    expect(screen.getByRole("dialog", { name: "Culture post detail" })).toBeInTheDocument();
    expect(screen.getByText("Why this post")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Like this Culture post/i })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/engagements", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ postId: "post-1", action: "like" })
    })));
  });

  it("keeps Why This Post and Not Interested safe", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, items: [], cursor: null, hasMore: false })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      items: [culturePost("post-1", {
        reasonCodes: ["following_author", "saved_similar", "barber_work"]
      })]
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Culture post actions" }));
    fireEvent.click(screen.getByRole("button", { name: /Why this post/i }));

    expect(screen.getAllByText("Because you follow this creator").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Because you saved or liked similar work")).toBeInTheDocument();
    expect(screen.queryByText(/raw score|model|private viewer|ranking/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Not interested/i }));

    await waitFor(() => expect(screen.queryByTestId("culture-post-card")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/culture/engagements", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        postId: "post-1",
        action: "not_interested",
        metadata: { cta: "not_interested" }
      })
    }));
  });

  it("loads the next cursor page without duplicating posts or wiping current content", async () => {
    const observed = new Map<string, (entries: IntersectionObserverEntry[]) => void>();
    class MockIntersectionObserver {
      callback: (entries: IntersectionObserverEntry[]) => void;
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        this.callback = callback;
      }
      observe = vi.fn((node: Element) => {
        observed.set(node.getAttribute("data-testid") ?? "unknown", this.callback);
      });
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, items: [culturePost("post-1")], cursor: "cursor-1", hasMore: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          items: [culturePost("post-1"), culturePost("post-2", { caption: "Second page post" })],
          cursor: null,
          hasMore: false,
          feedSessionId: "11111111-1111-4111-8111-111111111111"
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{
      cursor: "cursor-1",
      hasMore: true,
      feedSessionId: "11111111-1111-4111-8111-111111111111",
      items: [culturePost("post-1")]
    }} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      observed.get("culture-feed-sentinel")?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    });

    await screen.findByText("Second page post");
    expect(screen.getAllByTestId("culture-post-card")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("cursor=cursor-1"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("sessionId=11111111-1111-4111-8111-111111111111"));
  });

  it("keeps current posts visible when a background update fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "Unable to load Culture feed. Try again." })
    })));

    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      items: [culturePost("post-1")]
    }} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load Culture feed. Try again.");
    expect(screen.getByText("Culture caption post-1")).toBeInTheDocument();
  });

  it("records one real impression after visibility threshold and dwell time", async () => {
    vi.useFakeTimers();
    const observers: Array<(entries: IntersectionObserverEntry[]) => void> = [];
    class MockIntersectionObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        observers.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, items: [], cursor: null, hasMore: false })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      feedSessionId: "11111111-1111-4111-8111-111111111111",
      items: [culturePost("post-1")]
    }} />);

    await act(async () => {
      observers[0]?.([{ isIntersecting: true, intersectionRatio: 0.6 } as IntersectionObserverEntry]);
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/culture/events", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        action: "feed_event",
        eventType: "post_impression",
        postId: "post-1",
        feedSessionId: "11111111-1111-4111-8111-111111111111",
        surface: "culture_feed",
        position: 0,
        reasonCodes: ["barber_work", "bookable_barber", "recent_public_post"],
        metadata: {
          source: "culture",
          dwell_ms: 1000,
          visibility_threshold: 0.5
        }
      })
    }));

    await act(async () => {
      observers[0]?.([{ isIntersecting: true, intersectionRatio: 0.8 } as IntersectionObserverEntry]);
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    const impressionCalls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>).filter(([url, options]) => (
      url === "/api/culture/events" && String(options?.body).includes("post_impression")
    ));
    expect(impressionCalls).toHaveLength(1);
  });
});
