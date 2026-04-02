import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getSessionUserMock,
  startBarberConnectVerificationOnboardingMock,
  startOwnerConnectVerificationOnboardingMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  startBarberConnectVerificationOnboardingMock: vi.fn(),
  startOwnerConnectVerificationOnboardingMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/trust/verification-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trust/verification-service")>("@/lib/trust/verification-service");
  return {
    ...actual,
    startBarberConnectVerificationOnboarding: startBarberConnectVerificationOnboardingMock,
    startOwnerConnectVerificationOnboarding: startOwnerConnectVerificationOnboardingMock
  };
});

import { POST as postBarberConnect } from "@/app/api/verification/barber/start-connect-onboarding/route";
import { POST as postOwnerConnect } from "@/app/api/verification/owner/start-connect-onboarding/route";

describe("verification connect onboarding routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    startBarberConnectVerificationOnboardingMock.mockReset();
    startOwnerConnectVerificationOnboardingMock.mockReset();
  });

  it("starts barber Stripe Connect onboarding through the verification lane", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("fade@bvrb3r.demo"));
    startBarberConnectVerificationOnboardingMock.mockResolvedValue({
      profileId: "vprof-barber-fade",
      url: "https://connect.stripe.com/setup/s/test",
      account: { providerAccountId: "acct_123" }
    });

    const response = await postBarberConnect();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/connect\.stripe\.com/);
  });

  it("validates owner connect onboarding payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    const response = await postOwnerConnect(new NextRequest("https://bvrb3r.demo/api/verification/owner/start-connect-onboarding", {
      method: "POST",
      body: JSON.stringify({ shopId: 123 })
    }));

    expect(response.status).toBe(400);
  });

  it("starts owner Stripe Connect onboarding through the verification lane", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    startOwnerConnectVerificationOnboardingMock.mockResolvedValue({
      profileId: "vprof-shop-bvrb3r",
      url: "https://connect.stripe.com/setup/s/shop_test",
      account: { providerAccountId: "acct_shop_123" }
    });

    const response = await postOwnerConnect(new NextRequest("https://bvrb3r.demo/api/verification/owner/start-connect-onboarding", {
      method: "POST",
      body: JSON.stringify({ shopId: "shop-bvrb3r" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profileId).toBe("vprof-shop-bvrb3r");
  });
});
