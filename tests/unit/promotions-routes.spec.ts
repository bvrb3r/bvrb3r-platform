import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { PromotionServiceError } from "@/lib/promotions/service";

const {
  getSessionUserMock,
  getClientExperienceContextMock,
  listPromotionsForManagementMock,
  createPromotionMock,
  updatePromotionMock,
  previewPromotionApplicationMock,
  listClientPromotionsMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getClientExperienceContextMock: vi.fn(),
  listPromotionsForManagementMock: vi.fn(),
  createPromotionMock: vi.fn(),
  updatePromotionMock: vi.fn(),
  previewPromotionApplicationMock: vi.fn(),
  listClientPromotionsMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/promotions/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/promotions/service")>("@/lib/promotions/service");
  return {
    ...actual,
    listPromotionsForManagement: listPromotionsForManagementMock,
    createPromotion: createPromotionMock,
    updatePromotion: updatePromotionMock,
    previewPromotionApplication: previewPromotionApplicationMock,
    listClientPromotions: listClientPromotionsMock
  };
});

import { GET as getPromotions, POST as postPromotion } from "@/app/api/promotions/route";
import { PATCH as patchPromotion } from "@/app/api/promotions/[id]/route";
import { POST as postPromotionApply } from "@/app/api/promotions/apply/route";
import { GET as getClientPromotions } from "@/app/api/client/promotions/route";

describe("phase 12 promotions routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getClientExperienceContextMock.mockReset();
    listPromotionsForManagementMock.mockReset();
    createPromotionMock.mockReset();
    updatePromotionMock.mockReset();
    previewPromotionApplicationMock.mockReset();
    listClientPromotionsMock.mockReset();
  });

  it("returns the promotions management payload for an authorized role", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    listPromotionsForManagementMock.mockResolvedValue({
      shops: [{ id: "loc-ybor", label: "BVRB3R Ybor / Ybor City / Tampa" }],
      services: [],
      barbers: [],
      promotions: []
    });

    const response = await getPromotions();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.shops)).toBe(true);
  });

  it("rejects invalid promotion creation payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/promotions", {
      method: "POST",
      body: JSON.stringify({ name: "Promo" })
    });

    const response = await postPromotion(request);

    expect(response.status).toBe(400);
  });

  it("creates a promotion with a stable response shape", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    createPromotionMock.mockResolvedValue({
      promotion: {
        id: "promo-1",
        shopId: "loc-ybor",
        shopLabel: "BVRB3R Ybor / Ybor City / Tampa",
        name: "Fresh Friday",
        code: "FRESH15",
        promotionType: "code",
        discountType: "percent",
        discountValue: 15,
        appliesToScope: "booking",
        usageCount: 0,
        availabilityState: "active",
        startsAt: "2026-03-20T10:00:00.000Z",
        endsAt: "2026-03-27T10:00:00.000Z",
        isActive: true,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:00:00.000Z"
      }
    });

    const request = new NextRequest("https://bvrb3r.demo/api/promotions", {
      method: "POST",
      body: JSON.stringify({
        shopId: "loc-ybor",
        name: "Fresh Friday",
        code: "FRESH15",
        promotionType: "code",
        discountType: "percent",
        discountValue: 15,
        appliesToScope: "booking",
        startsAt: "2026-03-20T10:00:00.000Z",
        endsAt: "2026-03-27T10:00:00.000Z"
      })
    });

    const response = await postPromotion(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.promotion.name).toBe("Fresh Friday");
  });

  it("propagates role-safe management errors", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    updatePromotionMock.mockRejectedValue(new PromotionServiceError("This promotion is outside the viewer's shop scope.", 403));

    const response = await patchPromotion(new NextRequest("https://bvrb3r.demo/api/promotions/promo-1", {
      method: "PATCH",
      body: JSON.stringify({ isActive: false })
    }), {
      params: Promise.resolve({ id: "promo-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/shop scope/i);
  });

  it("rejects invalid promotion apply payloads", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: resolveDemoUser("client@bvrb3r.demo"),
      activeClient: resolveDemoUser("client@bvrb3r.demo"),
      clientId: "client-jordan",
      isSignedInClient: true
    });

    const response = await postPromotionApply(new NextRequest("https://bvrb3r.demo/api/promotions/apply", {
      method: "POST",
      body: JSON.stringify({ promotionCode: "FRESH15" })
    }));

    expect(response.status).toBe(400);
  });

  it("returns a typed promotion preview for an eligible booking", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: resolveDemoUser("client@bvrb3r.demo"),
      activeClient: resolveDemoUser("client@bvrb3r.demo"),
      clientId: "client-jordan",
      isSignedInClient: true
    });
    previewPromotionApplicationMock.mockResolvedValue({
      promotion: {
        id: "promo-1",
        name: "Fresh Friday",
        code: "FRESH15",
        promotionType: "code",
        discountType: "percent",
        discountValue: 15,
        appliesToScope: "booking",
        shopId: "loc-ybor",
        shopLabel: "BVRB3R Ybor / Ybor City / Tampa",
        availabilityState: "active",
        startsAt: "2026-03-20T10:00:00.000Z",
        endsAt: "2026-03-27T10:00:00.000Z",
        estimatedDiscount: 8.25
      },
      quote: {
        serviceTotal: 55,
        addOnTotal: 0,
        subtotal: 55,
        discountTotal: 8.25,
        taxTotal: 3.51,
        grandTotal: 50.26,
        depositDue: 15,
        balanceDue: 35.26,
        totalDurationMinutes: 70
      }
    });

    const response = await postPromotionApply(new NextRequest("https://bvrb3r.demo/api/promotions/apply", {
      method: "POST",
      body: JSON.stringify({
        shopId: "loc-ybor",
        serviceId: "srv-signature",
        addOnIds: [],
        promotionCode: "FRESH15"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quote.discountTotal).toBe(8.25);
    expect(body.promotion.code).toBe("FRESH15");
  });

  it("returns client-safe promotion discovery", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: resolveDemoUser("client@bvrb3r.demo"),
      activeClient: resolveDemoUser("client@bvrb3r.demo"),
      clientId: "client-jordan",
      isSignedInClient: true
    });
    listClientPromotionsMock.mockResolvedValue({
      promotions: [
        {
          id: "promo-1",
          name: "Fresh Friday",
          code: "FRESH15",
          promotionType: "code",
          discountType: "percent",
          discountValue: 15,
          appliesToScope: "booking",
          shopId: "loc-ybor",
          shopLabel: "BVRB3R Ybor / Ybor City / Tampa",
          availabilityState: "active",
          startsAt: "2026-03-20T10:00:00.000Z",
          endsAt: "2026-03-27T10:00:00.000Z",
          estimatedDiscount: 8.25
        }
      ],
      quote: {
        serviceTotal: 55,
        addOnTotal: 0,
        subtotal: 55,
        discountTotal: 0,
        taxTotal: 4.13,
        grandTotal: 59.13,
        depositDue: 15,
        balanceDue: 44.13,
        totalDurationMinutes: 70
      }
    });

    const response = await getClientPromotions(new NextRequest("https://bvrb3r.demo/api/client/promotions?shopId=loc-ybor&serviceId=srv-signature"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.promotions[0].name).toBe("Fresh Friday");
    expect(body.quote.subtotal).toBe(55);
  });
});
