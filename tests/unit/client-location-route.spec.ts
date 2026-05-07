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
        state: "FL",
        display: "Tampa, FL"
      },
      client: {
        clientReference: "client-jordan",
        preferredLocation: {
          city: "Tampa",
          state: "FL",
          display: "Tampa, FL"
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
    expect(body.location).toEqual({ city: "Tampa", state: "FL", display: "Tampa, FL" });
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
    expect(body.code).toBe("client_location_save_failed");
    expect(body.reason).toBe("schema_missing");
  });

  it("returns a safe auth reason when the signed-in client context is missing", async () => {
    getClientExperienceContextMock.mockResolvedValueOnce({
      viewer: {
        role: "guest",
        email: null
      },
      clientId: "",
      isSignedInClient: false
    });

    const response = await postClientLocation(new Request("https://bvrb3r.test/api/client/location", {
      method: "POST",
      body: JSON.stringify({ city: "Tampa", state: "FL" })
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: "client_location_save_failed",
      reason: "auth_missing"
    });
    expect(saveClientLocationMock).not.toHaveBeenCalled();
  });

  it("returns a validation reason for missing city", async () => {
    const response = await postClientLocation(new Request("https://bvrb3r.test/api/client/location", {
      method: "POST",
      body: JSON.stringify({ city: "", state: "FL" })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: "client_location_save_failed",
      reason: "validation_failed"
    });
    expect(saveClientLocationMock).not.toHaveBeenCalled();
  });
});
