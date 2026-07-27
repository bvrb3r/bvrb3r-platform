import { describe, expect, it } from "vitest";
import {
  TrustPermissionError,
  buildPublicTrustSignal,
  computeShopVerificationDecision,
  createInitialTrustState,
  getBarberTrustSummary,
  getOwnerTrustSummary,
  normalizeVerificationStatus,
  submitBarberVerification,
  submitDispute,
  submitSafetyReport
} from "@/lib/trust/engine";

describe("trust engine", () => {
  it("builds a public trust signal with verification badges", () => {
    const state = createInitialTrustState();
    const signal = buildPublicTrustSignal(state, "barber-wave", "shop-bvrb3r");

    expect(signal.trustScore).toBeGreaterThanOrEqual(90);
    expect(signal.verifiedBarber).toBe(true);
    expect(signal.verifiedLicense).toBe(true);
    expect(signal.publicBadgeLabels).toContain("Verified barber");
  });

  it("normalizes legacy and expanded verification lifecycle values", () => {
    expect(normalizeVerificationStatus("unverified")).toBe("not_started");
    expect(normalizeVerificationStatus("pending")).toBe("submitted");
    expect(normalizeVerificationStatus("verified")).toBe("approved");
    expect(normalizeVerificationStatus("needs_update")).toBe("needs_update");
  });

  it("builds the barber trust workspace summary", () => {
    const state = createInitialTrustState();
    const summary = getBarberTrustSummary(state, "barber-wave");

    expect(summary.verificationItems.length).toBeGreaterThan(0);
    expect(summary.verificationProgress).toBeGreaterThan(0);
    expect(summary.publicBadgePreview.length).toBeGreaterThan(0);
  });

  it("keeps legacy summary status stable while exposing stricter canonical barber decisions", () => {
    const state = createInitialTrustState();
    const summary = getBarberTrustSummary(state, "barber-wave");

    expect(summary.overallStatus).toBe("verified");
    expect(summary.verificationDecision?.canonicalOverallStatus).toBe("approved");
    expect(summary.verificationDecision?.canAcceptBookings).toBe(true);
  });

  it("builds the owner trust workspace summary", () => {
    const state = createInitialTrustState();
    const summary = getOwnerTrustSummary(state, ["loc-ybor", "loc-hyde"]);

    expect(summary.shopStatuses.length).toBeGreaterThan(0);
    expect(summary.openReports).toBeGreaterThan(0);
    expect(summary.recentQueue.length).toBeGreaterThan(0);
  });

  it("computes canonical owner verification posture without breaking legacy shop status", () => {
    const state = createInitialTrustState();
    const decision = computeShopVerificationDecision(state, "shop-bvrb3r");
    const summary = getOwnerTrustSummary(state, ["loc-ybor", "loc-hyde"]);

    expect(decision.canonicalOverallStatus).toBe("approved");
    expect(summary.shopStatuses[0]?.status).toBe("verified");
  });

  it("resolves shop activation decisions from linked location ids", () => {
    const state = createInitialTrustState();
    const decision = computeShopVerificationDecision(state, "loc-ybor");

    expect(decision.canonicalOverallStatus).toBe("approved");
    expect(decision.gates.shop_activation?.allowed).toBe(true);
  });

  it("treats approved records as verified in public trust signals", () => {
    const state = createInitialTrustState();
    state.barberVerifications = state.barberVerifications.map((record) =>
      record.barberId === "barber-wave" && ["identity_verification", "license_verification"].includes(record.category)
        ? { ...record, verificationStatus: "approved" }
        : record
    );

    const signal = buildPublicTrustSignal(state, "barber-wave", "shop-bvrb3r");

    expect(signal.verifiedBarber).toBe(true);
    expect(signal.verifiedLicense).toBe(true);
  });

  it("allows a barber to submit verification and creates a document reference", () => {
    const state = createInitialTrustState();
    const result = submitBarberVerification(
      state,
      {
        role: "barber_user",
        barberId: "barber-wave",
        userEmail: "wave@bvrb3r.demo"
      },
      {
        category: "license_verification",
        legalName: "Wave Carter",
        licenseType: "Florida Barber License",
        licenseNumber: "FL-BR-884201",
        issuingState: "FL",
        expirationDate: "2027-06-30",
        documentPath: "verification/barber-wave/license-renewal.pdf"
      }
    );

    expect(result.verification.verificationStatus).toBe("pending");
    expect(result.document?.storagePath).toContain("license-renewal.pdf");
    expect(result.document?.status).toBe("submitted");
    expect(result.state.barberVerifications.some((record) => record.id === result.verification.id)).toBe(true);
  });

  it("allows client-safe safety reports and creates risk flags for fake-profile cases", () => {
    const state = createInitialTrustState();
    const result = submitSafetyReport(
      state,
      {
        role: "client",
        clientId: "client-jordan",
        userEmail: "client@bvrb3r.demo",
        locationIds: ["loc-ybor"]
      },
      {
        subjectType: "barber",
        subjectId: "barber-fade",
        category: "fake_profile",
        details: "This profile appears to be using information that needs manual trust review.",
        locationId: "loc-ybor"
      }
    );

    expect(result.report.status).toBe("open");
    expect(result.reportEvent.actionLabel).toBe("Report submitted");
    expect(result.riskFlag?.signalType).toBe("duplicate_account_indicator");
  });

  it("allows dispute intake for refund and service-quality workflows", () => {
    const state = createInitialTrustState();
    const result = submitDispute(
      state,
      {
        role: "client",
        clientId: "client-jordan",
        userEmail: "client@bvrb3r.demo",
        locationIds: ["loc-ybor"]
      },
      {
        disputeType: "service_quality",
        involvedPartyType: "barber",
        involvedPartyId: "barber-wave",
        summary: "The client is requesting a service-quality review for a completed appointment.",
        appointmentId: "appt-1",
        locationId: "loc-ybor"
      }
    );

    expect(result.dispute.disputeStatus).toBe("open");
    expect(result.disputeEvent.disputeId).toBe(result.dispute.id);
  });

  it("blocks front desk users from submitting safety reports", () => {
    const state = createInitialTrustState();

    expect(() =>
      submitSafetyReport(
        state,
        {
          role: "front_desk",
          userEmail: "frontdesk@bvrb3r.demo",
          locationIds: ["loc-ybor"]
        },
        {
          subjectType: "booking",
          subjectId: "appt-1",
          category: "fraud",
          details: "Potential fraud concern that should not be accepted from this role."
        }
      )
    ).toThrow(TrustPermissionError);
  });
});
