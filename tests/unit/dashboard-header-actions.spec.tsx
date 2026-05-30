import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

import { DashboardHeaderActions } from "@/components/dashboard/dashboard-header-actions";

describe("DashboardHeaderActions", () => {
  it("renders notifications, messages, and account actions in the universal order", () => {
    render(
      <DashboardHeaderActions
        role="client"
        messagesHref="/dashboard/client/messages"
        moreHref="/dashboard/client/more"
      />
    );

    const actions = Array.from(screen.getByRole("group", { name: "Header actions" }).querySelectorAll("button,a"));
    expect(actions.map((action) => action.getAttribute("aria-label"))).toEqual([
      "Open notifications",
      "Open messages",
      "Open account"
    ]);
    expect(screen.getByRole("link", { name: "Open messages" })).toHaveAttribute("href", "/dashboard/client/messages");
    expect(screen.getByRole("link", { name: "Open account" })).toHaveAttribute("href", "/dashboard/client/more");
  });

  it("shows unread dots only when counts are present", () => {
    const { rerender } = render(
      <DashboardHeaderActions
        role="barber"
        messagesHref="/dashboard/barber/messages"
        moreHref="/dashboard/barber/more"
      />
    );

    expect(screen.queryByLabelText("2 unread notifications")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("3 unread messages")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("1 account attention items")).not.toBeInTheDocument();

    rerender(
      <DashboardHeaderActions
        role="barber"
        messagesHref="/dashboard/barber/messages"
        moreHref="/dashboard/barber/more"
        notificationUnreadCount={2}
        messageUnreadCount={3}
        accountAttentionCount={1}
        accountAttentionTone="red"
      />
    );

    expect(screen.getByLabelText("2 unread notifications")).toBeInTheDocument();
    expect(screen.getByLabelText("3 unread messages")).toBeInTheDocument();
    expect(screen.getByLabelText("1 account attention items")).toBeInTheDocument();
  });

  it("opens a placeholder notification drawer with unread and recent sections", () => {
    render(
      <DashboardHeaderActions
        role="owner"
        notificationsHref="/dashboard/owner/more"
        messagesHref="/dashboard/owner/messages"
        moreHref="/dashboard/owner/more"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("No new notifications.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open notification center" })).toHaveAttribute("href", "/dashboard/owner/more");
  });
});
