import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  readScheduledExecutionStatusMock,
  runScheduledFintechJobsMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  readScheduledExecutionStatusMock: vi.fn(),
  runScheduledFintechJobsMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/cron/fintech", () => ({
  readScheduledExecutionStatus: readScheduledExecutionStatusMock,
  runScheduledFintechJobs: runScheduledFintechJobsMock
}));

import { GET, POST } from "@/app/api/operations/automation/status/route";

describe("operations automation status route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    readScheduledExecutionStatusMock.mockReset();
    runScheduledFintechJobsMock.mockReset();
    delete process.env.AUTOMATION_PROCESS_SECRET;
  });

  it("blocks non-management users from reading scheduled execution status", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-client",
      role: "client",
      email: "client@bvrb3r.demo",
      locationIds: []
    });

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("returns scheduled execution status for owner scope", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-owner",
      role: "owner",
      email: "owner@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    });
    readScheduledExecutionStatusMock.mockResolvedValue({
      summary: {
        queued: 0,
        running: 0,
        completed: 7,
        failed: 0,
        skipped: 0
      },
      recentRuns: [],
      latestByJob: {}
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readScheduledExecutionStatusMock).toHaveBeenCalledWith({
      locationIds: ["loc-ybor"]
    });
    expect(body.status.summary.completed).toBe(7);
  });

  it("runs scheduled jobs from management scope with manual trigger metadata", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-manager",
      role: "manager",
      email: "manager@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    });
    runScheduledFintechJobsMock.mockResolvedValue({
      status: {
        summary: {
          queued: 0,
          running: 0,
          completed: 7,
          failed: 0,
          skipped: 0
        },
        recentRuns: [],
        latestByJob: {}
      },
      recentRuns: []
    });

    const response = await POST(new NextRequest("https://bvrb3r.demo/api/operations/automation/status", {
      method: "POST",
      body: JSON.stringify({})
    }));

    expect(response.status).toBe(200);
    expect(runScheduledFintechJobsMock).toHaveBeenCalledWith({
      locationIds: ["loc-ybor"],
      triggerSource: "manual",
      actorUserId: "user-manager",
      actorRole: "manager"
    });
  });

  it("allows secret-authenticated scheduled execution without a session-scoped operator path", async () => {
    process.env.AUTOMATION_PROCESS_SECRET = "test-secret";
    runScheduledFintechJobsMock.mockResolvedValue({
      status: {
        summary: {
          queued: 0,
          running: 0,
          completed: 7,
          failed: 0,
          skipped: 0
        },
        recentRuns: [],
        latestByJob: {}
      },
      recentRuns: []
    });

    const response = await POST(new NextRequest("https://bvrb3r.demo/api/operations/automation/status", {
      method: "POST",
      headers: {
        authorization: "Bearer test-secret"
      },
      body: JSON.stringify({
        locationIds: ["loc-downtown"]
      })
    }));

    expect(response.status).toBe(200);
    expect(runScheduledFintechJobsMock).toHaveBeenCalledWith({
      locationIds: ["loc-downtown"],
      triggerSource: "scheduled",
      actorUserId: "scheduled-job",
      actorRole: "owner"
    });
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });
});
