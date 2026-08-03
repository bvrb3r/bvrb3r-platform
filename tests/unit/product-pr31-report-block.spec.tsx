import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportBlockSheet } from "@/components/trust/report-block-sheet";
import { AccountPrivacyWorkspace } from "@/components/trust/account-privacy-workspace";
import {
  buildPr31ReportDetails,
  PR31_REPORT_REASON_OPTIONS,
  toPr27CultureCategory,
  toTrustReportCategory
} from "@/lib/trust/product-pr31-report-block";
import {
  ProductPr31BlockError,
  readSymmetricBlockedProfileIds
} from "@/lib/trust/product-pr31-blocks";
import {
  MessagingServiceError,
  readSymmetricMessagingBlockedProfileIds
} from "@/lib/messages/service";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: Record<string, unknown>, ok = true) {
  return {
    ok,
    json: async () => body
  } as Response;
}

function queryResult(result: { data: Array<Record<string, unknown>> | null; error: unknown }) {
  const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
  };
  return query;
}

describe("Product PR31 report and block controls", () => {
  it("keeps the six canonical reasons and deterministic legacy mappings", () => {
    expect(PR31_REPORT_REASON_OPTIONS.map((option) => option.value)).toEqual([
      "spam",
      "harassment",
      "unsafe_conduct",
      "fake_profile",
      "payment_scam",
      "other"
    ]);
    expect(toPr27CultureCategory("unsafe_conduct")).toBe("dangerous_services");
    expect(toPr27CultureCategory("payment_scam")).toBe("other");
    expect(toTrustReportCategory("payment_scam")).toBe("fraud");
    expect(buildPr31ReportDetails({
      reason: "fake_profile",
      source: "public_profile",
      evidenceDescription: "The identity photo belongs to someone else."
    })).toContain("PR31 reason: fake_profile");
  });

  it("submits a Culture case receipt and then blocks from the same shared sheet", async () => {
    const onBlocked = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ reference: "CUL-31AB", status: "received" }))
      .mockResolvedValueOnce(jsonResponse({ active: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReportBlockSheet
        targetProfileId="profile-target"
        targetLabel="Jordan"
        postId="post-31"
        source="culture_post"
        onBlocked={onBlocked}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByLabelText("Payment scam"));
    fireEvent.change(screen.getByLabelText(/Evidence description/i), {
      target: { value: "Requested payment away from BVRB3R." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText(/Reference CUL-31AB/i)).toBeInTheDocument();
    const reportRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/culture/safety-controls");
    expect(reportRequest).toMatchObject({
      action: "report",
      reportedProfileId: "profile-target",
      postId: "post-31",
      reason: "payment_scam",
      sourceSurface: "culture_post",
      evidenceDescription: "Requested payment away from BVRB3R."
    });

    fireEvent.click(screen.getByRole("button", { name: "Block account" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm block" }));
    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      action: "block",
      targetProfileId: "profile-target",
      active: true
    });
  });

  it("routes reported reviews into the existing trust moderation domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ report: { id: "report-review-31" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ReportBlockSheet
        reviewId="review-31"
        targetLabel="review"
        source="review"
        canBlock={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByLabelText("Fake profile"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText(/Reference report-review-31/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/trust/reports");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      subjectType: "review",
      subjectId: "review-31",
      category: "fake_profile"
    });
  });

  it("provides Settings Privacy recovery through unblock", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ active: false }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPrivacyWorkspace initial={{
      demo: false,
      firstName: "Phil",
      memberSince: "2024",
      visitCount: null,
      openBookingCount: 0,
      lifecycle: { status: "active", deletionGraceEndsAt: null, canRestore: false },
      exports: [],
      blockedAccounts: [{
        profileId: "profile-blocked",
        displayName: "Blocked Person",
        publicUsername: "blocked-person",
        blockedAt: "2026-08-03T00:00:00.000Z"
      }]
    }} />);

    expect(screen.getByText("Blocked Person")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(await screen.findByText(/Public discovery and messaging access are restored/i)).toBeInTheDocument();
    expect(screen.queryByText("Blocked Person")).not.toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "block",
      targetProfileId: "profile-blocked",
      active: false
    });
  });

  it("reads both block directions and fails closed on query error", async () => {
    const successfulClient = {
      from: vi.fn()
        .mockReturnValueOnce(queryResult({ data: [{ blocked_profile_id: "outgoing" }], error: null }))
        .mockReturnValueOnce(queryResult({ data: [{ blocker_profile_id: "incoming" }], error: null }))
    };
    await expect(readSymmetricBlockedProfileIds(successfulClient as never, "viewer"))
      .resolves.toEqual(new Set(["outgoing", "incoming"]));

    const failingClient = {
      from: vi.fn()
        .mockReturnValueOnce(queryResult({ data: null, error: { message: "relation unavailable" } }))
        .mockReturnValueOnce(queryResult({ data: [], error: null }))
    };
    await expect(readSymmetricBlockedProfileIds(failingClient as never, "viewer"))
      .rejects.toBeInstanceOf(ProductPr31BlockError);
  });

  it("combines message and Culture blocks symmetrically for messaging", async () => {
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(queryResult({ data: [{ blocked_profile_id: "message-out" }], error: null }))
        .mockReturnValueOnce(queryResult({ data: [{ blocker_profile_id: "message-in" }], error: null }))
        .mockReturnValueOnce(queryResult({ data: [{ blocked_profile_id: "culture-out" }], error: null }))
        .mockReturnValueOnce(queryResult({ data: [{ blocker_profile_id: "culture-in" }], error: null }))
    };
    await expect(readSymmetricMessagingBlockedProfileIds(client as never, "viewer"))
      .resolves.toEqual(new Set(["message-out", "message-in", "culture-out", "culture-in"]));

    const failingClient = {
      from: vi.fn()
        .mockReturnValueOnce(queryResult({ data: [], error: null }))
        .mockReturnValueOnce(queryResult({ data: [], error: null }))
        .mockReturnValueOnce(queryResult({ data: null, error: { message: "Culture block lookup failed" } }))
        .mockReturnValueOnce(queryResult({ data: [], error: null }))
    };
    await expect(readSymmetricMessagingBlockedProfileIds(failingClient as never, "viewer"))
      .rejects.toBeInstanceOf(MessagingServiceError);
  });
});
