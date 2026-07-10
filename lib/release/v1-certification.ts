export type V1CertificationStatus =
  | "pass"
  | "warning"
  | "needs_review"
  | "failed"
  | "critical_failed";

export type V1CertificationOwner =
  | "Product"
  | "Technology"
  | "Operations"
  | "Finance"
  | "Compliance"
  | "Security";

export type V1CertificationGate = {
  id: string;
  label: string;
  owner: V1CertificationOwner;
  status: V1CertificationStatus;
  summary: string;
  evidence: string[];
  remediation: string[];
  requiredTests: string[];
};

export type V1CertificationSummary = {
  generatedAt: string;
  overallStatus: V1CertificationStatus;
  certifiable: boolean;
  counts: Record<V1CertificationStatus, number>;
  blockers: string[];
  gates: V1CertificationGate[];
};

const STATUS_PRIORITY: Record<V1CertificationStatus, number> = {
  pass: 0,
  warning: 1,
  needs_review: 2,
  failed: 3,
  critical_failed: 4
};

export function summarizeV1Certification(
  gates: V1CertificationGate[],
  generatedAt = new Date().toISOString()
): V1CertificationSummary {
  const counts: Record<V1CertificationStatus, number> = {
    pass: 0,
    warning: 0,
    needs_review: 0,
    failed: 0,
    critical_failed: 0
  };

  for (const gate of gates) {
    counts[gate.status] += 1;
  }

  const overallStatus = gates.reduce<V1CertificationStatus>((current, gate) => {
    return STATUS_PRIORITY[gate.status] > STATUS_PRIORITY[current] ? gate.status : current;
  }, "pass");

  const blockers = gates
    .filter((gate) => gate.status === "failed" || gate.status === "critical_failed")
    .map((gate) => gate.id);

  return {
    generatedAt,
    overallStatus,
    certifiable:
      gates.length > 0
      && counts.needs_review === 0
      && counts.failed === 0
      && counts.critical_failed === 0,
    counts,
    blockers,
    gates
  };
}

function needsEvidenceGate(input: Omit<V1CertificationGate, "status" | "summary" | "evidence"> & {
  missingEvidence: string;
}): V1CertificationGate {
  return {
    id: input.id,
    label: input.label,
    owner: input.owner,
    status: "needs_review",
    summary: input.missingEvidence,
    evidence: [],
    remediation: input.remediation,
    requiredTests: input.requiredTests
  };
}

export function buildV1CertificationSummary(): V1CertificationSummary {
  const gates: V1CertificationGate[] = [
    needsEvidenceGate({
      id: "deployment-truth",
      label: "Deployment truth",
      owner: "Technology",
      missingEvidence: "Approved GitHub commit and live production deployment have not been certified together.",
      remediation: ["Connect GitHub commit status, Vercel deployment state, environment, and post-deploy smoke evidence."],
      requiredTests: ["deployment-commit-match", "production-smoke"]
    }),
    needsEvidenceGate({
      id: "identity-role-truth",
      label: "Identity and canonical public roles",
      owner: "Security",
      missingEvidence: "Production role inventory and authenticated identity linkage have not been certified.",
      remediation: ["Prove public account roles are limited to client_user, barber_user, and shop_owner_user."],
      requiredTests: ["canonical-role-inventory", "cross-role-denial"]
    }),
    needsEvidenceGate({
      id: "rls-permissions",
      label: "RLS and permissions",
      owner: "Security",
      missingEvidence: "Production RLS policy inventory and negative permission tests have not been attached.",
      remediation: ["Run RLS advisor checks and authenticated allowed/denied access tests for every public role."],
      requiredTests: ["rls-policy-certification", "role-permission-matrix"]
    }),
    needsEvidenceGate({
      id: "client-booking-loop",
      label: "Client booking loop",
      owner: "Product",
      missingEvidence: "A production-shaped Client discovery, booking, payment, and Activity certification is required.",
      remediation: ["Certify search through confirmed appointment with UI, API, database, and processor evidence."],
      requiredTests: ["core-booking-loop-regression", "client-activity-barber-calendar-sync"]
    }),
    needsEvidenceGate({
      id: "barber-completion-loop",
      label: "Barber completion loop",
      owner: "Operations",
      missingEvidence: "Barber check-in, completion, status history, earnings, and payout-readiness proof is required.",
      remediation: ["Certify the real appointment completion lifecycle and all resulting records."],
      requiredTests: ["barber-complete-service-payout-readiness"]
    }),
    needsEvidenceGate({
      id: "money-truth",
      label: "Payment, routing, refund, dispute, and payout truth",
      owner: "Finance",
      missingEvidence: "Money reconciliation and current webhook evidence have not been certified.",
      remediation: ["Reconcile Stripe, payments, routing, ledger, refunds, disputes, and payout executions."],
      requiredTests: ["payment-routing-completion-regression", "refund-reversal", "webhook-idempotency"]
    }),
    needsEvidenceGate({
      id: "shop-owner-tier-1",
      label: "Shop Owner Tier 1",
      owner: "Operations",
      missingEvidence: "Shop setup, team, schedule, policies, compensation, and owner-safe money require certification.",
      remediation: ["Complete and certify the approved shop operating loop."],
      requiredTests: ["owner-schedule-visibility", "owner-money-visibility", "shop-permission-matrix"]
    }),
    needsEvidenceGate({
      id: "kiosk-walk-in-loop",
      label: "Kiosk and walk-in loop",
      owner: "Operations",
      missingEvidence: "Next Available, Pick a Barber, rotation, realtime queue, notifications, and reset require proof.",
      remediation: ["Run the full public-safe kiosk certification with an actual walk-in record."],
      requiredTests: ["kiosk-next-available", "kiosk-picked-barber", "kiosk-session-reset"]
    }),
    needsEvidenceGate({
      id: "legal-consent",
      label: "Legal, privacy, consent, deletion, and export",
      owner: "Compliance",
      missingEvidence: "Published documents and versioned user acceptance have not been certified.",
      remediation: ["Publish legal routes and prove consent, deletion, export, and marketing preference controls."],
      requiredTests: ["legal-routes", "versioned-consent", "account-deletion", "data-export"]
    }),
    needsEvidenceGate({
      id: "audit-observability",
      label: "Audit and observability",
      owner: "Technology",
      missingEvidence: "Canonical audit coverage, sensitive-log redaction, and critical alerting require certification.",
      remediation: ["Connect serious actions to one governed audit spine and validate production log redaction."],
      requiredTests: ["required-audit-events", "sensitive-log-redaction", "critical-alert-routing"]
    }),
    needsEvidenceGate({
      id: "regression-ci-proof",
      label: "Mandatory regression and CI proof",
      owner: "Technology",
      missingEvidence: "The deployed commit is not yet tied to the complete mandatory V1 regression matrix.",
      remediation: ["Make all V1 role, booking, money, RLS, kiosk, legal, and smoke suites mandatory release checks."],
      requiredTests: ["v1-mandatory-regression-suite"]
    })
  ];

  return summarizeV1Certification(gates);
}
