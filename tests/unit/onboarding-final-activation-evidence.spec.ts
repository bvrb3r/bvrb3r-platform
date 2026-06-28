import { describe, expect, it } from "vitest";
import { buildOnboardingFinalActivationEvidence, buildFinalActivationFromContext } from "@/lib/onboarding/final-activation";

describe("onboarding final activation production evidence", () => {
  it("returns read-only Needs Review evidence when deployment proof is not connected", () => {
    const evidence = buildOnboardingFinalActivationEvidence();

    expect(evidence).toMatchObject({
      readinessEngineReachable: true,
      clientOnboardingPathPresent: true,
      barberOnboardingPathPresent: true,
      ownerOnboardingPathPresent: true,
      finalActivationModelPresent: true,
      rawRoleLabelsInFinalActivationUi: false,
      noMigrationsAdded: true,
      noRlsTouched: true,
      noMoneyPayoutRoutingMutation: true,
      validationStatus: "Needs Review",
      contentExposed: false
    });
    expect(evidence.requiredRoutes).toEqual({
      guest: "/signup",
      client: "/dashboard/client",
      barber: "/dashboard/barber",
      shop_owner: "/dashboard/owner"
    });
    expect(evidence.missingEvidence).toContain("Vercel preview or production runtime proof not connected in local model.");
  });

  it("can report Pass only when connected validation evidence is supplied", () => {
    const result = buildFinalActivationFromContext("client", {
      authenticated: true,
      authMethodConnected: true,
      role: "client_user",
      name: "Jordan Ellis",
      username: "jordan",
      email: "jordan@example.com",
      phone: "8135550101",
      termsAccepted: true,
      trustRulesAccepted: true
    }, {
      productionEvidence: {
        validationStatus: "Pass",
        missingEvidence: []
      }
    });

    expect(result.evidence.validationStatus).toBe("Pass");
    expect(result.evidence.missingEvidence).toEqual([]);
    expect(result.auditEventHint.reason).toContain("typed event hints");
  });

  it("keeps evidence free of production mutation and private payload signals", () => {
    const evidenceText = JSON.stringify(buildOnboardingFinalActivationEvidence()).toLowerCase();

    expect(evidenceText).not.toMatch(/insert|update|delete|upsert|rpc|stripe|refund|payout execution|ledger/);
    expect(evidenceText).not.toMatch(/private source|document text|payment_intent|stripe_customer_id|provider_payment_method_id/);
    expect(evidenceText).not.toMatch(/profiles\.role|auth\.uid|guest_user|client_user|barber_user|shop_owner_user/);
  });
});
