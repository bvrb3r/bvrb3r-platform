import { beforeEach, describe, expect, it, vi } from "vitest";
import { processStripeIdentityWebhook } from "@/lib/trust/verification-service";
import { getTrustState, resetTrustState } from "@/lib/trust/state";
import { StripeIdentityError } from "@/lib/stripe/identity";
import { StripeWebhookAuditError } from "@/lib/stripe/webhook-audit";

const {
  verifyStripeIdentityWebhookEventMock,
  createSupabaseAdminClientMock,
  beginStripeWebhookAuditMock,
  completeStripeWebhookAuditMock,
  getTrustProviderMock,
  syncStripeIdentityVerificationLaneMock
} = vi.hoisted(() => ({
  verifyStripeIdentityWebhookEventMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  beginStripeWebhookAuditMock: vi.fn(),
  completeStripeWebhookAuditMock: vi.fn(),
  getTrustProviderMock: vi.fn(),
  syncStripeIdentityVerificationLaneMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return { ...actual, isSupabaseEnabled: () => true };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/stripe/webhook-audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/webhook-audit")>("@/lib/stripe/webhook-audit");
  return {
    ...actual,
    beginStripeWebhookAudit: beginStripeWebhookAuditMock,
    completeStripeWebhookAudit: completeStripeWebhookAuditMock
  };
});

vi.mock("@/lib/stripe/identity", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/identity")>("@/lib/stripe/identity");
  return {
    ...actual,
    verifyStripeIdentityWebhookEvent: verifyStripeIdentityWebhookEventMock
  };
});

vi.mock("@/lib/trust/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trust/provider")>("@/lib/trust/provider");
  return {
    ...actual,
    getTrustProvider: getTrustProviderMock
  };
});

vi.mock("@/lib/trust/provider-sync", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trust/provider-sync")>("@/lib/trust/provider-sync");
  return {
    ...actual,
    syncStripeIdentityVerificationLane: syncStripeIdentityVerificationLaneMock
  };
});

function verifiedIdentityEvent(id = "evt_identity_verified") {
  return {
    id,
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
  };
}

describe("stripe identity verification service", () => {
  beforeEach(() => {
    resetTrustState();
    verifyStripeIdentityWebhookEventMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    beginStripeWebhookAuditMock.mockReset();
    completeStripeWebhookAuditMock.mockReset();
    getTrustProviderMock.mockReset();
    syncStripeIdentityVerificationLaneMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue({});
    getTrustProviderMock.mockResolvedValue({
      kind: "supabase",
      readState: async () => getTrustState()
    });
    syncStripeIdentityVerificationLaneMock.mockResolvedValue({
      profile: { id: "vprof-barber-fade" },
      degraded: false
    });
    beginStripeWebhookAuditMock.mockResolvedValue({
      duplicate: false,
      row: { id: "identity-audit-1", processing_status: "received", attempt_count: 1 }
    });
    completeStripeWebhookAuditMock.mockResolvedValue(undefined);
  });

  it("syncs verified identity webhook events into the canonical barber lane", async () => {
    verifyStripeIdentityWebhookEventMock.mockReturnValue(verifiedIdentityEvent());

    const result = await processStripeIdentityWebhook("{}", "test_signature");

    expect(result.status).toBe("processed");
    expect(syncStripeIdentityVerificationLaneMock).toHaveBeenCalledWith({
      userId: "user-fade",
      barberId: "barber-fade",
      verificationProfileId: "vprof-barber-fade",
      sessionId: "vs_fade_demo",
      providerStatus: "verified",
      lastErrorCode: null,
      lastErrorReason: null,
      redactionStatus: null,
      lastEventId: "evt_identity_verified",
      lastEventType: "identity.verification_session.verified",
      livemode: false
    });
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledWith(
      {},
      "identity-audit-1",
      { processingStatus: "processed", attemptCount: 1 }
    );
  });

  it("keeps missing Identity signing-secret configuration retryable", async () => {
    verifyStripeIdentityWebhookEventMock.mockImplementation(() => {
      throw new StripeIdentityError("Stripe Identity webhook verification is not configured.", 503, "identity_not_configured");
    });

    await expect(processStripeIdentityWebhook("{}", "test_signature")).rejects.toMatchObject({
      status: 503,
      code: "identity_not_configured"
    });
    expect(beginStripeWebhookAuditMock).not.toHaveBeenCalled();
  });

  it("does not acknowledge Identity events when durable audit storage is unavailable", async () => {
    verifyStripeIdentityWebhookEventMock.mockReturnValue({
      id: "evt_identity_audit_unavailable",
      type: "identity.verification_session.processing",
      account: null,
      created: 1711987200,
      livemode: false,
      api_version: "2020-08-27",
      data: { object: { id: "vs_audit_unavailable", status: "processing", metadata: {}, livemode: false } }
    });
    beginStripeWebhookAuditMock.mockRejectedValue(
      new StripeWebhookAuditError("Stripe webhook audit storage is not available.", 503, "audit_unavailable")
    );

    await expect(processStripeIdentityWebhook("{}", "test_signature")).rejects.toMatchObject({
      status: 503,
      code: "audit_unavailable"
    });
  });

  it("audits unsupported signed Identity events as ignored", async () => {
    verifyStripeIdentityWebhookEventMock.mockReturnValue({
      id: "evt_identity_unsupported",
      type: "identity.verification_report.created",
      account: null,
      created: 1711987200,
      livemode: false,
      api_version: "2020-08-27",
      data: { object: { id: "vr_unsupported", object: "identity.verification_report" } }
    });

    const result = await processStripeIdentityWebhook("{}", "test_signature");

    expect(result.status).toBe("ignored");
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledWith(
      {},
      "identity-audit-1",
      { processingStatus: "ignored", attemptCount: 1 }
    );
    expect(syncStripeIdentityVerificationLaneMock).not.toHaveBeenCalled();
  });

  it("suppresses a sequential Identity duplicate before the trust lane is synced twice", async () => {
    verifyStripeIdentityWebhookEventMock.mockReturnValue(
      verifiedIdentityEvent("evt_identity_sequential_duplicate")
    );
    beginStripeWebhookAuditMock
      .mockResolvedValueOnce({
        duplicate: false,
        row: { id: "identity-audit-duplicate", processing_status: "received", attempt_count: 1 }
      })
      .mockResolvedValueOnce({
        duplicate: true,
        row: { id: "identity-audit-duplicate", processing_status: "processed", attempt_count: 1 }
      });

    const first = await processStripeIdentityWebhook("{}", "identity_signature");
    const duplicate = await processStripeIdentityWebhook("{}", "identity_signature");

    expect(first).toMatchObject({ duplicate: false, status: "processed" });
    expect(duplicate).toMatchObject({ duplicate: true, status: "processed" });
    expect(syncStripeIdentityVerificationLaneMock).toHaveBeenCalledTimes(1);
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledTimes(1);
  });

  it("marks the Identity audit failed and remains retryable when provider persistence degrades", async () => {
    verifyStripeIdentityWebhookEventMock.mockReturnValue(
      verifiedIdentityEvent("evt_identity_persistence_degraded")
    );
    syncStripeIdentityVerificationLaneMock.mockResolvedValue({
      profile: { id: "vprof-barber-fade" },
      degraded: true
    });

    await expect(
      processStripeIdentityWebhook("{}", "identity_signature")
    ).rejects.toMatchObject({
      status: 503,
      code: "identity_webhook_persistence_degraded",
      message: "Stripe Identity state could not be persisted durably."
    });

    expect(completeStripeWebhookAuditMock).toHaveBeenCalledWith(
      {},
      "identity-audit-1",
      {
        processingStatus: "failed",
        attemptCount: 1,
        errorMessage: "Stripe Identity state could not be persisted durably."
      }
    );
    expect(completeStripeWebhookAuditMock).not.toHaveBeenCalledWith(
      {},
      "identity-audit-1",
      expect.objectContaining({ processingStatus: "processed" })
    );
  });
});
