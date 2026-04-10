import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedAuthUserMock,
  resolveAuthenticatedNextPathMock,
  withResolvedAuthNextPathMock,
  getContactVerificationStateMock,
  getContactVerificationDebugStateMock,
  updateContactVerificationProfileMock,
  sendPhoneVerificationChallengeMock,
  verifyPhoneVerificationChallengeMock
} = vi.hoisted(() => ({
  getAuthenticatedAuthUserMock: vi.fn(),
  resolveAuthenticatedNextPathMock: vi.fn(),
  withResolvedAuthNextPathMock: vi.fn(),
  getContactVerificationStateMock: vi.fn(),
  getContactVerificationDebugStateMock: vi.fn(),
  updateContactVerificationProfileMock: vi.fn(),
  sendPhoneVerificationChallengeMock: vi.fn(),
  verifyPhoneVerificationChallengeMock: vi.fn()
}));

vi.mock("@/app/api/auth/_shared", () => ({
  AUTH_NO_STORE_HEADERS: {
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate"
  },
  getAuthenticatedAuthUser: getAuthenticatedAuthUserMock,
  resolveAuthenticatedNextPath: resolveAuthenticatedNextPathMock,
  withResolvedAuthNextPath: withResolvedAuthNextPathMock,
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
  getContactVerificationDebugState: getContactVerificationDebugStateMock,
  updateContactVerificationProfile: updateContactVerificationProfileMock,
  sendPhoneVerificationChallenge: sendPhoneVerificationChallengeMock,
  verifyPhoneVerificationChallenge: verifyPhoneVerificationChallengeMock
}));

import { GET as getDebugContactState } from "@/app/api/auth/debug-contact-state/route";
import { GET as getVerificationStatus } from "@/app/api/auth/verification-status/route";
import { POST as postContactProfile } from "@/app/api/auth/contact/route";
import { POST as postSendPhone } from "@/app/api/auth/phone/send/route";
import { POST as postVerifyPhone } from "@/app/api/auth/phone/verify/route";

describe("auth verification routes", () => {
  beforeEach(() => {
    getAuthenticatedAuthUserMock.mockReset();
    resolveAuthenticatedNextPathMock.mockReset();
    withResolvedAuthNextPathMock.mockReset();
    getContactVerificationStateMock.mockReset();
    getContactVerificationDebugStateMock.mockReset();
    updateContactVerificationProfileMock.mockReset();
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
    withResolvedAuthNextPathMock.mockImplementation(async (_authUser, payload) => ({
      ...payload,
      nextPath: "/verify-contact"
    }));
    resolveAuthenticatedNextPathMock.mockResolvedValue("/verify-contact");
  });

  it("returns the current contact verification state", async () => {
    getContactVerificationStateMock.mockResolvedValue({
      fullName: "Jordan Ellis",
      firstName: "Jordan",
      lastName: "Ellis",
      email: "client@example.com",
      phone: "+18135550100",
      emailVerified: true,
      phoneVerified: false,
      canContinue: false,
      requiresRoleSelection: false,
      onboardingState: "awaiting_contact_verification",
      missingFields: ["phone"]
    });

    const response = await getVerificationStatus();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.email).toBe("client@example.com");
    expect(body.phoneVerified).toBe(false);
    expect(body.nextPath).toBe("/verify-contact");
  });

  it("updates canonical contact details for the authenticated user", async () => {
    updateContactVerificationProfileMock.mockResolvedValue({
      fullName: "Jordan Ellis",
      firstName: "Jordan",
      lastName: "Ellis",
      email: "client@example.com",
      phone: "+18135550100",
      emailVerified: true,
      phoneVerified: false,
      canContinue: false,
      requiresRoleSelection: false,
      onboardingState: "awaiting_contact_verification",
      missingFields: []
    });

    const response = await postContactProfile(new NextRequest("https://bvrb3r.app/api/auth/contact", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Jordan",
        lastName: "Ellis",
        phone: "(813) 555-0100"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateContactVerificationProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-client" }),
      expect.objectContaining({ firstName: "Jordan", lastName: "Ellis" })
    );
    expect(body.firstName).toBe("Jordan");
    expect(body.nextPath).toBe("/verify-contact");
  });

  it("sends an SMS verification challenge for the authenticated user", async () => {
    sendPhoneVerificationChallengeMock.mockResolvedValue({
      fullName: "Jordan Ellis",
      firstName: "Jordan",
      lastName: "Ellis",
      email: "client@example.com",
      phone: "+18135550100",
      emailVerified: true,
      phoneVerified: false,
      canContinue: false,
      requiresRoleSelection: false,
      onboardingState: "awaiting_contact_verification",
      missingFields: ["phone"],
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
    expect(body.nextPath).toBe("/verify-contact");
  });

  it("returns the canonical next step after successful phone verification", async () => {
    verifyPhoneVerificationChallengeMock.mockResolvedValue({
      fullName: "Jordan Ellis",
      firstName: "Jordan",
      lastName: "Ellis",
      email: "client@example.com",
      phone: "+18135550100",
      emailVerified: true,
      phoneVerified: true,
      canContinue: true,
      requiresRoleSelection: true,
      onboardingState: "awaiting_role_selection",
      missingFields: []
    });
    withResolvedAuthNextPathMock.mockImplementation(async (_authUser, payload) => ({
      ...payload,
      nextPath: "/role-select"
    }));

    const response = await postVerifyPhone(new NextRequest("https://bvrb3r.app/api/auth/phone/verify", {
      method: "POST",
      body: JSON.stringify({ code: "123456" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.phoneVerified).toBe(true);
    expect(body.nextPath).toBe("/role-select");
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

  it("returns the raw canonical contact debug state for the authenticated user", async () => {
    getContactVerificationDebugStateMock.mockResolvedValue({
      profile: {
        id: "user-client",
        full_name: "Jordan Ellis",
        email: "client@example.com",
        phone: "+18135550100",
        phone_verified_at: "2026-04-03T10:00:00.000Z",
        onboarding_state: "awaiting_role_selection",
        primary_onboarding_role: null
      },
      computed: {
        fullName: "Jordan Ellis",
        email: "client@example.com",
        phone: "+18135550100",
        emailVerified: true,
        phoneVerified: true,
        missingFields: [],
        contactComplete: true,
        onboardingState: "awaiting_role_selection",
        requiresRoleSelection: true
      }
    });
    resolveAuthenticatedNextPathMock.mockResolvedValue("/role-select");

    const response = await getDebugContactState();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.full_name).toBe("Jordan Ellis");
    expect(body.computed.contactComplete).toBe(true);
    expect(body.nextPath).toBe("/role-select");
  });
});
