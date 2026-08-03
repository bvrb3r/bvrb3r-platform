import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionMock, configureMock, goLiveMock, joinMock, withdrawMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  configureMock: vi.fn(),
  goLiveMock: vi.fn(),
  joinMock: vi.fn(),
  withdrawMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUserFromServer: sessionMock }));
vi.mock("@/lib/shops/pr36-prelaunch-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/shops/pr36-prelaunch-service")>("@/lib/shops/pr36-prelaunch-service");
  return {
    ...actual,
    configurePr36Prelaunch: configureMock,
    goLivePr36Shop: goLiveMock,
    joinPr36PrelaunchWaitlist: joinMock,
    withdrawPr36PrelaunchWaitlist: withdrawMock
  };
});

import { POST as configureLaunch } from "@/app/api/shop/launch/configure/route";
import { POST as goLive } from "@/app/api/shop/launch/go-live/route";
import {
  DELETE as withdrawWaitlist,
  POST as joinWaitlist
} from "@/app/api/shops/prelaunch/[shop]/waitlist/route";

const owner = {
  id: "00000000-0000-4000-8000-000000000036",
  role: "shop_owner_user",
  email: "owner@example.com",
  name: "Owner",
  ownedShopId: "southside",
  locationIds: []
};

describe("Product PR36 shop prelaunch routes", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    configureMock.mockReset();
    goLiveMock.mockReset();
    joinMock.mockReset();
    withdrawMock.mockReset();
    sessionMock.mockResolvedValue({ authenticated: true, user: owner });
  });

  it("binds launch configuration to the authenticated owner and idempotency header", async () => {
    configureMock.mockResolvedValue({ version: 1 });
    const response = await configureLaunch(new Request("https://bvrb3r.app/api/shop/launch/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "launch-config:00000000-0000-4000-8000-000000000036" },
      body: JSON.stringify({
        openingAt: "2026-08-15T14:00:00.000Z",
        chairCapacity: 6,
        expectedVersion: 0,
        shopId: "attacker-shop",
        actorProfileId: "attacker"
      })
    }));

    expect(response.status).toBe(200);
    expect(configureMock).toHaveBeenCalledWith({
      user: owner,
      openingAt: "2026-08-15T14:00:00.000Z",
      chairCapacity: 6,
      expectedVersion: 0,
      idempotencyKey: "launch-config:00000000-0000-4000-8000-000000000036"
    });
    expect(JSON.stringify(configureMock.mock.calls[0])).not.toContain("attacker-shop");
  });

  it("does not call Go live for a non-owner session", async () => {
    sessionMock.mockResolvedValue({ authenticated: true, user: { ...owner, role: "client_user" } });
    const response = await goLive(new Request("https://bvrb3r.app/api/shop/launch/go-live", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "launch-live:00000000-0000-4000-8000-000000000036" },
      body: JSON.stringify({ expectedVersion: 1 })
    }));

    expect(response.status).toBe(401);
    expect(goLiveMock).not.toHaveBeenCalled();
  });

  it("allows a guest waitlist join without accepting caller-owned profile identity", async () => {
    sessionMock.mockResolvedValue({ authenticated: false, user: { ...owner, id: "guest-user", role: "client_user" } });
    joinMock.mockResolvedValue({ position: 143, waitlistCount: 143, bookingOpensAt: "2026-08-14T14:00:00.000Z", alreadyJoined: false });
    const response = await joinWaitlist(new Request("https://bvrb3r.app/api/shops/prelaunch/southside/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "prelaunch:00000000-0000-4000-8000-000000000036" },
      body: JSON.stringify({ email: "guest@example.com", phone: null, consent: true, profileId: owner.id })
    }), { params: Promise.resolve({ shop: "southside" }) });

    expect(response.status).toBe(200);
    expect(joinMock).toHaveBeenCalledWith({
      slug: "southside",
      user: null,
      email: "guest@example.com",
      phone: null,
      consent: true,
      idempotencyKey: "prelaunch:00000000-0000-4000-8000-000000000036"
    });
  });

  it("lets a guest revoke waitlist consent without accepting caller-owned profile identity", async () => {
    sessionMock.mockResolvedValue({ authenticated: false, user: { ...owner, id: "guest-user", role: "client_user" } });
    withdrawMock.mockResolvedValue({
      outcome: "withdrawn",
      position: 143,
      waitlistCount: 142,
      alreadyWithdrawn: false,
      contactAnonymized: true
    });
    const response = await withdrawWaitlist(new Request("https://bvrb3r.app/api/shops/prelaunch/southside/waitlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "prelaunch-withdraw:00000000-0000-4000-8000-000000000036" },
      body: JSON.stringify({ email: "guest@example.com", phone: null, profileId: owner.id })
    }), { params: Promise.resolve({ shop: "southside" }) });

    expect(response.status).toBe(200);
    expect(withdrawMock).toHaveBeenCalledWith({
      slug: "southside",
      user: null,
      email: "guest@example.com",
      phone: null,
      idempotencyKey: "prelaunch-withdraw:00000000-0000-4000-8000-000000000036"
    });
  });
});
