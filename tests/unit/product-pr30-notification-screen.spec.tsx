import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenterScreen } from "@/components/notifications/notification-center-screen";
import { defaultNotificationChannelPreferences } from "@/lib/notifications/domain";
import type { NotificationCenterPayload } from "@/lib/notifications/service";

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

const initial: NotificationCenterPayload = {
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Your chair is ready",
      body: "Open the exact queue record.",
      channel: "sms",
      status: "delivered",
      type: "chair_ready",
      category: "queue",
      createdAt: new Date().toISOString(),
      scheduledFor: null,
      operational: true,
      readAt: null,
      unread: true,
      deepLink: "/queue/queue-7"
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Receipt available",
      body: "Your payment record is ready.",
      channel: "email",
      status: "delivered",
      type: "payment_alert",
      category: "money",
      createdAt: "2026-01-01T12:00:00.000Z",
      scheduledFor: null,
      operational: true,
      readAt: "2026-01-01T12:01:00.000Z",
      unread: false,
      deepLink: "/payouts/payout-8"
    }
  ],
  deliveries: [],
  preferences: {
    inAppEnabled: true,
    smsEnabled: true,
    emailEnabled: true,
    pushEnabled: true,
    messageAlertsEnabled: true,
    bookingAlertsEnabled: true,
    payoutAlertsEnabled: true,
    creatorAlertsEnabled: false,
    rewardsAlertsEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    quietHoursEnabled: true,
    quietHoursTimezone: "America/New_York",
    channelPreferences: defaultNotificationChannelPreferences,
    marketingBarberEnabled: false,
    marketingPlatformEnabled: false,
    preferredContactChannel: "push"
  },
  activeQueueSmsLocked: true,
  generatedAt: new Date().toISOString()
};

describe("Product PR30 notification screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ updated: true })
    }));
  });

  it("renders grouped alerts, canonical filters, and exact-record navigation", async () => {
    render(<NotificationCenterScreen initial={initial} roleLabel="Client" />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue" })).toBeInTheDocument();
    expect(screen.getByText("Your chair is ready")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Your chair is ready"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/queue/queue-7"));
    expect(fetch).toHaveBeenCalledWith("/api/notifications", expect.objectContaining({
      method: "POST"
    }));
  });

  it("locks active-queue SMS and exposes the redesign preference matrix", () => {
    render(<NotificationCenterScreen initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Notification preferences" }));

    const queueSms = screen.getByRole("switch", {
      name: "Waitlist & open slots sms, required while you are active in queue"
    });
    expect(queueSms).toBeChecked();
    expect(queueSms).toBeDisabled();
    expect(screen.getByText("Always on")).toBeInTheDocument();
    expect(screen.getByText("Offers from your barbers & shops")).toBeInTheDocument();
    expect(screen.getByText("More on the way")).toBeInTheDocument();
    expect(screen.getByLabelText("Notification tools still being built")).toHaveTextContent("Still being built");
  });

  it("marks every alert read without changing delivery status", async () => {
    render(<NotificationCenterScreen initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "All read ✓" })).toBeDisabled());
    expect(screen.getByText("Receipt available")).toBeInTheDocument();
  });
});
