import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  getBarberDetailsPayloadMock,
  getPublicBarberReviewsPayloadMock,
  submitPublicBarberReviewMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  getBarberDetailsPayloadMock: vi.fn(),
  getPublicBarberReviewsPayloadMock: vi.fn(),
  submitPublicBarberReviewMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/booking/platform-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/booking/platform-service")>("@/lib/booking/platform-service");
  return {
    ...actual,
    getBarberDetailsPayload: getBarberDetailsPayloadMock,
    getPublicBarberReviewsPayload: getPublicBarberReviewsPayloadMock,
    submitPublicBarberReview: submitPublicBarberReviewMock
  };
});

import { GET, POST } from "@/app/api/barbers/[id]/reviews/route";
import { ClientReviewError } from "@/lib/booking/platform-service";

function routeContext(id = "barber-phillip") {
  return {
    params: Promise.resolve({ id })
  };
}

function publicProfile() {
  return {
    barber: {
      id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
      userId: "43b3cda2-3fe0-4632-95bb-56c005b5a3cf",
      name: "Phillip mcgee"
    },
    profile: {
      username: "barber-43b3cda2"
    }
  };
}

describe("public barber reviews route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    getBarberDetailsPayloadMock.mockReset();
    getPublicBarberReviewsPayloadMock.mockReset();
    submitPublicBarberReviewMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
      isSignedInClient: true,
      viewer: {
        role: "client_user"
      }
    });
    getBarberDetailsPayloadMock.mockResolvedValue(publicProfile());
  });

  it("loads public review summary and review rows", async () => {
    getPublicBarberReviewsPayloadMock.mockResolvedValue({
      averageRating: 5,
      reviewCount: 1,
      reviews: [
        {
          id: "review-1",
          rating: 5,
          message: "Sharp cut.",
          createdAt: "2026-05-20T12:00:00.000Z"
        }
      ]
    });

    const response = await GET(new Request("http://localhost:3000/api/barbers/barber-phillip/reviews"), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.averageRating).toBe(5);
    expect(body.reviewCount).toBe(1);
    expect(body.reviews[0].message).toBe("Sharp cut.");
  });

  it("blocks unauthenticated public review submissions", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      clientId: "",
      isSignedInClient: false,
      viewer: {
        role: "guest"
      }
    });

    const response = await POST(new Request("http://localhost:3000/api/barbers/barber-phillip/reviews", {
      method: "POST",
      body: JSON.stringify({
        rating: 5,
        message: "Sharp cut."
      })
    }), routeContext());

    expect(response.status).toBe(403);
    expect(submitPublicBarberReviewMock).not.toHaveBeenCalled();
  });

  it("returns the completed-appointment guard for clients without a completed visit", async () => {
    submitPublicBarberReviewMock.mockRejectedValue(
      new ClientReviewError("Complete an appointment before leaving a review.", 409, "review_not_eligible")
    );

    const response = await POST(new Request("http://localhost:3000/api/barbers/barber-phillip/reviews", {
      method: "POST",
      body: JSON.stringify({
        rating: 5,
        message: "Sharp cut."
      })
    }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("review_not_eligible");
    expect(body.error).toBe("Complete an appointment before leaving a review.");
  });

  it("submits a public barber review through the canonical barber id", async () => {
    submitPublicBarberReviewMock.mockResolvedValue({
      review: {
        id: "review-2",
        rating: 5,
        message: "Sharp cut.",
        createdAt: "2026-05-20T12:00:00.000Z"
      }
    });

    const response = await POST(new Request("http://localhost:3000/api/barbers/barber-43b3cda2/reviews", {
      method: "POST",
      body: JSON.stringify({
        rating: 5,
        message: "Sharp cut."
      })
    }), routeContext("barber-43b3cda2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(submitPublicBarberReviewMock).toHaveBeenCalledWith({
      clientId: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
      barberId: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
      barberAliases: [
        "barber-43b3cda2",
        "43b3cda2-3fe0-4632-95bb-56c005b5a3cf"
      ],
      rating: 5,
      message: "Sharp cut."
    });
  });

  it("returns a duplicate-review conflict without inserting another review", async () => {
    submitPublicBarberReviewMock.mockRejectedValue(
      new ClientReviewError("A review has already been submitted for this appointment.", 409, "review_already_exists")
    );

    const response = await POST(new Request("http://localhost:3000/api/barbers/barber-phillip/reviews", {
      method: "POST",
      body: JSON.stringify({
        rating: 4,
        message: "Already reviewed."
      })
    }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("review_already_exists");
  });
});
