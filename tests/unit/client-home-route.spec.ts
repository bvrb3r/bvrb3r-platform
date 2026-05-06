import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  getClientHomePayloadMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  getClientHomePayloadMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  getClientHomePayload: getClientHomePayloadMock
}));

import { GET as getClientHome } from "@/app/api/client/home/route";

describe("client home route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    getClientHomePayloadMock.mockReset();
    getClientExperienceContextMock.mockResolvedValue({
      clientId: "client-jordan"
    });
  });

  it("uses a specific payload failure reference instead of the stale marketplace catch-all", async () => {
    getClientHomePayloadMock.mockRejectedValue(new Error("profiles read failed"));

    const response = await getClientHome();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("client_home_payload_load_failed");
    expect(body.error).toBe("Client home could not load profile data. Reference client_home_payload_load_failed.");
    expect(body.error).not.toContain("client_home_load_failed");
  });
});
