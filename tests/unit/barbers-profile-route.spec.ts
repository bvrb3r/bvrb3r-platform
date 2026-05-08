import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockRepairError,
  ensureBarberProfileForUserMock,
  ensureBarberProfileForIdentifierMock,
  getBarberDetailsPayloadMock,
  getSessionUserMock
} = vi.hoisted(() => ({
  MockRepairError: class MockRepairError extends Error {
    reason: string;

    constructor(reason: string) {
      super(reason);
      this.name = "BarberProfileRepairError";
      this.reason = reason;
    }
  },
  ensureBarberProfileForUserMock: vi.fn(),
  ensureBarberProfileForIdentifierMock: vi.fn(),
  getBarberDetailsPayloadMock: vi.fn(),
  getSessionUserMock: vi.fn()
}));

vi.mock("@/lib/barber/profile-repair", () => ({
  BarberProfileRepairError: MockRepairError,
  ensureBarberProfileForUser: ensureBarberProfileForUserMock,
  ensureBarberProfileForIdentifier: ensureBarberProfileForIdentifierMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  getBarberDetailsPayload: getBarberDetailsPayloadMock
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

import { GET } from "@/app/api/barbers/[id]/route";

describe("/api/barbers/[id] canonical profile repair", () => {
  beforeEach(() => {
    ensureBarberProfileForUserMock.mockReset();
    ensureBarberProfileForIdentifierMock.mockReset();
    getBarberDetailsPayloadMock.mockReset();
    getSessionUserMock.mockReset();
  });

  it("repairs from the logged-in barber user before loading profile data", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "profile-phillip",
      role: "booth_rent_barber",
      email: "phillip@example.test",
      name: "Phillip mcgee",
      barberId: "legacy-profile-key",
      phone: "8135550101",
      appApprovalStatus: "approved"
    });
    ensureBarberProfileForUserMock.mockResolvedValue({
      attempted: true,
      repaired: true,
      createdBarber: false,
      createdProfile: true,
      createdStatus: false,
      linkedLegacyProfile: false,
      verified: true,
      reason: null,
      profileId: "profile-phillip",
      barberRowId: "barber-uuid",
      barberReference: "barber-phillip",
      barberProfileReference: "barber-phillip",
      username: "philforsure",
      message: "Profile repaired and synced."
    });
    getBarberDetailsPayloadMock.mockResolvedValue({
      barber: { id: "barber-phillip", name: "Phillip mcgee" },
      profile: { username: "philforsure" }
    });

    const response = await GET(new Request("http://app.test/api/barbers/legacy-profile-key"), {
      params: Promise.resolve({ id: "legacy-profile-key" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ensureBarberProfileForUserMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "profile-phillip",
      barberId: "legacy-profile-key"
    }));
    expect(getBarberDetailsPayloadMock).toHaveBeenCalledWith("barber-phillip");
    expect(body.profileRepairNotice).toBe("Profile repaired and synced.");
    expect(body.barber.id).toBe("barber-phillip");
  });

  it("returns an exact repair reason instead of generic profile not found", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "profile-phillip",
      role: "booth_rent_barber",
      email: "phillip@example.test",
      name: "Phillip mcgee",
      barberId: "legacy-profile-key"
    });
    ensureBarberProfileForUserMock.mockRejectedValue(new MockRepairError("missing_barbers_row"));
    ensureBarberProfileForIdentifierMock.mockResolvedValue(null);
    getBarberDetailsPayloadMock.mockResolvedValue(null);

    const response = await GET(new Request("http://app.test/api/barbers/legacy-profile-key"), {
      params: Promise.resolve({ id: "legacy-profile-key" })
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("missing_barbers_row");
    expect(body.error).not.toBe("Barber profile not found.");
  });
});
