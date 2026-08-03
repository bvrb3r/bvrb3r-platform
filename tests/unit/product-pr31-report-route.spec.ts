import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  submitReport: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: mocks.getSessionUser
}));

vi.mock("@/lib/trust/product-pr27-service", () => ({
  ProductPr27ServiceError: class ProductPr27ServiceError extends Error {
    status = 400;
    code = "test_error";
  },
  getPr27CultureSafetySnapshot: vi.fn(),
  moderatePr27CultureCase: vi.fn(),
  resolvePr27CultureAppeal: vi.fn(),
  setPr27CultureBlock: vi.fn(),
  setPr27CultureMute: vi.fn(),
  submitPr27CultureAppeal: vi.fn(),
  submitPr27CultureReport: mocks.submitReport
}));

import { POST } from "@/app/api/culture/safety-controls/route";

describe("Product PR31 canonical Culture report route", () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset();
    mocks.submitReport.mockReset();
    mocks.getSessionUser.mockResolvedValue({ id: "reporter-profile" });
    mocks.submitReport.mockResolvedValue({
      reference: "CUL-PR31",
      status: "received",
      autoHidden: false
    });
  });

  it("preserves the exact canonical reason in existing case details", async () => {
    const response = await POST(new Request("https://bvrb3r.test/api/culture/safety-controls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "report",
        reportedProfileId: "target-profile",
        postId: "post-31",
        reason: "payment_scam",
        evidenceDescription: "Asked for a wire transfer.",
        sourceSurface: "culture_post"
      })
    }));

    expect(response.status).toBe(201);
    expect(mocks.submitReport).toHaveBeenCalledWith(
      { id: "reporter-profile" },
      {
        reportedProfileId: "target-profile",
        postId: "post-31",
        category: "other",
        details: [
          "PR31 reason: payment_scam",
          "Source surface: culture_post",
          "Evidence description: Asked for a wire transfer."
        ].join("\n")
      }
    );
  });

  it("rejects a report without either the canonical or legacy reason contract", async () => {
    const response = await POST(new Request("https://bvrb3r.test/api/culture/safety-controls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "report",
        reportedProfileId: "target-profile"
      })
    }));

    expect(response.status).toBe(400);
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });
});
