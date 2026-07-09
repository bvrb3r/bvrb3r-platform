import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

import { ClientBottomNav } from "@/components/client-experience/client-bottom-nav";
import { ClientAppHeader } from "@/components/client-experience/client-app-header";
import { ClientSidebar } from "@/components/client-experience/client-sidebar";

describe("client navigation", () => {
  it("renders the five primary client tabs in the sidebar", () => {
    render(<ClientSidebar activeTab="home" />);

    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/dashboard/client");
    expect(screen.getByRole("link", { name: /search/i })).toHaveAttribute("href", "/dashboard/client/search");
    expect(screen.getByRole("link", { name: /culture/i })).toHaveAttribute("href", "/dashboard/client/culture");
    expect(screen.getByRole("link", { name: /messages/i })).toHaveAttribute("href", "/dashboard/client/messages");
    expect(screen.getByRole("link", { name: /account/i })).toHaveAttribute("href", "/dashboard/client/more");
    expect(screen.queryByRole("link", { name: /activity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /bookings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /wallet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /rewards/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /referrals/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("renders the five primary client tabs in the bottom nav", () => {
    render(<ClientBottomNav activeTab="messages" />);

    expect(screen.getByRole("navigation", { name: "Client mobile navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/dashboard/client");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/dashboard/client/search");
    expect(screen.getByRole("link", { name: "Culture" })).toHaveAttribute("href", "/dashboard/client/culture");
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/dashboard/client/messages");
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/dashboard/client/more");
    expect(screen.queryByRole("link", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /bookings/i })).not.toBeInTheDocument();
  });

  it("keeps client bottom navigation tap targets at the mobile minimum", () => {
    render(<ClientBottomNav activeTab="home" />);

    ["Home", "Search", "Culture", "Messages", "Account"].forEach((label) => {
      expect(screen.getByRole("link", { name: label })).toHaveClass("min-h-12");
    });
  });

  it("renders the universal client header actions in the shared order", () => {
    render(<ClientAppHeader />);

    const actions = Array.from(screen.getByRole("group", { name: "Header actions" }).querySelectorAll("button,a"));
    expect(actions.map((action) => action.getAttribute("aria-label"))).toEqual([
      "Open notifications",
      "Open messages",
      "Open profile"
    ]);
    expect(screen.getByText("BVRB3R")).toBeInTheDocument();
    expect(screen.queryByText("Search, book, and manage visits")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Color theme" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open messages" })).toHaveAttribute("href", "/dashboard/client/messages");
    expect(screen.getByRole("link", { name: "Open profile" })).toHaveAttribute("href", "/dashboard/client/more");
    expect(screen.queryByRole("link", { name: "Open culture" })).not.toBeInTheDocument();
  });
});
