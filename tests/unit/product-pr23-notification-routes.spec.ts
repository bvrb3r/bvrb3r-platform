import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  getNotificationCenterMock,
  saveNotificationCenterPreferencesMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  getNotificationCenterMock: vi.fn(),
  saveNotificationCenterPreferencesMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/notifications/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/notifications/service")>();
  return {
    ...original,
    getNotificationCenter: getNotificationCenterMock,
    saveNotificationCenterPreferences: saveNotificationCenterPreferencesMock
  };
});

import { GET, PATCH } from "@/app/api/notifications/route";

const signedInSession = {
  authenticated: true,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "jordan@example.test"
  }
};

function patchRequest(body: unknown) {
  return new Request("https://example.test/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Product PR23 notification routes", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    getNotificationCenterMock.mockReset();
    saveNotificationCenterPreferencesMock.mockReset();
  });

  it("requires a signed-in account for reads and preference changes", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: false,
      user: { id: "guest-user" }
    });

    const read = await GET();
    const update = await PATCH(patchRequest({ sms_enabled: true }));

    expect(read.status).toBe(401);
    expect(update.status).toBe(401);
    expect(getNotificationCenterMock).not.toHaveBeenCalled();
    expect(saveNotificationCenterPreferencesMock).not.toHaveBeenCalled();
  });

  it("returns private notification-center truth for the signed-in account", async () => {
    getCurrentUserFromServerMock.mockResolvedValue(signedInSession);
    getNotificationCenterMock.mockResolvedValue({
      items: [],
      deliveries: [],
      preferences: null,
      generatedAt: "2026-07-28T12:00:00.000Z"
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getNotificationCenterMock).toHaveBeenCalledWith(signedInSession.user);
  });

  it("rejects malformed quiet hours before saving", async () => {
    getCurrentUserFromServerMock.mockResolvedValue(signedInSession);

    const response = await PATCH(patchRequest({ quiet_hours_start: "after lunch" }));

    expect(response.status).toBe(400);
    expect(saveNotificationCenterPreferencesMock).not.toHaveBeenCalled();
  });

  it("saves explicit channel and quiet-hour preferences", async () => {
    getCurrentUserFromServerMock.mockResolvedValue(signedInSession);
    saveNotificationCenterPreferencesMock.mockResolvedValue({
      sms_enabled: false,
      quiet_hours_start: "21:30",
      quiet_hours_end: "07:00"
    });

    const response = await PATCH(patchRequest({
      sms_enabled: false,
      quiet_hours_start: "21:30",
      quiet_hours_end: "07:00"
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.preferences).toMatchObject({
      sms_enabled: false,
      quiet_hours_start: "21:30",
      quiet_hours_end: "07:00"
    });
    expect(saveNotificationCenterPreferencesMock).toHaveBeenCalledWith(
      signedInSession.user,
      expect.objectContaining({
        sms_enabled: false,
        quiet_hours_start: "21:30",
        quiet_hours_end: "07:00"
      })
    );
  });
});
