import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  submitClientReviewMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  submitClientReviewMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/booking/platform-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/booking/platform-service")>("@/lib/booking/platform-service");
  return {
    ...actual,
    submitClientReview: submitClientReviewMock
  };
});

import { POST as postClientReview } from "@/app/api/client/reviews/route";
import { ClientReviewError } from "@/lib/booking/platform-service";

describe("client review route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    submitClientReviewMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "client",
        email: "client@bvrb3r.demo"
      },
      clientId: "client-jordan",
      isSignedInClient: true
    });
  });

  it("rejects non-client access", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "owner",
        email: "owner@bvrb3r.demo"
      },
      clientId: "client-jordan",
      isSignedInClient: false
    });

    const response = await postClientReview(new Request("http://localhost:3000/api/client/reviews", {
      method: "POST",
      body: JSON.stringify({
        appointmentId: "appt-4",
        rating: 5,
        message: "Excellent visit."
      })
    }));

    expect(response.status).toBe(403);
  });

  it("rejects invalid payloads", async () => {
    const response = await postClientReview(new Request("http://localhost:3000/api/client/reviews", {
      method: "POST",
      body: JSON.stringify({
        appointmentId: "",
        rating: 6
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid review payload/i);
  });

  it("submits a completed-appointment review for the signed-in client", async () => {
    submitClientReviewMock.mockResolvedValue({
      review: {
        id: "review-9",
        rating: 5,
        message: "Excellent visit.",
        createdAt: "2026-03-24T11:00:00-04:00"
      }
    });

    const response = await postClientReview(new Request("http://localhost:3000/api/client/reviews", {
      method: "POST",
      body: JSON.stringify({
        appointmentId: "appt-4",
        rating: 5,
        message: "Excellent visit."
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(submitClientReviewMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      appointmentId: "appt-4",
      rating: 5,
      message: "Excellent visit."
    });
    expect(body.review.rating).toBe(5);
  });

  it("returns a safe review-state conflict for duplicate submissions", async () => {
    submitClientReviewMock.mockRejectedValue(
      new ClientReviewError("A review has already been submitted for this appointment.", 409, "review_already_exists")
    );

    const response = await postClientReview(new Request("http://localhost:3000/api/client/reviews", {
      method: "POST",
      body: JSON.stringify({
        appointmentId: "appt-4",
        rating: 5,
        message: "Excellent visit."
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("review_already_exists");
  });
});
