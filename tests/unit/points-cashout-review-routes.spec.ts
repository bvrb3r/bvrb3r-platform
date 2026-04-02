import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  markCashoutRequestUnderReviewMock,
  approveCashoutRequestMock,
  rejectCashoutRequestMock,
  markCashoutRequestPaidMock,
  markCashoutRequestFailedMock,
  reverseCashoutRequestMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  markCashoutRequestUnderReviewMock: vi.fn(),
  approveCashoutRequestMock: vi.fn(),
  rejectCashoutRequestMock: vi.fn(),
  markCashoutRequestPaidMock: vi.fn(),
  markCashoutRequestFailedMock: vi.fn(),
  reverseCashoutRequestMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/points/cashout-review", () => ({
  markCashoutRequestUnderReview: markCashoutRequestUnderReviewMock,
  approveCashoutRequest: approveCashoutRequestMock,
  rejectCashoutRequest: rejectCashoutRequestMock,
  markCashoutRequestPaid: markCashoutRequestPaidMock,
  markCashoutRequestFailed: markCashoutRequestFailedMock,
  reverseCashoutRequest: reverseCashoutRequestMock
}));

import { POST as postReviewCashout } from "@/app/api/points/cashout/review/route";
import { POST as postApproveCashout } from "@/app/api/points/cashout/approve/route";
import { POST as postRejectCashout } from "@/app/api/points/cashout/reject/route";
import { POST as postMarkPaidCashout } from "@/app/api/points/cashout/mark-paid/route";
import { POST as postMarkFailedCashout } from "@/app/api/points/cashout/mark-failed/route";
import { POST as postReverseCashout } from "@/app/api/points/cashout/reverse/route";

describe("points cashout review routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    markCashoutRequestUnderReviewMock.mockReset();
    approveCashoutRequestMock.mockReset();
    rejectCashoutRequestMock.mockReset();
    markCashoutRequestPaidMock.mockReset();
    markCashoutRequestFailedMock.mockReset();
    reverseCashoutRequestMock.mockReset();

    getSessionUserMock.mockResolvedValue({
      id: "user-owner",
      role: "owner",
      email: "owner@bvrb3r.demo"
    });
  });

  it("blocks non-owner review actions", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-manager",
      role: "manager",
      email: "manager@bvrb3r.demo"
    });

    const response = await postReviewCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout/review", {
      method: "POST",
      body: JSON.stringify({ requestId: "cashout-1" })
    }));

    expect(response.status).toBe(403);
  });

  it("marks a request under review with fraud flags", async () => {
    markCashoutRequestUnderReviewMock.mockResolvedValue({
      id: "cashout-1",
      status: "under_review"
    });

    const response = await postReviewCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout/review", {
      method: "POST",
      body: JSON.stringify({
        requestId: "cashout-1",
        note: "Checking Stripe readiness.",
        fraudFlags: ["manual_review"]
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(markCashoutRequestUnderReviewMock).toHaveBeenCalledWith({
      requestId: "cashout-1",
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Checking Stripe readiness.",
      fraudFlags: ["manual_review"]
    });
    expect(body.cashout.status).toBe("under_review");
  });

  it("approves a cash-out request", async () => {
    approveCashoutRequestMock.mockResolvedValue({
      id: "cashout-2",
      status: "approved"
    });

    const response = await postApproveCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout/approve", {
      method: "POST",
      body: JSON.stringify({
        requestId: "cashout-2",
        note: "Approved from finance review."
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(approveCashoutRequestMock).toHaveBeenCalledWith({
      requestId: "cashout-2",
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Approved from finance review."
    });
    expect(body.cashout.status).toBe("approved");
  });

  it("returns safe route errors when rejecting a request fails", async () => {
    rejectCashoutRequestMock.mockRejectedValue(new Error("Cash-out request cannot move from paid to rejected."));

    const response = await postRejectCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout/reject", {
      method: "POST",
      body: JSON.stringify({
        requestId: "cashout-3",
        note: "Rejecting after review."
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/cannot move/i);
  });

  it("allows owner or manager payout completion actions where appropriate", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-manager",
      role: "manager",
      email: "manager@bvrb3r.demo"
    });
    markCashoutRequestPaidMock.mockResolvedValue({
      id: "cashout-4",
      status: "paid"
    });
    markCashoutRequestFailedMock.mockResolvedValue({
      id: "cashout-5",
      status: "failed"
    });

    const [paidResponse, failedResponse] = await Promise.all([
      postMarkPaidCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout/mark-paid", {
        method: "POST",
        body: JSON.stringify({ requestId: "cashout-4", payoutReference: "manual-cashout-4" })
      })),
      postMarkFailedCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout/mark-failed", {
        method: "POST",
        body: JSON.stringify({ requestId: "cashout-5", note: "Transfer failure." })
      }))
    ]);

    expect(paidResponse.status).toBe(200);
    expect(failedResponse.status).toBe(200);
    expect(markCashoutRequestPaidMock).toHaveBeenCalledWith({
      requestId: "cashout-4",
      actorUserId: "user-manager",
      actorRole: "manager",
      note: undefined,
      payoutReference: "manual-cashout-4"
    });
    expect(markCashoutRequestFailedMock).toHaveBeenCalledWith({
      requestId: "cashout-5",
      actorUserId: "user-manager",
      actorRole: "manager",
      note: "Transfer failure.",
      payoutReference: undefined,
      fraudFlags: undefined
    });
  });

  it("keeps reversal owner-only", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-manager",
      role: "manager",
      email: "manager@bvrb3r.demo"
    });

    const forbiddenResponse = await postReverseCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout/reverse", {
      method: "POST",
      body: JSON.stringify({ requestId: "cashout-6" })
    }));
    expect(forbiddenResponse.status).toBe(403);

    getSessionUserMock.mockResolvedValue({
      id: "user-owner",
      role: "owner",
      email: "owner@bvrb3r.demo"
    });
    reverseCashoutRequestMock.mockResolvedValue({
      id: "cashout-6",
      status: "reversed"
    });

    const ownerResponse = await postReverseCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout/reverse", {
      method: "POST",
      body: JSON.stringify({ requestId: "cashout-6", note: "Reverse after finance correction." })
    }));
    expect(ownerResponse.status).toBe(200);
    expect(reverseCashoutRequestMock).toHaveBeenCalledWith({
      requestId: "cashout-6",
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Reverse after finance correction.",
      payoutReference: undefined
    });
  });
});
