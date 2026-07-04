import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  createMessagingThreadMock,
  sendThreadMessageMock,
  createSupabaseAdminClientMock,
  recordRequiredPlatformEventMock
} = vi.hoisted(() => ({
  createMessagingThreadMock: vi.fn(),
  sendThreadMessageMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  recordRequiredPlatformEventMock: vi.fn()
}));

vi.mock("@/lib/messages/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/messages/service")>("@/lib/messages/service");
  return {
    ...actual,
    createMessagingThread: createMessagingThreadMock,
    sendThreadMessage: sendThreadMessageMock
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/core/platform-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/core/platform-events")>("@/lib/core/platform-events");
  return {
    ...actual,
    recordRequiredPlatformEvent: recordRequiredPlatformEventMock
  };
});

import {
  getSupportIssueCategoryOptionsForRole,
  submitSupportIssueIntake,
  SupportIssueIntakeError,
  SUPPORT_SAFETY_DISCLAIMER
} from "@/lib/support/issue-intake";

describe("support issue intake", () => {
  beforeEach(() => {
    createMessagingThreadMock.mockReset();
    sendThreadMessageMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    recordRequiredPlatformEventMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue({ from: vi.fn() });
    recordRequiredPlatformEventMock.mockResolvedValue({ ok: true });
    createMessagingThreadMock.mockResolvedValue({
      thread: { id: "thread-support-1" }
    });
    sendThreadMessageMock.mockResolvedValue({
      message: {
        id: "msg-support-1",
        createdAt: "2026-07-04T12:00:00.000Z"
      }
    });
  });

  it("exposes role-aware categories without backend labels", () => {
    expect(getSupportIssueCategoryOptionsForRole("client").map((option) => option.value)).toEqual([
      "booking_problem",
      "payment_or_receipt_problem",
      "account_or_login_problem",
      "message_problem",
      "notification_problem",
      "profile_or_settings_problem",
      "app_bug",
      "feedback_or_feature_request",
      "safety_or_trust_concern",
      "other"
    ]);
    expect(getSupportIssueCategoryOptionsForRole("barber").map((option) => option.value)).toContain("shop_or_queue_problem");
    expect(getSupportIssueCategoryOptionsForRole("barber").map((option) => option.value)).not.toContain("kiosk_problem");
    expect(getSupportIssueCategoryOptionsForRole("owner").map((option) => option.value)).toContain("kiosk_problem");
  });

  it("rejects role-ineligible categories before writing support messages", async () => {
    await expect(submitSupportIssueIntake(resolveDemoUser("client@bvrb3r.demo"), {
      category: "kiosk_problem",
      severity: "normal",
      description: "The kiosk flow is unavailable to this client."
    })).rejects.toMatchObject({
      status: 403,
      code: "category_not_allowed_for_role"
    });

    expect(createMessagingThreadMock).not.toHaveBeenCalled();
    expect(sendThreadMessageMock).not.toHaveBeenCalled();
    expect(recordRequiredPlatformEventMock).not.toHaveBeenCalled();
  });

  it("rejects empty descriptions without creating fake submitted state", async () => {
    await expect(submitSupportIssueIntake(resolveDemoUser("barber@bvrb3r.demo"), {
      category: "message_problem",
      severity: "high",
      description: " "
    })).rejects.toBeInstanceOf(SupportIssueIntakeError);

    expect(createMessagingThreadMock).not.toHaveBeenCalled();
    expect(sendThreadMessageMock).not.toHaveBeenCalled();
  });

  it("persists a support message and route metadata without storing the description in platform event payload", async () => {
    const result = await submitSupportIssueIntake(resolveDemoUser("owner@bvrb3r.demo"), {
      category: "kiosk_problem",
      severity: "urgent",
      description: "Walk-in kiosk guests cannot join the queue from the owner tablet.",
      sourceSurface: "owner_more"
    });

    expect(result).toMatchObject({
      status: "received",
      category: "kiosk_problem",
      severity: "urgent",
      roleScope: "owner",
      threadId: "thread-support-1",
      messageId: "msg-support-1",
      eventRecorded: true
    });
    expect(createMessagingThreadMock).toHaveBeenCalledWith(expect.objectContaining({ role: "shop_owner_user" }), { threadType: "support" });
    expect(sendThreadMessageMock).toHaveBeenCalledWith(expect.anything(), "thread-support-1", {
      body: expect.stringContaining("Walk-in kiosk guests cannot join the queue from the owner tablet.")
    });
    expect(recordRequiredPlatformEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "support_issue_received",
      entityType: "support_issue",
      entityId: "msg-support-1",
      actorRole: "shop_owner_user",
      payload: expect.objectContaining({
        category: "kiosk_problem",
        severity: "urgent",
        sourceSurface: "owner_more",
        descriptionStoredInSupportThread: true
      })
    }));
    expect(JSON.stringify(recordRequiredPlatformEventMock.mock.calls[0][1].payload)).not.toContain("Walk-in kiosk guests");
  });

  it("includes the emergency disclaimer only in the safety support message path", async () => {
    await submitSupportIssueIntake(resolveDemoUser("client@bvrb3r.demo"), {
      category: "safety_or_trust_concern",
      severity: "urgent",
      description: "A client needs help with a trust and safety concern.",
      sourceSurface: "client_more"
    });

    expect(sendThreadMessageMock).toHaveBeenCalledWith(expect.anything(), "thread-support-1", {
      body: expect.stringContaining(SUPPORT_SAFETY_DISCLAIMER)
    });
  });
});
