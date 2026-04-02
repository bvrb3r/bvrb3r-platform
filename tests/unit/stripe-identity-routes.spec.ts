import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { VerificationFlowError } from "@/lib/trust/verification-service";

const {
  getSessionUserMock,
  startBarberIdentityVerificationSessionMock,
  processStripeIdentityWebhookMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  startBarberIdentityVerificationSessionMock: vi.fn(),
  processStripeIdentityWebhookMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/trust/verification-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trust/verification-service")>("@/lib/trust/verification-service");
  return {
    ...actual,
    startBarberIdentityVerificationSession: startBarberIdentityVerificationSessionMock,
    processStripeIdentityWebhook: processStripeIdentityWebhookMock
  };
});

import { POST as postIdentityStart } from "@/app/api/verification/barber/start-identity-session/route";
import { POST as postIdentityWebhook } from "@/app/api/stripe/identity/webhook/route";

describe("stripe identity verification routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    startBarberIdentityVerificationSessionMock.mockReset();
    processStripeIdentityWebhookMock.mockReset();
  });

  it("starts a Stripe Identity verification session for the barber lane", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("fade@bvrb3r.demo"));
    startBarberIdentityVerificationSessionMock.mockResolvedValue({
      profileId: "vprof-barber-fade",
      sessionId: "vs_123",
      clientSecret: "vs_secret_123",
      url: "https://verify.stripe.com/session/test",
      status: "in_progress",
      degraded: false
    });

    const response = await postIdentityStart();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.sessionId).toBe("vs_123");
    expect(body.url).toMatch(/^https:\/\/verify\.stripe\.com/);
  });

  it("requires a Stripe signature on the identity webhook", async () => {
    const response = await postIdentityWebhook(new NextRequest("https://bvrb3r.demo/api/stripe/identity/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_missing_sig" })
    }));

    expect(response.status).toBe(400);
  });

  it("rejects invalid Stripe Identity signatures cleanly", async () => {
    processStripeIdentityWebhookMock.mockRejectedValue(
      new VerificationFlowError("Unable to verify the Stripe Identity webhook signature.", 400)
    );

    const response = await postIdentityWebhook(new NextRequest("https://bvrb3r.demo/api/stripe/identity/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_identity_bad_sig" }),
      headers: { "stripe-signature": "bad_signature" }
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/verify the stripe identity webhook signature/i);
  });

  it("returns duplicate-safe identity webhook results", async () => {
    processStripeIdentityWebhookMock.mockResolvedValue({
      received: true,
      duplicate: true,
      status: "processed"
    });

    const response = await postIdentityWebhook(new NextRequest("https://bvrb3r.demo/api/stripe/identity/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_identity_duplicate" }),
      headers: { "stripe-signature": "test_signature" }
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(body.status).toBe("processed");
  });
});
