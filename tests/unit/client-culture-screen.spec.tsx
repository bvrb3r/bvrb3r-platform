import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";

describe("client culture screen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the culture feed shell and discovery actions", () => {
    render(<ClientCultureScreen />);

    expect(screen.getByRole("heading", { name: "Culture" })).toBeInTheDocument();
    expect(screen.getByText("Cuts, shops, style, and community.")).toBeInTheDocument();
    expect(screen.getByText("Client Culture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "For You" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Near You" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Available Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fades" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shops" })).toBeInTheDocument();
    expect(screen.getByText("Community pulse")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Discover barbers/i })).toHaveAttribute("href", "/dashboard/client/search");
    expect(screen.getByRole("link", { name: /View shops/i })).toHaveAttribute("href", "/dashboard/client/search?type=shops");
    expect(screen.getByText("Share your next cut")).toBeInTheDocument();
  });

  it("renders a safe empty feed state without requiring a feed table", () => {
    render(<ClientCultureScreen feed={{ items: [], cursor: null, hasMore: false }} />);

    expect(screen.getByText("Culture posts will appear here as the BVRB3R community grows.")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByTestId("culture-post-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/views:|followers:|likes:|engagement rate|1\.2k/i)).not.toBeInTheDocument();
  });

  it("renders a feed error state separately from the real empty state", () => {
    render(<ClientCultureScreen feed={{
      items: [],
      cursor: null,
      hasMore: false,
      error: "Unable to load Culture feed. Try again."
    }} />);

    expect(screen.getByText("Unable to load Culture feed. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Feed error")).toBeInTheDocument();
    expect(screen.queryByText("Culture posts will appear here as the BVRB3R community grows.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("culture-post-card")).not.toBeInTheDocument();
  });

  it("renders a barber-safe Culture shell without client-only posting copy", () => {
    render(<ClientCultureScreen surface="barber" />);

    expect(screen.getByTestId("client-culture-screen")).toBeInTheDocument();
    expect(screen.getByText("Cuts, styles, barbers, shops, and community.")).toBeInTheDocument();
    expect(screen.getByText("Barber Culture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspiration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tutorials" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Posts" })).toBeInTheDocument();
    expect(screen.getByText("My culture profile")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Discover styles/i })).toHaveAttribute("href", "/discover");
    expect(screen.getByRole("link", { name: /View shops/i })).toHaveAttribute("href", "/discover?type=shops");
    expect(screen.getByRole("link", { name: /Post your work/i })).toHaveAttribute("href", "/dashboard/barber/culture/new");
    expect(screen.getByText("Create a draft and submit barber work for review.")).toBeInTheDocument();
    expect(screen.getByText("Barber posts, tutorials, and shop culture will appear here as the BVRB3R community grows.")).toBeInTheDocument();
    expect(screen.queryByText("Posting is coming soon.")).not.toBeInTheDocument();
    expect(screen.queryByText(/fake|metrics|views:|followers:|1\.2k/i)).not.toBeInTheDocument();
  });

  it("renders a shop-owner-safe Culture shell for shop brand posting", () => {
    render(<ClientCultureScreen surface="shop" />);

    expect(screen.getByTestId("client-culture-screen")).toBeInTheDocument();
    expect(screen.getByText("Shops, teams, styles, barbers, and community.")).toBeInTheDocument();
    expect(screen.getByText("Shop Owner Culture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Chairs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Events" })).toBeInTheDocument();
    expect(screen.getByText("Promote shop")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Share Shop Culture/i })).toHaveAttribute("href", "/dashboard/owner/culture/new");
    expect(screen.getByText("Share shop updates, walk-ins, team moments, and local culture.")).toBeInTheDocument();
    expect(screen.getByText("Shop posts, team highlights, and local barber culture will appear here as the BVRB3R community grows.")).toBeInTheDocument();
    expect(screen.queryByText(/fake|metrics|views:|followers:|1\.2k/i)).not.toBeInTheDocument();
  });

  it("renders real Culture feed items with live engagement actions and no fake counts", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      items: [{
        id: "post-1",
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
        authorVerified: true,
        caption: "Low taper transformation.",
        postType: "barber_cut",
        media: {
          id: "media-1",
          url: "https://cdn.bvrb3r.test/post.jpg",
          thumbnailUrl: "https://cdn.bvrb3r.test/post-thumb.jpg",
          mediaType: "image",
          width: 1200,
          height: 900,
          durationSeconds: null
        },
        createdAt: "2026-06-12T12:00:00.000Z",
        serviceName: "Signature Cut",
        shopName: "BVRB3R Ybor",
        profileUrl: "/barber/blaze?source=culture&culturePostId=post-1&cultureAuthorId=22222222-2222-4222-8222-222222222222&cultureSurface=client_culture&cta=view_profile",
        bookingUrl: "/booking/new?source=culture&culturePostId=post-1&cultureAuthorId=22222222-2222-4222-8222-222222222222&cultureSurface=client_culture&barberId=33333333-3333-4333-8333-333333333333&barber=blaze&locationId=shop-ybor&shopId=shop-ybor&serviceId=44444444-4444-4444-8444-444444444444&cta=book_service&query=Signature+Cut",
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
        canComment: false
      }]
    }} />);

    const card = screen.getByTestId("culture-post-card");
    expect(card).toHaveTextContent("Blaze King");
    expect(card).toHaveTextContent("@blaze");
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Signature Cut")).toBeInTheDocument();
    expect(screen.getByText("BVRB3R Ybor")).toBeInTheDocument();
    expect(screen.getByText("Low taper transformation.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Blaze King" })).toHaveAttribute("href", expect.stringContaining("/barber/blaze?source=culture"));
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute("href", expect.stringContaining("cta=view_profile"));
    expect(screen.getByRole("link", { name: /Book Signature Cut/i })).toHaveAttribute("href", expect.stringContaining("/booking/new?source=culture"));
    expect(screen.getByRole("link", { name: /Book Signature Cut/i })).toHaveAttribute("href", expect.stringContaining("serviceId=44444444-4444-4444-8444-444444444444"));
    expect(screen.getByRole("button", { name: /Like this Culture post/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Save this Culture post/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Comment is not available for this post yet/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Like this Culture post/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/engagements", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ postId: "post-1", action: "like" })
    })));
    expect(screen.getByRole("status")).toHaveTextContent("Liked.");
    expect(screen.getByRole("button", { name: /Liked this Culture post/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save this Culture post/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/engagements", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ postId: "post-1", action: "save" })
    })));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");

    fireEvent.click(screen.getByRole("button", { name: /Follow Culture author/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/follow", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        targetProfileId: "22222222-2222-4222-8222-222222222222",
        action: "follow",
        sourcePostId: "post-1"
      })
    })));
    expect(screen.getByRole("status")).toHaveTextContent("Following.");

    fireEvent.click(screen.getByRole("link", { name: /Book Signature Cut/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/engagements", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        postId: "post-1",
        action: "book_click",
        metadata: { cta: "book_service" }
      })
    })));
    expect(screen.queryByText(/1\.2k|views:|followers:|engagement rate/i)).not.toBeInTheDocument();
  });

  it("renders real Discovery Grid modules and promoted labels without fake ranking copy", () => {
    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      modules: [{
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
      }],
      items: [{
        id: "post-1",
        authorProfileId: "22222222-2222-4222-8222-222222222222",
        authorTargetKind: "barber",
        authorTarget: "blaze",
        barberId: "33333333-3333-4333-8333-333333333333",
        shopId: null,
        serviceId: "44444444-4444-4444-8444-444444444444",
        authorDisplayName: "Blaze King",
        authorUsername: "@blaze",
        authorAvatarUrl: null,
        authorRoleLabel: "Barber",
        authorVerified: false,
        caption: "Promoted barber work.",
        postType: "barber_cut",
        media: {
          id: "media-1",
          url: "https://cdn.bvrb3r.test/post.jpg",
          thumbnailUrl: "https://cdn.bvrb3r.test/post-thumb.jpg",
          mediaType: "image",
          width: 1200,
          height: 900,
          durationSeconds: null
        },
        createdAt: "2026-06-12T12:00:00.000Z",
        serviceName: "Signature Cut",
        shopName: null,
        profileUrl: "/barber/blaze?source=culture",
        bookingUrl: "/booking/new?source=culture&culturePostId=post-1&cta=book_service",
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
        isPromoted: true,
        promotionLabel: "Promoted",
        reasonCodes: ["promoted_native", "barber_work", "bookable_barber", "recent_public_post"],
        reasonLabel: "Promoted"
      }]
    }} />);

    expect(screen.getAllByText("Promoted").length).toBeGreaterThanOrEqual(1);
    const grid = screen.getByTestId("culture-discovery-grid");
    expect(grid).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Barber Work" })).toBeInTheDocument();
    expect(within(grid).getByRole("link", { name: /Blaze King Signature Cut Book Signature Cut/i })).toHaveAttribute("href", expect.stringContaining("/booking/new?source=culture"));
    expect(within(grid).queryByText(/Available Today|Top Rated|Near You|1\.2k|rating|from \$45/i)).not.toBeInTheDocument();
  });

  it("shows a clear action error when a Culture engagement write fails", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "A signed-in account is required for Culture engagement." })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      items: [{
        id: "post-1",
        authorProfileId: "22222222-2222-4222-8222-222222222222",
        authorTargetKind: "barber",
        authorTarget: "blaze",
        barberId: "33333333-3333-4333-8333-333333333333",
        shopId: null,
        serviceId: null,
        authorDisplayName: "Blaze King",
        authorUsername: "@blaze",
        authorAvatarUrl: null,
        authorRoleLabel: "Barber",
        authorVerified: false,
        caption: "Low taper transformation.",
        postType: "barber_cut",
        media: null,
        createdAt: "2026-06-12T12:00:00.000Z",
        serviceName: null,
        shopName: null,
        profileUrl: "/barber/blaze?source=culture",
        bookingUrl: null,
        shopUrl: null,
        canViewProfile: true,
        canViewShop: false,
        bookLabel: null,
        bookingDisabledReason: "Book-from-post requires a public approved bookable barber or service.",
        canLike: true,
        canSave: true,
        canShare: true,
        canReport: true,
        canBook: false,
        canComment: false
      }]
    }} />);

    fireEvent.click(screen.getByRole("button", { name: /Like this Culture post/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A signed-in account is required for Culture engagement.");
    expect(screen.queryByText(/1\.2k|views:|followers:|engagement rate/i)).not.toBeInTheDocument();
  });

  it("renders shop entry CTAs without fake shop booking and keeps client posts non-bookable", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      items: [
        {
          id: "shop-post",
          authorProfileId: "66666666-6666-4666-8666-666666666666",
          authorTargetKind: "shop",
          authorTarget: "bvrb3r-ybor",
          barberId: null,
          shopId: "shop-ybor",
          serviceId: null,
          authorDisplayName: "BVRB3R Ybor",
          authorUsername: "@bvrb3r-ybor",
          authorAvatarUrl: null,
          authorRoleLabel: "Shop Owner",
          authorVerified: false,
          caption: "Team culture.",
          postType: "shop_update",
          media: null,
          createdAt: "2026-06-12T12:00:00.000Z",
          serviceName: null,
          shopName: "BVRB3R Ybor",
          profileUrl: null,
          bookingUrl: null,
          shopUrl: "/shop/bvrb3r-ybor?source=culture&culturePostId=shop-post&cultureAuthorId=66666666-6666-4666-8666-666666666666&cultureSurface=client_culture&cta=view_shop",
          canViewProfile: false,
          canViewShop: true,
          bookLabel: null,
          bookingDisabledReason: "Book-from-post requires a public approved bookable barber or service.",
          canLike: true,
          canSave: true,
          canShare: true,
          canReport: true,
          canBook: false,
          canComment: false
        },
        {
          id: "client-post",
          authorProfileId: "77777777-7777-4777-8777-777777777777",
          authorTargetKind: "client",
          authorTarget: "client-creator",
          barberId: null,
          shopId: null,
          serviceId: null,
          authorDisplayName: "Client Creator",
          authorUsername: "@client-creator",
          authorAvatarUrl: null,
          authorRoleLabel: "Client",
          authorVerified: false,
          caption: "Style inspiration.",
          postType: "style_inspiration",
          media: null,
          createdAt: "2026-06-12T12:00:00.000Z",
          serviceName: null,
          shopName: null,
          profileUrl: null,
          bookingUrl: null,
          shopUrl: null,
          canViewProfile: false,
          canViewShop: false,
          bookLabel: null,
          bookingDisabledReason: "Client Culture posts do not support booking.",
          canLike: true,
          canSave: true,
          canShare: true,
          canReport: true,
          canBook: false,
          canComment: false
        }
      ]
    }} />);

    expect(screen.getByRole("link", { name: "View Shop" })).toHaveAttribute("href", expect.stringContaining("/shop/bvrb3r-ybor?source=culture"));
    expect(screen.queryByRole("link", { name: /Book at Shop/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Book Client/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "View Shop" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/engagements", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        postId: "shop-post",
        action: "shop_click",
        metadata: { cta: "view_shop" }
      })
    })));
  });

  it("shows a loading state while a Culture engagement write is pending", async () => {
    let resolveAction!: (value: { ok: boolean; json: () => Promise<{ ok: boolean }> }) => void;
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      items: [{
        id: "post-1",
        authorProfileId: "22222222-2222-4222-8222-222222222222",
        authorTargetKind: "barber",
        authorTarget: "blaze",
        barberId: "33333333-3333-4333-8333-333333333333",
        shopId: null,
        serviceId: null,
        authorDisplayName: "Blaze King",
        authorUsername: "@blaze",
        authorAvatarUrl: null,
        authorRoleLabel: "Barber",
        authorVerified: false,
        caption: "Low taper transformation.",
        postType: "barber_cut",
        media: null,
        createdAt: "2026-06-12T12:00:00.000Z",
        serviceName: null,
        shopName: null,
        profileUrl: "/barber/blaze?source=culture",
        bookingUrl: null,
        shopUrl: null,
        canViewProfile: true,
        canViewShop: false,
        bookLabel: null,
        bookingDisabledReason: "Book-from-post requires a public approved bookable barber or service.",
        canLike: true,
        canSave: true,
        canShare: true,
        canReport: true,
        canBook: false,
        canComment: false
      }]
    }} />);

    fireEvent.click(screen.getByRole("button", { name: /Like this Culture post/i }));

    expect(screen.getByText("Saving")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Like this Culture post/i })).toBeDisabled();

    resolveAction({
      ok: true,
      json: async () => ({ ok: true })
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Liked.");
  });
});
