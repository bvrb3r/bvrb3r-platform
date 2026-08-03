import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicCultureFeed } from "@/components/public-site/public-culture-feed";
import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicNav } from "@/components/public-site/public-nav";
import type { CultureFeedItem } from "@/lib/culture/service";

function culturePost(overrides: Partial<CultureFeedItem> = {}): CultureFeedItem {
  return {
    id: "culture-post-1",
    authorProfileId: "profile-1",
    authorTargetKind: "barber",
    authorTarget: "nova",
    barberId: "barber-1",
    shopId: "shop-1",
    serviceId: "service-1",
    authorDisplayName: "Nova",
    authorUsername: "@nova",
    authorAvatarUrl: null,
    authorRoleLabel: "Barber",
    authorVerified: true,
    caption: "A clean taper built for the weekend.",
    postType: "barber_cut",
    media: null,
    createdAt: "2026-08-03T12:00:00.000Z",
    serviceName: "Taper",
    shopName: "The BVRB3R Shop",
    shopUsername: "the-bvrb3r-shop",
    profileUrl: "/barber/nova?source=culture",
    bookingUrl: "/booking/new?source=culture&barberId=barber-1&serviceId=service-1",
    shopUrl: null,
    canViewProfile: true,
    canViewShop: false,
    bookLabel: "Book Taper",
    bookingDisabledReason: null,
    canLike: true,
    canSave: true,
    canShare: true,
    canReport: true,
    canBook: true,
    canComment: true,
    commentSummary: { count: 3 },
    ...overrides
  };
}

describe("public Culture route separation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes Culture navigation to the feed while guest entry stays on discovery", () => {
    render(
      <>
        <PublicNav active="/culture" />
        <PublicFooter />
      </>
    );

    for (const link of screen.getAllByRole("link", { name: "Culture" })) {
      expect(link).toHaveAttribute("href", "/culture");
    }
    for (const link of screen.getAllByRole("link", { name: "Enter as guest" })) {
      expect(link).toHaveAttribute("href", "/discover?entry=guest");
    }
    for (const link of within(screen.getByRole("navigation", { name: "Public" })).getAllByRole("link", { name: "Culture" })) {
      expect(link).toHaveAttribute("aria-current", "page");
    }
  });

  it("keeps public social actions behind Client signup and book-this-look on the real booking path", () => {
    render(<PublicCultureFeed initialFeed={{ items: [culturePost()], cursor: null, hasMore: false }} />);

    expect(screen.getByRole("link", { name: "Post to Culture" })).toHaveAttribute("href", "/signup?lane=client");
    expect(screen.getByRole("link", { name: "Follow" })).toHaveAttribute("href", "/signup?lane=client");
    expect(screen.getByRole("link", { name: "Like this Culture post" })).toHaveAttribute("href", "/signup?lane=client");
    expect(screen.getByRole("link", { name: "Comment on this Culture post" })).toHaveAttribute("href", "/signup?lane=client");
    expect(screen.getByRole("link", { name: "Book this look from Nova" })).toHaveAttribute(
      "href",
      "/booking/new?source=culture&barberId=barber-1&serviceId=service-1"
    );
  });

  it("falls back from a non-bookable post to guest discovery with Culture attribution", () => {
    render(
      <PublicCultureFeed
        initialFeed={{
          items: [culturePost({ id: "culture-post-2", bookingUrl: null, canBook: false })],
          cursor: null,
          hasMore: false
        }}
      />
    );

    expect(screen.getByRole("link", { name: "Book this look from Nova" })).toHaveAttribute(
      "href",
      expect.stringContaining("/discover?entry=guest&source=culture&culturePostId=culture-post-2")
    );
  });

  it("shows an honest retry path when the initial public feed cannot load", () => {
    render(
      <PublicCultureFeed
        initialFeed={{
          items: [],
          cursor: null,
          hasMore: false,
          error: "Culture could not load right now. Guest discovery is still open."
        }}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Culture is taking a breath.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Guest Discovery" })).toHaveAttribute("href", "/discover?entry=guest");
  });

  it("stops automatic pagination after a load-more failure until the visitor retries", async () => {
    const callbacks: IntersectionObserverCallback[] = [];
    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];

      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback);
      }

      disconnect() {}
      observe() {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
      unobserve() {}
    }
    const fetchMock = vi.fn().mockRejectedValue(new Error("Culture pagination failed."));
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PublicCultureFeed
        initialFeed={{
          items: [culturePost()],
          cursor: "cursor-next",
          hasMore: true,
          feedSessionId: "public-feed-test"
        }}
      />
    );

    expect(callbacks).toHaveLength(1);
    act(() => {
      callbacks[0]?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Culture pagination failed.");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callbacks).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
