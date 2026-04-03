import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedAuthUserMock,
  getContactVerificationStateMock,
  sendPhoneVerificationChallengeMock,
  verifyPhoneVerificationChallengeMock
} = vi.hoisted(() => ({
  getAuthenticatedAuthUserMock: vi.fn(),
  getContactVerificationStateMock: vi.fn(),
  sendPhoneVerificationChallengeMock: vi.fn(),
  verifyPhoneVerificationChallengeMock: vi.fn()
}));

vi.mock("@/app/api/auth/_shared", () => ({
  getAuthenticatedAuthUser: getAuthenticatedAuthUserMock,
  toAuthErrorResponse: (error: unknown) => {
    const message = error instanceof Error ? error.message : "error";
    if (message === "auth_required") {
      return new Response(JSON.stringify({ error: "Authentication is required." }), { status: 401 });
    }

    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }
}));

vi.mock("@/lib/auth/production-identity", () => ({
  getContactVerificationState: getContactVerificationStateMock,
  sendPhoneVerificationChallenge: sendPhoneVerificationChallengeMock,
  verifyPhoneVerificationChallenge: verifyPhoneVerificationChallengeMock
}));

import { GET as getVerificationStatus } from "@/app/api/auth/verification-status/route";
import { POST as postSendPhone } from "@/app/api/auth/phone/send/route";
import { POST as postVerifyPhone } from "@/app/api/auth/phone/verify/route";

describe("auth verification routes", () => {
  beforeEach(() => {
    getAuthenticatedAuthUserMock.mockReset();
    getContactVerificationStateMock.mockReset();
    sendPhoneVerificationChallengeMock.mockReset();
    verifyPhoneVerificationChallengeMock.mockReset();

    getAuthenticatedAuthUserMock.mockResolvedValue({
      id: "user-client",
      email: "client@example.com",
      phone: "+18135550100",
      email_confirmed_at: "2026-04-03T10:00:00.000Z",
      phone_confirmed_at: null,
      user_metadata: {
        full_name: "Jordan Ellis",
        phone: "+18135550100"
      }
    });
  });

  it("returns the current contact verification state", async () => {
    getContactVerificationStateMock.mockResolvedValue({
      email: "client@example.com",
      phone: "+18135550100",
      emailVerified: true,
      phoneVerified: false,
      canContinue: false,
      requiresRoleSelection: false,
      onboardingState: "awaiting_contact_verification"
    });

    const response = await getVerificationStatus();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.email).toBe("client@example.com");
    expect(body.phoneVerified).toBe(false);
  });

  it("sends an SMS verification challenge for the authenticated user", async () => {
    sendPhoneVerificationChallengeMock.mockResolvedValue({
      email: "client@example.com",
      phone: "+18135550100",
      emailVerified: true,
      phoneVerified: false,
      canContinue: false,
      requiresRoleSelection: false,
      onboardingState: "awaiting_contact_verification",
      degraded: false
    });

    const response = await postSendPhone(new NextRequest("https://bvrb3r.app/api/auth/phone/send", {
      method: "POST",
      body: JSON.stringify({ phone: "(813) 555-0100" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sendPhoneVerificationChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-client" }),
      { phone: "(813) 555-0100" }
    );
    expect(body.degraded).toBe(false);
  });

  it("rejects unauthenticated phone verification attempts cleanly", async () => {
    getAuthenticatedAuthUserMock.mockRejectedValue(new Error("auth_required"));

    const response = await postVerifyPhone(new NextRequest("https://bvrb3r.app/api/auth/phone/verify", {
      method: "POST",
      body: JSON.stringify({ code: "123456" })
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toMatch(/authentication/i);
  });
});
