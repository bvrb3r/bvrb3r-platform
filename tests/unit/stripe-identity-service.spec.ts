import { beforeEach, describe, expect, it, vi } from "vitest";
import { processStripeIdentityWebhook } from "@/lib/trust/verification-service";
import { getTrustState, resetTrustState } from "@/lib/trust/state";

const { verifyStripeIdentityWebhookEventMock } = vi.hoisted(() => ({
  verifyStripeIdentityWebhookEventMock: vi.fn()
}));

vi.mock("@/lib/stripe/identity", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/identity")>("@/lib/stripe/identity");
  return {
    ...actual,
    verifyStripeIdentityWebhookEvent: verifyStripeIdentityWebhookEventMock
  };
});

describe("stripe identity verification service", () => {
  beforeEach(() => {
    resetTrustState();
    verifyStripeIdentityWebhookEventMock.mockReset();
  });

  it("syncs verified identity webhook events into the canonical barber lane", async () => {
    verifyStripeIdentityWebhookEventMock.mockReturnValue({
      id: "evt_identity_verified",
      type: "identity.verification_session.verified",
      account: null,
      created: 1711987200,
      livemode: false,
      api_version: "2026-02-25.clover",
      data: {
        object: {
          id: "vs_fade_demo",
          status: "verified",
          metadata: {
            userId: "user-fade",
            barberId: "barber-fade",
            verificationProfileId: "vprof-barber-fade"
          },
          last_error: null,
          redaction: null,
          livemode: false
        }
      }
    });

    const result = await processStripeIdentityWebhook("{}", "test_signature");
    const state = getTrustState();
    const profile = (state.verificationProfiles ?? []).find((record) => record.id === "vprof-barber-fade");
    const providerLink = (state.verificationProviderLinks ?? []).find((record) => record.providerReferenceId === "vs_fade_demo");

    expect(result.status).toBe("processed");
    expect(profile?.identityStatus).toBe("approved");
    expect(providerLink?.providerStatus).toBe("verified");
    expect(providerLink?.metadata.lastEventType).toBe("identity.verification_session.verified");
  });
});
