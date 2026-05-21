import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ARCHITECT_USER } from "@/tests/unit/architect-debug-test-utils";

const {
  requireArchitectDebugAccessMock,
  listArchitectReportsMock,
  getArchitectReportDetailMock,
  updateArchitectReportStatusMock
} = vi.hoisted(() => ({
  requireArchitectDebugAccessMock: vi.fn(),
  listArchitectReportsMock: vi.fn(),
  getArchitectReportDetailMock: vi.fn(),
  updateArchitectReportStatusMock: vi.fn()
}));

vi.mock("@/lib/architect/debug/guards", () => ({
  requireArchitectDebugAccess: requireArchitectDebugAccessMock
}));

vi.mock("@/lib/architect/reports/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/architect/reports/service")>("@/lib/architect/reports/service");
  return {
    ...actual,
    listArchitectReports: listArchitectReportsMock,
    getArchitectReportDetail: getArchitectReportDetailMock,
    updateArchitectReportStatus: updateArchitectReportStatusMock
  };
});

import { GET as getReports } from "@/app/api/architect/reports/route";
import {
  GET as getReportDetail,
  PATCH as patchReport
} from "@/app/api/architect/reports/[reportId]/route";

const reportView = {
  id: "safety-report-1",
  concernType: "Fake profile",
  targetType: "barber",
  targetId: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
  targetName: "Phillip mcgee",
  targetHref: "/barber/barber-43b3cda2",
  targetResolution: "resolved",
  targetReference: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
  reporterName: "Phillip mcgee",
  reporterId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
  reporterEmail: "phillipmcgeeclient@outlook.com",
  reporterSupportThreadId: "thread-support-1",
  reporterSupportThreadHref: "/architect/messages?threadId=thread-support-1",
  status: "received",
  dbStatus: "open",
  notesPreview: "This trust signal needs a closer review.",
  details: "This trust signal needs a closer review.",
  severity: "medium",
  locationReference: null,
  createdAt: "2026-05-21T12:00:00.000Z",
  updatedAt: "2026-05-21T12:00:00.000Z"
};

describe("architect reports routes", () => {
  beforeEach(() => {
    requireArchitectDebugAccessMock.mockReset();
    listArchitectReportsMock.mockReset();
    getArchitectReportDetailMock.mockReset();
    updateArchitectReportStatusMock.mockReset();
    requireArchitectDebugAccessMock.mockResolvedValue({
      ok: true,
      actor: ARCHITECT_USER
    });
  });

  it("lists trust reports for Architect case management", async () => {
    listArchitectReportsMock.mockResolvedValue({
      available: true,
      viewer: {
        profileId: ARCHITECT_USER.id,
        fullName: ARCHITECT_USER.name,
        role: "platform_admin"
      },
      summary: {
        total: 1,
        received: 1,
        underReview: 0,
        resolved: 0,
        dismissed: 0
      },
      reports: [reportView]
    });

    const response = await getReports();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reports[0].id).toBe("safety-report-1");
    expect(body.reports[0].reporterSupportThreadHref).toBe("/architect/messages?threadId=thread-support-1");
    expect(listArchitectReportsMock).toHaveBeenCalledWith(ARCHITECT_USER);
  });

  it("loads a single report detail and event history", async () => {
    getArchitectReportDetailMock.mockResolvedValue({
      available: true,
      viewer: {
        profileId: ARCHITECT_USER.id,
        fullName: ARCHITECT_USER.name,
        role: "platform_admin"
      },
      report: reportView,
      events: [{
        id: "report-event-1",
        reportId: "safety-report-1",
        actorRole: "client_user",
        actorReference: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        actionLabel: "Report submitted",
        notes: "This trust signal needs a closer review.",
        createdAt: "2026-05-21T12:00:00.000Z"
      }]
    });

    const response = await getReportDetail(new NextRequest("https://bvrb3r.test/api/architect/reports/safety-report-1"), {
      params: Promise.resolve({ reportId: "safety-report-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.id).toBe("safety-report-1");
    expect(body.events[0].actionLabel).toBe("Report submitted");
    expect(getArchitectReportDetailMock).toHaveBeenCalledWith(ARCHITECT_USER, "safety-report-1");
  });

  it("updates report status through the Architect-only patch route", async () => {
    updateArchitectReportStatusMock.mockResolvedValue({
      ok: true,
      available: true,
      viewer: {
        profileId: ARCHITECT_USER.id,
        fullName: ARCHITECT_USER.name,
        role: "platform_admin"
      },
      report: {
        ...reportView,
        status: "under_review",
        dbStatus: "under_review"
      },
      events: []
    });

    const response = await patchReport(new NextRequest("https://bvrb3r.test/api/architect/reports/safety-report-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "under_review" })
    }), {
      params: Promise.resolve({ reportId: "safety-report-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.status).toBe("under_review");
    expect(updateArchitectReportStatusMock).toHaveBeenCalledWith(ARCHITECT_USER, "safety-report-1", "under_review");
  });

  it("blocks non-architect users from listing reports", async () => {
    requireArchitectDebugAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Architect debug access is restricted to platform administrators." }, { status: 403 })
    });

    const response = await getReports();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/restricted/i);
    expect(listArchitectReportsMock).not.toHaveBeenCalled();
  });
});
