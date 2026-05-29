import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

import { ClientBottomNav } from "@/components/client-experience/client-bottom-nav";
import { ClientSidebar } from "@/components/client-experience/client-sidebar";

describe("client navigation", () => {
  it("renders only the four primary client tabs in the sidebar", () => {
    render(<ClientSidebar activeTab="home" />);

    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/dashboard/client");
    expect(screen.getByRole("link", { name: /search/i })).toHaveAttribute("href", "/dashboard/client/search");
    expect(screen.getByRole("link", { name: /activity/i })).toHaveAttribute("href", "/dashboard/client/activity");
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/dashboard/client/profile");
    expect(screen.queryByRole("link", { name: /culture/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /messages/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /bookings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /wallet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /rewards/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /referrals/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("renders only the four primary client tabs in the bottom nav", () => {
    render(<ClientBottomNav activeTab="activity" />);

    expect(screen.getByRole("navigation", { name: "Client mobile navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/dashboard/client");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/dashboard/client/search");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/dashboard/client/activity");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/dashboard/client/profile");
    expect(screen.queryByRole("link", { name: "Culture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Messages" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /bookings/i })).not.toBeInTheDocument();
  });
});
