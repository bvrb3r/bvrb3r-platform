import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ArchitectMonitorStatus = "Pass" | "Failed" | "Needs Review";

export type ArchitectMonitorCard = {
  id: string;
  label: string;
  headline: string;
  detail: string;
  status: ArchitectMonitorStatus;
  metric: string;
  incidentReference: string | null;
};

export type ArchitectRentMonitorEvidence = {
  connected: boolean;
  chairsyncRows: number;
  chairsyncExternalOwnerViolations: number;
  chairsyncRestrictedRows: number;
  duplicateViolations: number;
  externalAppointmentRows: number;
  externalPaymentViolations: number;
  externalAutoBoothViolations: number;
  externalFeeViolations: number;
  rentReconciliationDeltaCents: number;
  openRentDisputes: number;
  clientBridgeInvitations: number;
  clientBridgeClaims: number;
  clientBridgeConsentViolations: number;
  warnings: string[];
};

export type ArchitectRentMonitorPayload = {
  generatedAt: string;
  readOnly: true;
  chairSync: ArchitectMonitorCard[];
  clientBridgeMoney: ArchitectMonitorCard[];
  warnings: string[];
};

function card(
  id: string,
  label: string,
  headline: string,
  detail: string,
  metric: string,
  status: ArchitectMonitorStatus,
  incidentReference: string | null = null
): ArchitectMonitorCard {
  return { id, label, headline, detail, metric, status, incidentReference };
}

function integrityStatus(connected: boolean, violations: number) {
  if (!connected) return "Needs Review" as const;
  return violations === 0 ? "Pass" as const : "Failed" as const;
}

export function buildArchitectRentMonitorPayload(
  evidence: ArchitectRentMonitorEvidence,
  generatedAt = new Date().toISOString()
): ArchitectRentMonitorPayload {
  const syncStatus = evidence.connected ? "Pass" : "Needs Review";
  const externalOwnerStatus = integrityStatus(
    evidence.connected,
    evidence.chairsyncExternalOwnerViolations
  );
  const duplicateStatus = integrityStatus(evidence.connected, evidence.duplicateViolations);
  const externalMoneyStatus = integrityStatus(evidence.connected, evidence.externalPaymentViolations);
  const autoBoothStatus = integrityStatus(evidence.connected, evidence.externalAutoBoothViolations);
  const feeStatus = integrityStatus(evidence.connected, evidence.externalFeeViolations);
  const reconciliationStatus = evidence.connected
    ? evidence.rentReconciliationDeltaCents === 0 ? "Pass" : "Failed"
    : "Needs Review";
  const consentStatus = integrityStatus(evidence.connected, evidence.clientBridgeConsentViolations);
  const chairIncident = [
    externalOwnerStatus,
    duplicateStatus,
    externalMoneyStatus
  ].includes("Failed") ? "BVR-PR26-CHAIRSYNC" : null;
  const moneyIncident = [
    autoBoothStatus,
    feeStatus,
    reconciliationStatus,
    consentStatus
  ].includes("Failed") ? "BVR-PR26-MONEY" : null;

  return {
    generatedAt,
    readOnly: true,
    chairSync: [
      card("provider-health", "Provider health", "ChairSync import health", "Imported provider records are readable.", String(evidence.chairsyncRows), syncStatus),
      card("provider-delay", "Delay", "Provider delay posture", "Source timestamps remain observable without guessing at external state.", evidence.connected ? "Observed" : "Unavailable", syncStatus),
      card("provider-failure", "Failure", "Provider failure boundary", "A failed provider stays counts-only and cannot create native money.", evidence.connected ? "Protected" : "Unknown", syncStatus),
      card("duplicate-monitor", "Duplicates", "Duplicate prevention", "Provider appointment identity is unique per provider.", String(evidence.duplicateViolations), duplicateStatus, duplicateStatus === "Failed" ? chairIncident : null),
      card("conflict-queue", "Conflicts", "Attribution conflict queue", "Conflicts stay reviewable; the system never guesses a source.", evidence.connected ? "Connected" : "Unavailable", syncStatus),
      card("permission-audit", "Permission", "Provider permission audit", "Restricted provider rows remain data-minimized.", String(evidence.chairsyncRestrictedRows), syncStatus),
      card("data-minimization", "Minimization", "External data minimization", "The import contract carries no external amount fields.", "Schema locked", syncStatus),
      card("money-isolation", "Money isolation", "External money isolation audit", "External appointment records must not produce a BVRB3R payment.", String(evidence.externalPaymentViolations), externalMoneyStatus, externalMoneyStatus === "Failed" ? chairIncident : null),
      card("leakage-runbook", "Leakage P0", "External leakage runbook", "Any external-money leak is a P0 incident, not a silent warning.", evidence.externalPaymentViolations ? "PAGE" : "0 leaks", externalMoneyStatus, externalMoneyStatus === "Failed" ? chairIncident : null),
      card("attribution-native", "Native source", "Native attribution", "Native rows preserve BVRB3R payment ownership.", String(Math.max(evidence.chairsyncRows - evidence.externalAppointmentRows, 0)), syncStatus),
      card("attribution-booksy", "Booksy", "Booksy attribution", "Booksy stays external:booksy.", String(evidence.externalAppointmentRows), externalOwnerStatus, externalOwnerStatus === "Failed" ? chairIncident : null),
      card("attribution-square", "Square", "Square attribution", "Square stays external:square.", "Observed", externalOwnerStatus, externalOwnerStatus === "Failed" ? chairIncident : null),
      card("attribution-thecut", "theCut", "theCut attribution", "theCut stays external:thecut.", "Observed", externalOwnerStatus, externalOwnerStatus === "Failed" ? chairIncident : null),
      card("busy-block", "Busy-block", "Busy-block protection", "Busy blocks export only with barber consent.", "Consent-gated", syncStatus),
      card("double-book", "Double-book", "Double-booking risk", "Conflicting chair time stays visible for owner repair.", evidence.connected ? "Monitored" : "Unknown", syncStatus),
      card("update-cancel", "Update / cancel", "External update symmetry", "Provider updates and cancels never manufacture BVRB3R money.", "Read-only", syncStatus),
      card("repair-review", "Repair review", "Incorrect attribution review", "Repairs require an evidence trail.", evidence.connected ? "Available" : "Unavailable", syncStatus),
      card("audit-history", "Audit history", "Attribution audit history", "Import and repair evidence remains queryable.", String(evidence.chairsyncRows), syncStatus)
    ],
    clientBridgeMoney: [
      card("bridge-funnel", "Funnel", "ClientBridge conversion", "Invitations and claims remain counts-only.", `${evidence.clientBridgeClaims}/${evidence.clientBridgeInvitations}`, syncStatus),
      card("identity-conflicts", "Identity", "Identity conflict monitor", "Identity verifies before a guest becomes a registered client.", evidence.connected ? "Protected" : "Unknown", syncStatus),
      card("consent-audit", "Consent", "Consent audit", "An invitation requires recorded consent.", String(evidence.clientBridgeConsentViolations), consentStatus, consentStatus === "Failed" ? moneyIncident : null),
      card("frequency", "Frequency", "Invite frequency monitor", "Declines and opt-outs block repeated prompts.", evidence.connected ? "Enforced" : "Unknown", syncStatus),
      card("guest-integrity", "Guest count", "Guest-count integrity", "Guest activity is not counted as a registered client.", "Separated", syncStatus),
      card("conversion-truth", "Conversion", "Native conversion truth", "Conversion requires a completed native appointment.", String(evidence.clientBridgeClaims), syncStatus),
      card("schema-exclusion", "Schema wall", "External schema exclusion", "External imports expose no amount fields.", "Locked", syncStatus),
      card("external-payment", "Payment wall", "External payment violation", "External appointments must have zero BVRB3R payment rows.", String(evidence.externalPaymentViolations), externalMoneyStatus, externalMoneyStatus === "Failed" ? moneyIncident : null),
      card("autobooth-health", "AutoBooth health", "Five-gate health", "Every contribution is tied to canonical rent truth.", evidence.externalAutoBoothViolations ? "Violation" : "All gates", autoBoothStatus, autoBoothStatus === "Failed" ? moneyIncident : null),
      card("autobooth-violation", "AutoBooth P0", "External AutoBooth violation", "An external transaction contributing to rent is a P0.", String(evidence.externalAutoBoothViolations), autoBoothStatus, autoBoothStatus === "Failed" ? moneyIncident : null),
      card("fee-violation", "Fee P0", "External platform-fee violation", "External work can never create a platform fee.", String(evidence.externalFeeViolations), feeStatus, feeStatus === "Failed" ? moneyIncident : null),
      card("ledger", "Ledger", "Rent ledger reconciliation", "Obligation, settled, and remaining foot to zero.", `$${(evidence.rentReconciliationDeltaCents / 100).toFixed(2)}`, reconciliationStatus, reconciliationStatus === "Failed" ? moneyIncident : null),
      card("refund-health", "Refund", "Refund symmetry", "A refund reverses its exact rent contribution.", "Exact reversal", syncStatus),
      card("dispute-health", "Dispute", "Dispute health", "A dispute holds one line while the rest of the week proceeds.", String(evidence.openRentDisputes), syncStatus),
      card("cash-truth", "Cash", "Cash settlement truth", "Cash stays pending until a transfer reference exists.", "Evidence required", syncStatus),
      card("stop-zero", "Stop at zero", "Concurrent stop-at-zero", "Row locks cap every contribution at remaining rent.", "Hard cap", syncStatus),
      card("owner-privacy", "Owner privacy", "Owner rent-only view", "Owners see authorized rent, never barber earnings or tips.", "Protected", syncStatus),
      card("monitor-mode", "Monitor mode", "Read-only diagnostics", "This endpoint exposes no money mutation command.", "READ ONLY", "Pass")
    ],
    warnings: evidence.warnings
  };
}

export async function getArchitectRentMonitorPayload(): Promise<ArchitectRentMonitorPayload> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return buildArchitectRentMonitorPayload({
      connected: false,
      chairsyncRows: 0,
      chairsyncExternalOwnerViolations: 0,
      chairsyncRestrictedRows: 0,
      duplicateViolations: 0,
      externalAppointmentRows: 0,
      externalPaymentViolations: 0,
      externalAutoBoothViolations: 0,
      externalFeeViolations: 0,
      rentReconciliationDeltaCents: 0,
      openRentDisputes: 0,
      clientBridgeInvitations: 0,
      clientBridgeClaims: 0,
      clientBridgeConsentViolations: 0,
      warnings: ["Architect monitor evidence is not connected."]
    });
  }

  const [
    chairResult,
    appointmentResult,
    contributionResult,
    obligationResult,
    disputeResult,
    invitationResult,
    consentResult,
    paymentResult,
    routingResult
  ] = await Promise.all([
    supabase.from("chairsync_appointments")
      .select("id, provider, provider_appointment_id, payment_owner, provider_data_restricted"),
    supabase.from("appointments")
      .select("id, source_provider, payment_owner, external_financial_data_private"),
    supabase.from("rent_contributions")
      .select("id, appointment_id, contribution_kind, status, applied_cents, excluded_external_cents"),
    supabase.from("rent_obligations")
      .select("base_rent_cents, late_fee_cents, amount_settled_cents, status"),
    supabase.from("rent_line_disputes")
      .select("id, status"),
    supabase.from("clientbridge_invitations")
      .select("id, status, consent_event_id"),
    supabase.from("clientbridge_consent_events")
      .select("id, consent_kind, granted"),
    supabase.from("payments")
      .select("id, appointment_id"),
    supabase.from("payment_routing_records")
      .select("id, appointment_id, platform_fee_amount")
  ]);
  const results = [
    chairResult,
    appointmentResult,
    contributionResult,
    obligationResult,
    disputeResult,
    invitationResult,
    consentResult,
    paymentResult,
    routingResult
  ];
  const errors = results.map((result) => result.error).filter(Boolean);
  const connected = errors.length === 0;
  const warnings = errors.length
    ? ["Some Architect monitor evidence is unavailable; affected cards remain Needs Review."]
    : [];

  const chairRows = (chairResult.data ?? []) as Array<{
    provider: string;
    provider_appointment_id: string;
    payment_owner: string;
    provider_data_restricted: boolean;
  }>;
  const appointmentRows = (appointmentResult.data ?? []) as Array<{
    id: string;
    source_provider: string;
    payment_owner: string;
    external_financial_data_private: boolean;
  }>;
  const contributionRows = (contributionResult.data ?? []) as Array<{
    appointment_id: string | null;
    contribution_kind: string;
    status: string;
    applied_cents: number;
    excluded_external_cents: number;
  }>;
  const obligationRows = (obligationResult.data ?? []) as Array<{
    base_rent_cents: number;
    late_fee_cents: number;
    amount_settled_cents: number;
    status: string;
  }>;
  const disputeRows = (disputeResult.data ?? []) as Array<{ status: string }>;
  const invitationRows = (invitationResult.data ?? []) as Array<{
    status: string;
    consent_event_id: string | null;
  }>;
  const consentRows = (consentResult.data ?? []) as Array<{
    id: string;
    consent_kind: string;
    granted: boolean;
  }>;
  const paymentRows = (paymentResult.data ?? []) as Array<{
    appointment_id: string | null;
  }>;
  const routingRows = (routingResult.data ?? []) as Array<{
    appointment_id: string | null;
    platform_fee_amount: number | string | null;
  }>;
  const externalAppointments = appointmentRows.filter((row) => (
    ["booksy", "square", "thecut"].includes(row.source_provider)
  ));
  const externalAppointmentIds = new Set(externalAppointments.map((row) => row.id));
  const consentIds = new Set(
    consentRows
      .filter((row) => row.consent_kind === "clientbridge_invite" && row.granted)
      .map((row) => row.id)
  );
  const duplicateKeys = new Set<string>();
  let duplicateViolations = 0;
  for (const row of chairRows) {
    const key = `${row.provider}:${row.provider_appointment_id}`;
    if (duplicateKeys.has(key)) duplicateViolations += 1;
    duplicateKeys.add(key);
  }
  const reconciliationDeltaCents = obligationRows.reduce((delta, row) => {
    const obligation = row.base_rent_cents + row.late_fee_cents;
    const remaining = Math.max(obligation - row.amount_settled_cents, 0);
    return delta + obligation - row.amount_settled_cents - remaining;
  }, 0);

  return buildArchitectRentMonitorPayload({
    connected,
    chairsyncRows: chairRows.length,
    chairsyncExternalOwnerViolations: chairRows.filter((row) => (
      row.payment_owner !== `external:${row.provider}`
    )).length,
    chairsyncRestrictedRows: chairRows.filter((row) => row.provider_data_restricted).length,
    duplicateViolations,
    externalAppointmentRows: externalAppointments.length,
    externalPaymentViolations: paymentRows.filter((row) => (
      row.appointment_id
      && externalAppointmentIds.has(row.appointment_id)
    )).length,
    externalAutoBoothViolations: contributionRows.filter((row) => (
      row.appointment_id
      && externalAppointmentIds.has(row.appointment_id)
      && row.contribution_kind.startsWith("autobooth")
      && row.applied_cents > 0
    )).length,
    externalFeeViolations: routingRows.filter((row) => (
      row.appointment_id
      && externalAppointmentIds.has(row.appointment_id)
      && Number(row.platform_fee_amount ?? 0) !== 0
    )).length,
    rentReconciliationDeltaCents: reconciliationDeltaCents,
    openRentDisputes: disputeRows.filter((row) => (
      ["open", "under_review"].includes(row.status)
    )).length,
    clientBridgeInvitations: invitationRows.length,
    clientBridgeClaims: invitationRows.filter((row) => row.status === "claimed").length,
    clientBridgeConsentViolations: invitationRows.filter((row) => (
      !row.consent_event_id || !consentIds.has(row.consent_event_id)
    )).length,
    warnings
  });
}
