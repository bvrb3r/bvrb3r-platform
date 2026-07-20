import { beforeEach, describe, expect, it, vi } from "vitest";

const { readPublicBarberProfileMock } = vi.hoisted(() => ({
  readPublicBarberProfileMock: vi.fn()
}));

vi.mock("@/lib/marketplace/public-read-service", () => ({
  readPublicBarberProfile: readPublicBarberProfileMock
}));

import { GET } from "@/app/api/barbers/[id]/route";

describe("/api/barbers/[id] public profile boundary", () => {
  beforeEach(() => {
    readPublicBarberProfileMock.mockReset();
  });

  it("serves the public-safe profile through the read-only marketplace service", async () => {
    readPublicBarberProfileMock.mockResolvedValue({
      barber: { id: "barber-phillip", name: "Phillip McGee" },
      profile: { username: "philforsure" }
    });

    const response = await GET(new Request("http://app.test/api/barbers/philforsure"), {
      params: Promise.resolve({ id: "  philforsure  " })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readPublicBarberProfileMock).toHaveBeenCalledWith("philforsure");
    expect(body.barber.id).toBe("barber-phillip");
    expect(body.profile.username).toBe("philforsure");
  });

  it("returns an exact public not-found code without attempting a repair write", async () => {
    readPublicBarberProfileMock.mockResolvedValue(null);

    const response = await GET(new Request("http://app.test/api/barbers/missing"), {
      params: Promise.resolve({ id: "missing" })
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Barber profile not found.",
      code: "barber_profile_not_found"
    });
    expect(readPublicBarberProfileMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed without exposing internal marketplace errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    readPublicBarberProfileMock.mockRejectedValue(new Error("database credential detail"));

    const response = await GET(new Request("http://app.test/api/barbers/private"), {
      params: Promise.resolve({ id: "private" })
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Barber profile is temporarily unavailable.",
      code: "public_barber_profile_load_failed"
    });
    expect(JSON.stringify(body)).not.toContain("credential");
    expect(consoleError).toHaveBeenCalledWith("[barbers-api] public profile unavailable", {
      reference: "public_barber_profile_load_failed"
    });
    consoleError.mockRestore();
  });

  it("rejects invalid identifiers before querying public data", async () => {
    const response = await GET(new Request("http://app.test/api/barbers/invalid"), {
      params: Promise.resolve({ id: "  " })
    });

    expect(response.status).toBe(400);
    expect(readPublicBarberProfileMock).not.toHaveBeenCalled();
  });
});
