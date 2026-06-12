import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";

describe("client culture screen", () => {
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

  it("renders real Culture feed items without fake counts or active dead buttons", () => {
    render(<ClientCultureScreen feed={{
      cursor: null,
      hasMore: false,
      items: [{
        id: "post-1",
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
        canLike: true,
        canSave: true,
        canShare: true,
        canReport: true,
        canBook: false,
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
    expect(screen.getByRole("button", { name: /Like is connected to the Culture backend foundation/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Comment is not available for this post yet/i })).toBeDisabled();
    expect(screen.queryByText(/1\.2k|views:|followers:|engagement rate/i)).not.toBeInTheDocument();
  });
});
