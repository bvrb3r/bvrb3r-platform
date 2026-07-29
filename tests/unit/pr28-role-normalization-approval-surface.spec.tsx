import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const {
  getCurrentUserFromServerMock,
  createSupabaseAdminClientMock,
  readArchitectDebugEnvironmentMock,
  fetchMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  readArchitectDebugEnvironmentMock: vi.fn(),
  fetchMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/architect/debug/env", () => ({
  readArchitectDebugEnvironment: readArchitectDebugEnvironmentMock
}));

import {
  GET as getApprovalStatus,
  POST as postApprovalEvidence
} from "@/app/api/architect/role-normalization-approval/route";
import { RoleNormalizationApprovalSurface } from "@/components/architect/role-normalization-approval-surface";

const COMMIT_SHA = "2bea82e383e76bcab07b28eb53226c91d05241d3";
const ACTOR_ID = "981baab1-1042-4f3a-b6aa-b79371040293";
const IDEMPOTENCY_KEY = "d89f0306-a7bd-4670-a51f-f19bd053a5dc";

function createStatus(state: "pending" | "approved" | "rejected" = "pending") {
  const evidencePresent = state !== "pending";
  return {
    schemaVersion: 1,
    package: "PR27_PRODUCTION_ROLE_NORMALIZATION_APPROVAL_EVIDENCE",
    planVersion: "role-normalization-v1",
    approvalState: state,
    approvalEvidencePresent: evidencePresent,
    evidenceCount: evidencePresent ? 1 : 0,
    approvedCount: state === "approved" ? 1 : 0,
    rejectedCount: state === "rejected" ? 1 : 0,
    latestDecision: evidencePresent ? state : null,
    latestProductionCommitSha: evidencePresent ? COMMIT_SHA : null,
    latestRecordedAt: evidencePresent ? "2026-07-29T01:00:00.000Z" : null,
    approvalRequired: true,
    executionEnabled: false,
    roleMutationExecuted: false,
    actorContentExposed: false,
    approvalPacket: {
      schemaVersion: 1,
      package: "PR26_ROLE_NORMALIZATION_DRY_RUN",
      planVersion: "role-normalization-v1",
      generatedFor: "approval_review",
      approvalRequired: true,
      executionEnabled: false,
      rawMutationExecuted: false,
      publicOutputRedacted: true,
      rowsIncluded: false,
      profileContentExposed: false,
      relationshipMutationAttempted: false,
      totalProfilesInspected: 27,
      totalAffectedCount: 0,
      eligibleCount: 0,
      blockedCount: 0,
      manualReviewCount: 0,
      noOpCount: 27,
      affectedCount: 0,
      currentRoleCounts: { client_user: 20, barber_user: 6, shop_owner_user: 1 },
      proposedRoleCounts: { client_user: 20, barber_user: 6, shop_owner_user: 1 },
      decisionCounts: { no_op: 27 },
      canonicalOutputOnly: true,
      rollbackPacketPresent: true,
      checkCount: 10,
      passedCount: 10,
      certifiable: true
    }
  } as const;
}

function authenticateOperator() {
  getCurrentUserFromServerMock.mockResolvedValue({
    authenticated: true,
    mode: "supabase",
    user: makePlatformAdminUser({ id: ACTOR_ID })
  });
}

describe("PR28 authenticated role-normalization approval API", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    readArchitectDebugEnvironmentMock.mockReset();
    fetchMock.mockReset();
    readArchitectDebugEnvironmentMock.mockReturnValue({
      appEnv: "preview",
      commitHash: COMMIT_SHA,
      deploymentId: "dpl_pr28"
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => IDEMPOTENCY_KEY });
  });

  it("fails closed for anonymous and ordinary authenticated users before creating an admin client", async () => {
    getCurrentUserFromServerMock.mockResolvedValueOnce({
      authenticated: false,
      mode: "supabase",
      user: { id: "guest-user", role: "client_user", accountStatus: "profile_only" }
    });

    expect((await getApprovalStatus()).status).toBe(401);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();

    getCurrentUserFromServerMock.mockResolvedValueOnce({
      authenticated: true,
      mode: "supabase",
      user: { id: ACTOR_ID, role: "client_user", accountStatus: "active" }
    });

    expect((await getApprovalStatus()).status).toBe(403);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns only the validated redacted aggregate status", async () => {
    authenticateOperator();
    const rpc = vi.fn().mockResolvedValue({ data: {
      ...createStatus(),
      privateActor: "must be stripped",
      approvalPacket: {
        ...createStatus().approvalPacket,
        profileRows: ["must be stripped"]
      }
    }, error: null });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const response = await getApprovalStatus();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status.approvalState).toBe("pending");
    expect(body.status.approvalPacket.totalProfilesInspected).toBe(27);
    expect(JSON.stringify(body)).not.toContain("privateActor");
    expect(JSON.stringify(body)).not.toContain("profileRows");
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("rejects cross-origin writes before creating an admin client", async () => {
    authenticateOperator();

    const response = await postApprovalEvidence(new NextRequest(
      "https://bvrb3r.test/api/architect/role-normalization-approval",
      {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          "sec-fetch-site": "cross-site",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          decision: "approved",
          idempotencyKey: IDEMPOTENCY_KEY,
          reason: "Certified aggregate evidence is ready.",
          confirmation: "APPROVE ROLE NORMALIZATION PLAN"
        })
      }
    ));

    expect(response.status).toBe(403);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("records one same-origin decision with server actor and deployment SHA, then verifies it", async () => {
    authenticateOperator();
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: createStatus(), error: null })
      .mockResolvedValueOnce({ data: { evidenceRecorded: true }, error: null })
      .mockResolvedValueOnce({ data: createStatus("approved"), error: null });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const response = await postApprovalEvidence(new NextRequest(
      "https://bvrb3r.test/api/architect/role-normalization-approval",
      {
        method: "POST",
        headers: {
          origin: "https://bvrb3r.test",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          decision: "approved",
          idempotencyKey: IDEMPOTENCY_KEY,
          reason: "Certified aggregate evidence is ready.",
          confirmation: "APPROVE ROLE NORMALIZATION PLAN"
        })
      }
    ));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status.approvalState).toBe("approved");
    expect(body.status.roleMutationExecuted).toBe(false);
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "bvrb3r_pr27_record_role_normalization_approval_evidence",
      {
        p_idempotency_key: IDEMPOTENCY_KEY,
        p_decision: "approved",
        p_actor_user_id: ACTOR_ID,
        p_actor_role: "internal_operator",
        p_production_commit_sha: COMMIT_SHA,
        p_reason: "Certified aggregate evidence is ready."
      }
    );
    expect(JSON.stringify(body)).not.toContain(ACTOR_ID);
    expect(JSON.stringify(body)).not.toContain("Certified aggregate evidence is ready.");
  });

  it("refuses a second decision after evidence exists", async () => {
    authenticateOperator();
    const rpc = vi.fn().mockResolvedValue({ data: createStatus("approved"), error: null });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const response = await postApprovalEvidence(new NextRequest(
      "https://bvrb3r.test/api/architect/role-normalization-approval",
      {
        method: "POST",
        headers: {
          origin: "https://bvrb3r.test",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          decision: "rejected",
          idempotencyKey: IDEMPOTENCY_KEY,
          reason: "This second decision must remain blocked.",
          confirmation: "REJECT ROLE NORMALIZATION PLAN"
        })
      }
    ));

    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("PR28 authenticated approval surface", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => IDEMPOTENCY_KEY });
  });

  it("requires an exact confirmation and shows the immutable result without claiming execution", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, status: createStatus(), surfaceCommitSha: COMMIT_SHA })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, status: createStatus("approved"), surfaceCommitSha: COMMIT_SHA })
      });

    render(<RoleNormalizationApprovalSurface />);

    expect((await screen.findAllByText("27")).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole("button", { name: /approve plan evidence/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /decision reason/i }), {
      target: { value: "Certified aggregate evidence is ready." }
    });

    const submit = screen.getByRole("button", { name: /record approved evidence/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: /exact confirmation/i }), {
      target: { value: "APPROVE ROLE NORMALIZATION PLAN" }
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByTestId("approval-recorded")).toHaveTextContent("Approval recorded"));
    expect(screen.getByTestId("approval-recorded")).toHaveTextContent("no role mutation was executed");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/architect/role-normalization-approval",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: expect.stringContaining(IDEMPOTENCY_KEY)
      })
    );
  });
});
