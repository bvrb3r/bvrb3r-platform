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
      "Open profile"
    ]);
    expect(screen.getByRole("link", { name: "Open messages" })).toHaveAttribute("href", "/dashboard/client/messages");
    expect(screen.getByRole("link", { name: "Open profile" })).toHaveAttribute("href", "/dashboard/client/more");
  });

  it("shows unread dots only when counts are present and keeps message dots message-only", () => {
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
        notificationTone="yellow"
        messageUnreadCount={3}
        accountAttentionCount={1}
        accountAttentionTone="red"
      />
    );

    expect(screen.getByLabelText("2 unread notifications")).toBeInTheDocument();
    expect(screen.getByLabelText("3 unread messages")).toBeInTheDocument();
    expect(screen.getByLabelText("1 account attention items")).toBeInTheDocument();
  });

  it("uses red notification dots for critical bell alerts", () => {
    render(
      <DashboardHeaderActions
        role="owner"
        messagesHref="/dashboard/owner/messages"
        moreHref="/dashboard/owner/more"
        notificationUnreadCount={1}
        notificationTone="red"
      />
    );

    expect(screen.getByLabelText("1 unread notifications")).toHaveClass("bg-[#ff3b30]");
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

  it("renders structured notification rows with category, severity, timestamp, and action", () => {
    render(
      <DashboardHeaderActions
        role="barber"
        messagesHref="/dashboard/barber/messages"
        moreHref="/dashboard/barber/more"
        notificationItems={[
          {
            id: "stripe-test-mode",
            category: "PAYOUTS",
            severity: "warning",
            title: "Payout setup",
            body: "Stripe is in test mode. Live payouts are not active yet.",
            timestamp: "Today",
            action: {
              label: "View payout setup",
              href: "/dashboard/barber/more#payouts"
            }
          },
          {
            id: "booking-confirmed",
            category: "BOOKING",
            severity: "info",
            title: "Your appointment was confirmed.",
            body: "The client has a confirmed visit.",
            timestamp: "Yesterday",
            read: true
          }
        ]}
      />
    );

    expect(screen.getByLabelText("1 unread notifications")).toHaveClass("bg-[#ffd166]");

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(screen.getByText("PAYOUTS")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByText("Payout setup")).toBeInTheDocument();
    expect(screen.getByText("Stripe is in test mode. Live payouts are not active yet.")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View payout setup" })).toHaveAttribute("href", "/dashboard/barber/more#payouts");
    expect(screen.getByText("BOOKING")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
  });
});
