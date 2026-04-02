import { describe, expect, it } from "vitest";
import { executeNotificationAttempt, getDeliveryProviderHealth, resolveNotificationDestination } from "@/lib/engagement/live-delivery";
import type { NotificationDeliveryRecord } from "@/types/activation";
import type { EngagementNotificationRecord } from "@/types/engagement";
import type { NotificationDeliveryAttemptRecord } from "@/types/mobile";

const notification: EngagementNotificationRecord = {
  id: "engage-note-test",
  userEmail: "client@bvrb3r.demo",
  role: "client",
  clientId: "client-jordan",
  channel: "push",
  type: "booking_alert",
  title: "Booking confirmed",
  body: "Your appointment is locked in.",
  status: "queued",
  createdAt: "2026-03-10T10:00:00.000Z"
};

const delivery: NotificationDeliveryRecord = {
  id: "delivery-test",
  notificationId: notification.id,
  channel: "push",
  provider: "web_push_placeholder",
  status: "queued",
  destination: "https://push.placeholder.bvrb3r/device",
  title: notification.title,
  metadata: {
    webUrl: "https://bvrb3r.app/dashboard/client"
  }
};

describe("live delivery", () => {
  it("reports provider health in a stable shape", () => {
    const health = getDeliveryProviderHealth();

    expect(typeof health.push.webPushConfigured).toBe("boolean");
    expect(typeof health.sms.configured).toBe("boolean");
    expect(typeof health.email.configured).toBe("boolean");
  });

  it("resolves SMS destinations from client phone data", () => {
    expect(resolveNotificationDestination(notification, "sms")).toBe("+18135550190");
  });

  it("keeps placeholder push attempts safe when a real endpoint is unavailable", async () => {
    const attempt: NotificationDeliveryAttemptRecord = {
      id: "attempt-test",
      deliveryId: delivery.id,
      notificationId: notification.id,
      channel: "push",
      provider: "web_push_placeholder",
      status: "queued",
      userEmail: notification.userEmail,
      destination: "https://push.placeholder.bvrb3r/device",
      attemptNumber: 1,
      metadata: {},
      createdAt: notification.createdAt,
      updatedAt: notification.createdAt
    };

    const result = await executeNotificationAttempt({ notification, delivery, attempt });

    expect(result.provider).toBe("web_push_placeholder");
    expect(result.status).toBe("placeholder");
  });
});

