import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getSessionUserMock,
  submitSupportIssueIntakeMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  submitSupportIssueIntakeMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/support/issue-intake", async () => {
  const actual = await vi.importActual<typeof import("@/lib/support/issue-intake")>("@/lib/support/issue-intake");
  return {
    ...actual,
    submitSupportIssueIntake: submitSupportIssueIntakeMock
  };
});

import { POST as postSupportIssueIntake } from "@/app/api/support/issue-intake/route";
import { SupportIssueIntakeError } from "@/lib/support/issue-intake";

describe("support issue intake route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    submitSupportIssueIntakeMock.mockReset();
  });

  it("returns a server-confirmed receipt for valid issue intake", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    submitSupportIssueIntakeMock.mockResolvedValue({
      status: "received",
      category: "booking_problem",
      categoryLabel: "Booking problem",
      severity: "normal",
      roleScope: "client",
      threadId: "thread-support-1",
      messageId: "msg-support-1",
      receivedAt: "2026-07-04T12:00:00.000Z",
      eventRecorded: true
    });

    const response = await postSupportIssueIntake(new NextRequest("https://bvrb3r.app/api/support/issue-intake", {
      method: "POST",
      body: JSON.stringify({
        category: "booking_problem",
        severity: "normal",
        description: "Booking failed after picking a time.",
        sourceSurface: "client_more"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("received");
    expect(submitSupportIssueIntakeMock).toHaveBeenCalledWith(expect.objectContaining({ role: "client_user" }), expect.objectContaining({
      category: "booking_problem",
      sourceSurface: "client_more"
    }));
  });

  it("returns route-safe validation failures without fake success", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    submitSupportIssueIntakeMock.mockRejectedValue(new SupportIssueIntakeError("Describe what happened before submitting support.", 400, "description_required"));

    const response = await postSupportIssueIntake(new NextRequest("https://bvrb3r.app/api/support/issue-intake", {
      method: "POST",
      body: JSON.stringify({
        category: "booking_problem",
        severity: "normal",
        description: ""
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: "Support intake was not submitted",
      code: "description_required"
    });
  });
});
