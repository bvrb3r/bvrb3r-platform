import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  saveClientLocationMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  saveClientLocationMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  saveClientLocation: saveClientLocationMock
}));

import { POST as postClientLocation } from "@/app/api/client/location/route";

describe("client location route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    saveClientLocationMock.mockReset();
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "client",
        email: "client@bvrb3r.app"
      },
      clientId: "client-jordan",
      isSignedInClient: true
    });
  });

  it("persists city and state through canonical client preferences", async () => {
    saveClientLocationMock.mockResolvedValue({
      location: {
        city: "Tampa",
        state: "FL"
      },
      client: {
        clientReference: "client-jordan",
        preferredLocation: {
          city: "Tampa",
          state: "FL"
        }
      }
    });

    const response = await postClientLocation(new Request("https://bvrb3r.test/api/client/location", {
      method: "POST",
      body: JSON.stringify({ city: "Tampa", state: "FL" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveClientLocationMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      city: "Tampa",
      state: "FL",
      postalCode: undefined
    });
    expect(body.location).toEqual({ city: "Tampa", state: "FL" });
  });

  it("does not mark location saved when canonical persistence fails", async () => {
    saveClientLocationMock.mockRejectedValue(new Error("client_preferences preferred_city write failed"));

    const response = await postClientLocation(new Request("https://bvrb3r.test/api/client/location", {
      method: "POST",
      body: JSON.stringify({ city: "Tampa", state: "FL" })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("client_preferences preferred_city write failed");
  });
});
