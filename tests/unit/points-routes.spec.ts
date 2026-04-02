import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  getPointsScopeForUserMock,
  readPointsBalanceForScopeMock,
  readPointsHistoryForScopeMock,
  readPointsCampaignsForRoleMock,
  commitPointsRedemptionMock,
  requestPointsCashoutMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  getPointsScopeForUserMock: vi.fn(),
  readPointsBalanceForScopeMock: vi.fn(),
  readPointsHistoryForScopeMock: vi.fn(),
  readPointsCampaignsForRoleMock: vi.fn(),
  commitPointsRedemptionMock: vi.fn(),
  requestPointsCashoutMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/points/engine", () => ({
  getPointsScopeForUser: getPointsScopeForUserMock,
  readPointsBalanceForScope: readPointsBalanceForScopeMock,
  readPointsHistoryForScope: readPointsHistoryForScopeMock,
  readPointsCampaignsForRole: readPointsCampaignsForRoleMock,
  commitPointsRedemption: commitPointsRedemptionMock,
  requestPointsCashout: requestPointsCashoutMock
}));

import { GET as getPointsBalance } from "@/app/api/points/balance/route";
import { GET as getPointsHistory } from "@/app/api/points/history/route";
import { GET as getPointsCampaigns } from "@/app/api/points/campaigns/route";
import { POST as postPointsRedeem } from "@/app/api/points/redeem/route";
import { POST as postPointsCashout } from "@/app/api/points/cashout/route";

describe("points routes", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    getPointsScopeForUserMock.mockReset();
    readPointsBalanceForScopeMock.mockReset();
    readPointsHistoryForScopeMock.mockReset();
    readPointsCampaignsForRoleMock.mockReset();
    commitPointsRedemptionMock.mockReset();
    requestPointsCashoutMock.mockReset();

    getCurrentUserFromServerMock.mockResolvedValue({
      user: {
        id: "user-client",
        role: "client",
        email: "client@bvrb3r.demo"
      }
    });
    getPointsScopeForUserMock.mockReturnValue({
      userId: "user-client",
      role: "client"
    });
  });

  it("blocks points access for unsupported roles", async () => {
    getPointsScopeForUserMock.mockReturnValue(null);

    const response = await getPointsBalance();

    expect(response.status).toBe(403);
  });

  it("returns balance, history, and campaigns for supported points roles", async () => {
    readPointsBalanceForScopeMock.mockResolvedValue({
      unlockedPoints: 60,
      explanation: {
        progressLabel: "40 pts until $10.00 in-app value.",
        progressPercent: 60
      }
    });
    readPointsHistoryForScopeMock.mockResolvedValue({
      balance: {
        unlockedPoints: 60,
        explanation: {
          progressLabel: "40 pts until $10.00 in-app value.",
          progressPercent: 60
        }
      },
      transactions: [],
      eligibilitySnapshots: [],
      cashoutRequests: [],
      activity: [
        {
          id: "activity-1",
          title: "Completed booking",
          detail: "Closed-loop validation cleared and the reward was written to the ledger.",
          amountLabel: "+8 pts",
          statusLabel: "pending"
        }
      ]
    });
    readPointsCampaignsForRoleMock.mockResolvedValue({
      campaigns: [{ id: "campaign-referral-boost" }],
      activeCampaigns: [{ id: "campaign-referral-boost" }]
    });

    const [balanceResponse, historyResponse, campaignsResponse] = await Promise.all([
      getPointsBalance(),
      getPointsHistory(),
      getPointsCampaigns()
    ]);
    const balanceBody = await balanceResponse.json();
    const historyBody = await historyResponse.json();
    const campaignsBody = await campaignsResponse.json();

    expect(balanceResponse.status).toBe(200);
    expect(historyResponse.status).toBe(200);
    expect(campaignsResponse.status).toBe(200);
    expect(balanceBody.balance.unlockedPoints).toBe(60);
    expect(balanceBody.balance.explanation.progressLabel).toContain("pts until");
    expect(historyBody.history.transactions).toEqual([]);
    expect(historyBody.history.activity).toHaveLength(1);
    expect(campaignsBody.campaigns.activeCampaigns).toHaveLength(1);
  });

  it("rejects redemption purposes that do not match the caller role", async () => {
    const response = await postPointsRedeem(new NextRequest("https://bvrb3r.demo/api/points/redeem", {
      method: "POST",
      body: JSON.stringify({
        purpose: "campaign_credit",
        requestedPoints: 25,
        orderTotal: 50,
        sourceId: "campaign-credit-1"
      })
    }));

    expect(response.status).toBe(403);
    expect(commitPointsRedemptionMock).not.toHaveBeenCalled();
  });

  it("allows owners to redeem points into subscription credits", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      user: {
        id: "user-owner",
        role: "owner",
        email: "owner@bvrb3r.demo"
      }
    });
    getPointsScopeForUserMock.mockReturnValue({
      userId: "user-owner",
      role: "owner"
    });
    commitPointsRedemptionMock.mockResolvedValue({
      preview: {
        approvedPoints: 40
      }
    });

    const response = await postPointsRedeem(new NextRequest("https://bvrb3r.demo/api/points/redeem", {
      method: "POST",
      body: JSON.stringify({
        purpose: "subscription_credit",
        requestedPoints: 40,
        orderTotal: 20,
        sourceId: "shop-subscription-credit-1"
      })
    }));

    expect(response.status).toBe(200);
    expect(commitPointsRedemptionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-owner",
      role: "owner",
      purpose: "subscription_credit"
    }));
  });

  it("submits cash-out requests only for eligible barber or owner roles", async () => {
    const forbiddenResponse = await postPointsCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout", {
      method: "POST",
      body: JSON.stringify({
        requestedPoints: 50
      })
    }));

    expect(forbiddenResponse.status).toBe(403);

    getCurrentUserFromServerMock.mockResolvedValue({
      user: {
        id: "user-blaze",
        role: "commission_barber",
        email: "blaze@bvrb3r.demo"
      }
    });
    getPointsScopeForUserMock.mockReturnValue({
      userId: "user-blaze",
      role: "barber"
    });
    requestPointsCashoutMock.mockResolvedValue({
      request: {
        id: "cashout-1",
        pointsRequested: 50,
        cashValue: 3.5
      }
    });

    const response = await postPointsCashout(new NextRequest("https://bvrb3r.demo/api/points/cashout", {
      method: "POST",
      body: JSON.stringify({
        requestedPoints: 50
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestPointsCashoutMock).toHaveBeenCalledWith({
      userId: "user-blaze",
      role: "barber",
      requestedPoints: 50,
      metadata: {
        requestedBy: "blaze@bvrb3r.demo"
      }
    });
    expect(body.cashout.request.cashValue).toBe(3.5);
  });
});
