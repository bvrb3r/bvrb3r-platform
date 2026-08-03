import { describe, expect, it } from "vitest";
import {
  defaultNotificationChannelPreferences,
  forceActiveQueueSms,
  groupNotificationDate,
  normalizeNotificationChannelPreferences,
  notificationCategory,
  safeNotificationDeepLink
} from "@/lib/notifications/domain";

describe("Product PR30 notification domain", () => {
  it("maps every notification kind into one canonical filter", () => {
    expect(notificationCategory("booking_alert")).toBe("booking");
    expect(notificationCategory("chair_ready")).toBe("queue");
    expect(notificationCategory("payment_alert")).toBe("money");
    expect(notificationCategory("creator")).toBe("culture");
    expect(notificationCategory("message")).toBe("team");
    expect(notificationCategory("unknown_future_type")).toBe("system");
  });

  it("normalizes a complete matrix and forces active-queue SMS on", () => {
    const matrix = normalizeNotificationChannelPreferences({
      queue: { push: false, sms: false, email: false },
      culture: { push: true, sms: true, email: true }
    });
    const locked = forceActiveQueueSms(matrix, true);

    expect(locked.queue.sms).toBe(true);
    expect(locked.queue.push).toBe(false);
    expect(locked.culture.sms).toBe(true);
    expect(locked.booking).toEqual(defaultNotificationChannelPreferences.booking);
  });

  it("builds only app-relative, identifier-safe deep links", () => {
    expect(safeNotificationDeepLink("/appointments/exact", null)).toBe("/appointments/exact");
    expect(safeNotificationDeepLink("https://evil.test", { threadId: "thread_22" }))
      .toBe("/messages/thread_22");
    expect(safeNotificationDeepLink("//evil.test", { payoutId: "../secret" })).toBeNull();
    expect(safeNotificationDeepLink(null, { waitlist_entry_id: "queue-7" }))
      .toBe("/queue/queue-7");
  });

  it("groups the feed into Today and Earlier using the viewer day", () => {
    const now = new Date(2026, 6, 29, 15, 0, 0);
    const today = new Date(2026, 6, 29, 1, 0, 0).toISOString();
    const earlier = new Date(2026, 6, 28, 23, 59, 59).toISOString();
    expect(groupNotificationDate(today, now)).toBe("today");
    expect(groupNotificationDate(earlier, now)).toBe("earlier");
    expect(groupNotificationDate(null, now)).toBe("earlier");
  });
});
