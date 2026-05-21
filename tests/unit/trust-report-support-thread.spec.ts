import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  requireTrustActorMock,
  getSessionUserMock,
  getTrustProviderMock,
  appendTrustReportToSupportThreadMock,
  createSupabaseAdminClientMock
} = vi.hoisted(() => ({
  requireTrustActorMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getTrustProviderMock: vi.fn(),
  appendTrustReportToSupportThreadMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/trust/auth", () => ({
  requireTrustActor: requireTrustActorMock
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/trust/provider", () => ({
  getTrustProvider: getTrustProviderMock
}));

vi.mock("@/lib/messages/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/messages/service")>("@/lib/messages/service");
  return {
    ...actual,
    appendTrustReportToSupportThread: appendTrustReportToSupportThreadMock
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { POST as submitReport } from "@/app/api/trust/reports/route";

const reportPayload = {
  subjectType: "barber",
  subjectId: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
  category: "fake_profile",
  details: "This trust signal needs a closer review."
};

class FakeQueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];

  constructor(private readonly rows: Array<Record<string, unknown>>) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.rows.find((row) => this.filters.every((filter) => row[filter.column] === filter.value)) ?? null,
      error: null
    });
  }
}

function createSupabaseMock(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      return new FakeQueryBuilder(tables[table] ?? []);
    }
  };
}

describe("trust report support thread handoff", () => {
  beforeEach(() => {
    requireTrustActorMock.mockReset();
    getSessionUserMock.mockReset();
    getTrustProviderMock.mockReset();
    appendTrustReportToSupportThreadMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue(null);
    requireTrustActorMock.mockResolvedValue({
      role: "client_user",
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
      userEmail: "phillipmcgeeclient@outlook.com",
      locationIds: []
    });
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    getTrustProviderMock.mockResolvedValue({
      submitSafetyReport: vi.fn().mockResolvedValue({
        report: {
          id: "safety-report-1",
          createdAt: "2026-05-20T15:00:00.000Z"
        }
      })
    });
  });

  it("creates a support thread message when a client submits a barber report", async () => {
    appendTrustReportToSupportThreadMock.mockResolvedValue({
      threadId: "thread-support-1",
      messageId: "message-report-1",
      createdAt: "2026-05-20T15:00:00.000Z"
    });

    const response = await submitReport(new NextRequest("https://bvrb3r.test/api/trust/reports", {
      method: "POST",
      body: JSON.stringify(reportPayload)
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.id).toBe("safety-report-1");
    expect(body.supportThread.id).toBe("thread-support-1");
    expect(body.supportMessage.id).toBe("message-report-1");
    expect(appendTrustReportToSupportThreadMock).toHaveBeenCalledWith(expect.anything(), {
      reportId: "safety-report-1",
      subjectType: "barber",
      subjectId: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
      category: "fake_profile",
      details: "This trust signal needs a closer review.",
      createdAt: "2026-05-20T15:00:00.000Z"
    });
  });

  it("keeps the trust report successful when the support message needs review", async () => {
    appendTrustReportToSupportThreadMock.mockRejectedValue(new Error("support write failed"));

    const response = await submitReport(new NextRequest("https://bvrb3r.test/api/trust/reports", {
      method: "POST",
      body: JSON.stringify(reportPayload)
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.id).toBe("safety-report-1");
    expect(body.supportThread).toBeNull();
    expect(body.warning).toMatch(/support thread/i);
  });

  it("canonicalizes a public barber reference before storing the safety report", async () => {
    const submitSafetyReport = vi.fn().mockResolvedValue({
      report: {
        id: "safety-report-1",
        createdAt: "2026-05-20T15:00:00.000Z"
      }
    });
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      barbers: [{
        id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        profile_id: "43b3cda2-3fe0-4632-95bb-56c005b5a3cf",
        reference_code: "barber-43b3cda2",
        booking_slug: "barber-43b3cda2"
      }],
      barber_profiles: [],
      profiles: [{
        id: "43b3cda2-3fe0-4632-95bb-56c005b5a3cf",
        full_name: "Phillip mcgee",
        email: "phillipmcgee813@gmail.com"
      }]
    }));
    getTrustProviderMock.mockResolvedValue({ submitSafetyReport });
    appendTrustReportToSupportThreadMock.mockResolvedValue({
      threadId: "thread-support-1",
      messageId: "message-report-1",
      createdAt: "2026-05-20T15:00:00.000Z"
    });

    const response = await submitReport(new NextRequest("https://bvrb3r.test/api/trust/reports", {
      method: "POST",
      body: JSON.stringify({
        ...reportPayload,
        subjectId: "barber-43b3cda2"
      })
    }));

    expect(response.status).toBe(200);
    expect(submitSafetyReport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      subjectType: "barber",
      subjectId: "455c2930-7255-418b-bd2b-cc64bc0fc9b7"
    }));
    expect(appendTrustReportToSupportThreadMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      subjectId: "455c2930-7255-418b-bd2b-cc64bc0fc9b7"
    }));
  });
});
