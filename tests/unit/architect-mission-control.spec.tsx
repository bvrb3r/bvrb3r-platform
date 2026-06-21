import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchitectMissionControl } from "@/components/architect/mission-control/mission-control";
import { APPOINTMENT_ID } from "@/tests/unit/architect-debug-test-utils";

const fetchMock = vi.fn();
const clipboardWriteTextMock = vi.fn();
const APPROVED_REFUND_PAYMENT_ID = "2d2d2770-50dc-4e9d-9b05-6ea335a1e1bd";
const APPROVED_REFUND_APPOINTMENT_ID = "168b6424-d4a6-5d04-bfa0-1a2953fc4a38";
const SECOND_REFUND_PAYMENT_ID = "9be82cc2-5b5b-43c2-a381-d2c5852651e6";
const THIRD_REFUND_PAYMENT_ID = "0d72dad9-c8e4-465e-a43d-42f3a1523f50";
const FOURTH_REFUND_PAYMENT_ID = "929514f6-8e15-42f2-a9fb-7a9b75d5afda";

const ACTIVE_REFUND_TARGETS = [{
  appointmentId: APPROVED_REFUND_APPOINTMENT_ID,
  paymentId: APPROVED_REFUND_PAYMENT_ID,
  amount: 5,
  reason: "Cancelled appointment captured booking payment resolution",
  currentRoutingState: "blocked/manual_review/manual_review, released_at null, payout_executions target count must remain 0"
}, {
  appointmentId: "a47109d8-3365-58bf-90eb-011e3b8857c6",
  paymentId: SECOND_REFUND_PAYMENT_ID,
  amount: 5,
  reason: "Cancelled appointment captured booking payment resolution",
  currentRoutingState: "blocked/manual_review/manual_review, released_at null, payout_executions target count must remain 0"
}, {
  appointmentId: "c4629292-f905-5d88-ba9e-36a33dfa9d0a",
  paymentId: THIRD_REFUND_PAYMENT_ID,
  amount: 5,
  reason: "Cancelled appointment captured booking payment resolution",
  currentRoutingState: "blocked/manual_review/manual_review, released_at null, payout_executions target count must remain 0"
}, {
  appointmentId: "37cdb825-a65d-5cda-b58d-5b5efaedbfc0",
  paymentId: FOURTH_REFUND_PAYMENT_ID,
  amount: 5,
  reason: "Cancelled appointment captured booking payment resolution",
  currentRoutingState: "blocked/manual_review/manual_review, released_at null, payout_executions target count must remain 0"
}];

function createFinanceEvidence(activeTargets = ACTIVE_REFUND_TARGETS, refundLogs: Array<Record<string, unknown>> = []) {
  const refundCount = refundLogs.filter((log) => log.category === "refund").length;
  const totalRefundedAmount = refundLogs
    .filter((log) => log.category === "refund")
    .reduce((sum, log) => sum + Number(log.amount ?? 0), 0);

  return {
    activeRefundTargets: activeTargets,
    refundLogs,
    refundMetrics: {
      refundCount,
      totalRefundedAmount,
      failedRefundAttemptCount: refundLogs.filter((log) => log.category === "failed_refund").length,
      activeUnresolvedRefundBlockerCount: activeTargets.length,
      lastRefundTimestamp: refundLogs.find((log) => log.category === "refund")?.timestamp ?? null
    }
  };
}

function createRefundLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "refund:refund-approved-1",
    category: "refund",
    paymentId: APPROVED_REFUND_PAYMENT_ID,
    appointmentId: APPROVED_REFUND_APPOINTMENT_ID,
    refundId: "refund-approved-1",
    providerRefundId: "re_stripe_1",
    amount: 5,
    reason: "Cancelled appointment captured booking payment resolution",
    actorId: "platform-admin-1",
    actorRole: "platform_admin",
    source: "architect_finance_controlled_refund",
    timestamp: "2026-06-20T02:00:00.000Z",
    resultStatus: "succeeded",
    failureReason: null,
    routingState: "blocked/manual_review/manual_review",
    ...overrides
  };
}

function createFailedRefundLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "failed-refund:event-1",
    category: "failed_refund",
    paymentId: SECOND_REFUND_PAYMENT_ID,
    appointmentId: "a47109d8-3365-58bf-90eb-011e3b8857c6",
    refundId: null,
    providerRefundId: null,
    amount: 5,
    reason: "Cancelled appointment captured booking payment resolution",
    actorId: "platform-admin-1",
    actorRole: "platform_admin",
    source: "architect_finance_controlled_refund",
    timestamp: "2026-06-20T02:10:00.000Z",
    resultStatus: "failed",
    failureReason: "Canonical route rejected unsafe routing evidence.",
    routingState: "blocked/manual_review/manual_review",
    ...overrides
  };
}

function createResolvedSnapshot() {
  return {
    ...createSnapshot(),
    financeEvidence: createFinanceEvidence([], [
      createRefundLog(),
      createRefundLog({
        id: "refund:refund-approved-2",
        paymentId: SECOND_REFUND_PAYMENT_ID,
        appointmentId: "a47109d8-3365-58bf-90eb-011e3b8857c6",
        refundId: "refund-approved-2",
        providerRefundId: "re_stripe_2",
        timestamp: "2026-06-20T02:05:00.000Z"
      }),
      createRefundLog({
        id: "refund:refund-approved-3",
        paymentId: THIRD_REFUND_PAYMENT_ID,
        appointmentId: "c4629292-f905-5d88-ba9e-36a33dfa9d0a",
        refundId: "refund-approved-3",
        providerRefundId: "re_stripe_3",
        timestamp: "2026-06-20T02:10:00.000Z"
      }),
      createRefundLog({
        id: "refund:refund-approved-4",
        paymentId: FOURTH_REFUND_PAYMENT_ID,
        appointmentId: "37cdb825-a65d-5cda-b58d-5b5efaedbfc0",
        refundId: "refund-approved-4",
        providerRefundId: "re_stripe_4",
        timestamp: "2026-06-20T02:15:00.000Z"
      })
    ])
  };
}

function createSnapshot() {
  const incidentId = `completed_but_routing_missing:appointment:${APPOINTMENT_ID}`;
  return {
    ok: true,
    checkedAt: "2026-05-18T12:00:00.000Z",
    environment: {
      appEnv: "production",
      commitHash: "abc123",
      deploymentId: "dpl_123",
      branch: "main",
      buildTime: "2026-05-18T11:50:00.000Z"
    },
    health: [{
      key: "routing",
      label: "Routing",
      status: "critical",
      summary: "Completed paid appointment is missing payment routing.",
      lastCheckedAt: "2026-05-18T12:00:00.000Z"
    }, {
      key: "bookings",
      label: "Bookings",
      status: "healthy",
      summary: "Latest booking loop evidence is clean.",
      lastCheckedAt: "2026-05-18T12:00:00.000Z"
    }],
    incidents: [{
      id: incidentId,
      diagnosisCode: "completed_but_routing_missing",
      affectedEntity: `appointment ${APPOINTMENT_ID}`,
      affectedRole: "barber",
      affectedTable: "payment_routing_records",
      affectedRoute: "/api/architect/repairs/payment-routing",
      severity: "critical",
      confidence: "high",
      createdAt: "2026-05-18T12:00:00.000Z",
      recommendedAction: "Run Safe Repair: payment routing.",
      canRepair: true,
      repairType: "payment_routing",
      codexRequired: false,
      targetType: "appointment",
      targetId: APPOINTMENT_ID,
      headline: "Completed paid appointment is missing payment routing.",
      evidence: [
        "appointments.status = completed",
        "appointments.completed_at is populated",
        "payment.status=captured",
        "appointment.status=cancelled",
        "captured payment + cancelled appointment must remain blocked/manual_review until refund or reversal truth is resolved",
        "payment_routing_records lookup by appointment_id returned 0 rows",
        "No recent routing repair constraint failure was found."
      ],
      analysis: {
        likelyRootCause: "The payout-routing ledger was never created or repaired after completion.",
        confidence: 90,
        affectedLayer: "payment routing",
        failedInvariant: "completed + paid appointment must have a payment_routing_records row.",
        supportingEvidence: [`appointmentId=${APPOINTMENT_ID}`],
        ruledOut: ["payment capture exists"],
        safeRepairAvailable: true,
        codexRequired: false,
        nextBestAction: "Run payment routing repair."
      },
      sqlSnippets: []
    }],
    selectedIncidentId: incidentId,
    packets: {
      [incidentId]: {
        chatGptPacket: "DEBUG TYPE\nBVRB3R Mission Control Incident",
        codexPacket: "TITLE\nBVRB3R ROUTING FIX",
        incidentPacket: "{\"incident\":true}"
      }
    },
    schemaEvidence: {
      paymentRouting: {
        allowedValues: {
          payout_readiness_status: ["not_ready", "ready", "blocked"]
        }
      }
    },
    financeEvidence: createFinanceEvidence()
  };
}

function createNoIncidentSnapshot() {
  const snapshot = createSnapshot();
  return {
    ...snapshot,
    incidents: [],
    selectedIncidentId: null,
    packets: {},
    financeEvidence: createFinanceEvidence([], [])
  };
}

function createAllPassEvidenceCard(id: string, label: string, metricValue = "1") {
  return {
    id,
    label,
    department: "CEO",
    workflow: "100 Pass Checklist",
    status: "Pass",
    summary: `${label} evidence is connected and passing.`,
    evidence: [`${label} verified from connected evidence.`],
    metricValue
  };
}

function createAllPassSnapshot() {
  const snapshot = createSnapshot();
  const incidentId = "packet_ready:regression:all-pass";
  const selectedIncident = {
    ...snapshot.incidents[0],
    id: incidentId,
    severity: "warning",
    headline: "Regression packet is available.",
    evidence: ["packet generated", "validation checklist available"]
  };

  return {
    ...snapshot,
    incidents: [selectedIncident],
    selectedIncidentId: incidentId,
    packets: {
      [incidentId]: {
        chatGptPacket: "DEBUG TYPE\nBVRB3R Mission Control Incident",
        codexPacket: "TITLE\nALL PASS CHECKLIST PACKET",
        incidentPacket: "{\"incident\":true}"
      }
    },
    foundation: {
      navigationLanes: [],
      defaultLaneId: "ceo",
      ceoCommandCenter: [
        createAllPassEvidenceCard("overall-platform-status", "Overall platform status", "Pass"),
        createAllPassEvidenceCard("ceo-platform-fees", "Platform fees", "$1"),
        createAllPassEvidenceCard("ceo-total-users", "Total Users"),
        createAllPassEvidenceCard("ceo-clients-total", "Clients"),
        createAllPassEvidenceCard("ceo-barbers-total", "Barbers"),
        createAllPassEvidenceCard("ceo-shop-owners-total", "Shop Owners"),
        createAllPassEvidenceCard("ceo-total-bookings", "Total Bookings"),
        createAllPassEvidenceCard("ceo-todays-bookings", "Today's Bookings"),
        createAllPassEvidenceCard("ceo-payments-captured", "Payments", "$1"),
        createAllPassEvidenceCard("ceo-refund-count", "Refund Count", "4"),
        createAllPassEvidenceCard("ceo-total-refunded", "Total Refunded Amount", "$20"),
        createAllPassEvidenceCard("ceo-failed-refund-attempts", "Failed Refund Attempts", "0"),
        createAllPassEvidenceCard("ceo-active-refund-blockers", "Active Refund Blockers", "0"),
        createAllPassEvidenceCard("ceo-last-refund-timestamp", "Last Refund Timestamp", "2026-06-20T02:00:00.000Z"),
        createAllPassEvidenceCard("ceo-payment-routing-health", "Payment routing health", "Pass"),
        createAllPassEvidenceCard("ceo-payout-readiness-health", "Payout readiness health", "Pass"),
        createAllPassEvidenceCard("ceo-culture-health", "Culture health", "Pass"),
        createAllPassEvidenceCard("ceo-active-shops", "Active Shops"),
        createAllPassEvidenceCard("ceo-active-barbers", "Active Barbers"),
        createAllPassEvidenceCard("ceo-critical-incidents", "Critical Incidents", "0"),
        createAllPassEvidenceCard("ceo-regression-deployment-health", "Deployment / Regression", "Pass"),
        createAllPassEvidenceCard("source-vault-status", "Source Vault", "Pass"),
        createAllPassEvidenceCard("agent-status", "Agent Status", "Pass")
      ],
      departmentLanes: [],
      coreLoopValidators: [],
      incidentTypes: [],
      sourceVault: [{
        id: "architect-super-master-plan",
        sourceName: "Architect Super Master Plan",
        category: "Architect",
        purpose: "Governs Mission Control.",
        linkedSystemArea: "Architect",
        status: "Active",
        ingestionStatus: "registered, not ingested"
      }],
      actionRegistry: [{
        id: "refund",
        label: "Refund",
        riskClass: "Unsafe / blocked",
        department: "Finance",
        description: "Blocked in v1.",
        allowed: false,
        approvalRequired: true,
        status: "Pass"
      }],
      agentRegistry: [{
        id: "architect-prime",
        name: "Architect Prime",
        department: "Architect Prime",
        job: "Govern the intelligence layer.",
        dataAccess: "Read-only platform evidence.",
        actionAccess: "Read-only.",
        autonomyLevel: "Level 0 Read-only",
        successMetric: "No unsafe autonomous action.",
        failureRule: "Any money or account mutation is blocked.",
        currentStatus: "Pass"
      }],
      codexFailureClasses: []
    },
    financeEvidence: createFinanceEvidence([], [createRefundLog()])
  };
}

describe("architect mission control", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    clipboardWriteTextMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteTextMock },
      configurable: true
    });
  });

  it("renders the CEO one-screen command center cards", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    await waitFor(() => expect(screen.getByText("BVRB3R Architect Operating System")).toBeInTheDocument());
    expect(screen.getByTestId("architect-mission-control-root").className).not.toMatch(/min-h|h-screen|100svh|items-center|justify-end/);
    expect(screen.getByText("CEO Command Center")).toBeInTheDocument();
    expect(screen.getByText("One-screen platform posture")).toBeInTheDocument();
    expect(screen.getByText(/App Readiness is version-scoped/)).toBeInTheDocument();
    expect(screen.getByText("V1 Readiness")).toBeInTheDocument();
    expect(screen.getByText("V1 required pass")).toBeInTheDocument();
    expect(screen.getByText("V1 required failed")).toBeInTheDocument();
    expect(screen.getByText("V1 needs review")).toBeInTheDocument();
    expect(screen.getByText("Critical blockers")).toBeInTheDocument();
    expect(screen.getByText("Future parked")).toBeInTheDocument();
    expect(screen.getByText("Current Release Blockers")).toBeInTheDocument();
    expect(screen.getByText("Evidence Gaps")).toBeInTheDocument();
    expect(screen.getByText("Foundation Blockers Before AI")).toBeInTheDocument();
    expect(screen.getByText("Overall status")).toBeInTheDocument();
    expect(screen.getByTestId("architect-ceo-card-platform-health")).toBeInTheDocument();
    expect(screen.getByText("Money / App Revenue")).toBeInTheDocument();
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText("Barbers")).toBeInTheDocument();
    expect(screen.getByText("Shop Owners")).toBeInTheDocument();
    expect(screen.getByText("Bookings")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("Refund Evidence")).toBeInTheDocument();
    expect(screen.getByText("Routing / Payout Readiness")).toBeInTheDocument();
    expect(screen.getByText("Culture")).toBeInTheDocument();
    expect(screen.getByText("Active Shops / Active Barbers")).toBeInTheDocument();
    expect(screen.getByText("Critical Incidents")).toBeInTheDocument();
    expect(screen.getByText("Deployment / Regression")).toBeInTheDocument();
    expect(screen.getByText("Source Vault")).toBeInTheDocument();
    expect(screen.getByText("Action Registry")).toBeInTheDocument();
    expect(screen.getByText("Hive AI")).toBeInTheDocument();
    expect(screen.getByText("Codex Packets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy codex packet/i })).toBeInTheDocument();
    expect(screen.getByTestId("architect-ceo-card-platform-health")).toHaveClass("rounded-[18px]", "bg-black/24");
    [
      "Platform Health",
      "Money / App Revenue",
      "Total Users",
      "Clients",
      "Barbers",
      "Shop Owners",
      "Bookings",
      "Payments",
      "Refund Evidence",
      "Routing / Payout Readiness",
      "Culture",
      "Active Shops / Active Barbers",
      "Critical Incidents",
      "Deployment / Regression",
      "Source Vault",
      "Action Registry",
      "Hive AI",
      "Codex Packets"
    ].forEach((label) => {
      expect(screen.getByRole("button", { name: `Open ${label} detail` })).toBeInTheDocument();
    });
  });

  it("shows Officer Cleanup guardrails in the Hive AI detail popup", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Hive AI detail" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Hive AI");
    expect(dialog).toHaveTextContent(/Officer Assistant\(s\) registered/);
    expect(dialog).toHaveTextContent("All Officer Assistants are Level 1 Draft mode with read-only evidence access.");
    expect(dialog).toHaveTextContent("Officer Assistants do not mutate money, payouts, refunds, routing, roles, team relationships, schema, deployments, or issue status.");
    expect(dialog).toHaveTextContent("Prompt generation or officer review never marks an issue Pass by itself.");
  });

  it("marks overall readiness Failed when a critical checklist item fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    const readiness = await screen.findByTestId("architect-ceo-readiness");
    expect(within(readiness).getAllByText("Failed").length).toBeGreaterThan(0);
    expect(Number(screen.getByTestId("ceo-readiness-failed-count").textContent)).toBeGreaterThan(0);
    expect(Number(screen.getByTestId("ceo-readiness-critical-blockers").textContent)).toBeGreaterThan(0);
    expect(screen.getByTestId("ceo-readiness-current-release-blockers")).toHaveTextContent("Payment health");
    expect(readiness).not.toHaveTextContent("100% Pass");
  });

  it("marks overall readiness Needs Review when required evidence is missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createNoIncidentSnapshot()
    });

    render(<ArchitectMissionControl />);

    const readiness = await screen.findByTestId("architect-ceo-readiness");
    expect(within(readiness).getAllByText("Needs Review").length).toBeGreaterThan(0);
    expect(screen.getByTestId("ceo-readiness-critical-blockers")).toHaveTextContent("0");
    expect(Number(screen.getByTestId("ceo-readiness-needs-review-count").textContent)).toBeGreaterThan(0);
    expect(readiness).not.toHaveTextContent("100% Pass");
  });

  it("only shows 100% Pass when every CEO checklist item passes", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createAllPassSnapshot()
    });

    render(<ArchitectMissionControl />);

    const readiness = await screen.findByTestId("architect-ceo-readiness");
    expect(within(readiness).getByText("100% Pass")).toBeInTheDocument();
    expect(screen.getByTestId("ceo-readiness-pass-count")).toHaveTextContent("18");
    expect(screen.getByTestId("ceo-readiness-failed-count")).toHaveTextContent("0");
    expect(screen.getByTestId("ceo-readiness-needs-review-count")).toHaveTextContent("0");
    expect(screen.getByTestId("ceo-readiness-critical-blockers")).toHaveTextContent("0");
  });

  it("does not render the duplicate body Mission Control Navigation", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    await screen.findByText("BVRB3R Architect Operating System");

    expect(screen.queryByText("BVRB3R Mission Control Navigation")).not.toBeInTheDocument();
    expect(screen.getByText("CEO Command Center")).toBeInTheDocument();
  });

  it("opens CEO card detail popups with evidence and lane routing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Platform Health detail" }));

    const dialog = screen.getByRole("dialog", { name: "Platform Health" });
    expect(within(dialog).getByText("Platform Health")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Failed").length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByText("Checklist status")).toBeInTheDocument();
    expect(within(dialog).getByText("What must be true for Pass")).toBeInTheDocument();
    expect(within(dialog).getByText("What is currently true")).toBeInTheDocument();
    expect(within(dialog).getByText("What is missing or failed")).toBeInTheDocument();
    expect(within(dialog).getByText("Why it matters")).toBeInTheDocument();
    expect(within(dialog).getByText("Evidence")).toBeInTheDocument();
    expect(within(dialog).getByText("Next action")).toBeInTheDocument();
    expect(within(dialog).getByText("Platform Health must report Pass from connected, role-safe evidence. Missing evidence stays Needs Review, and failed evidence stays Failed.")).toBeInTheDocument();
    expect(within(dialog).getByText("No historical data connected yet")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open Lane" })).toHaveAttribute("href", "/architect/technology");

    fireEvent.click(within(dialog).getByLabelText("Close CEO card detail"));

    expect(screen.queryByRole("dialog", { name: "Platform Health" })).not.toBeInTheDocument();
  });

  it("keeps missing CEO metrics as Needs Review and Not connected", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    const totalUsersCard = (await screen.findByText("Total Users")).closest("article");
    expect(totalUsersCard).toHaveTextContent("Needs Review");
    expect(totalUsersCard).toHaveTextContent("Not connected");
    expect(totalUsersCard).not.toHaveTextContent("Pass");
  });

  it("renders a routed department lane without the CEO scoreboard", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl laneId="finance" />);

    await waitFor(() => expect(screen.getByText("Finance Mission Control")).toBeInTheDocument());
    expect(screen.getByText("Finance Mission Control")).toBeInTheDocument();
    expect(screen.getByText("Payment health")).toBeInTheDocument();
    expect(screen.getByText("Cancelled/captured refund resolution")).toBeInTheDocument();
    expect(screen.getByText("Repair audit coverage")).toBeInTheDocument();
    expect(screen.getByTestId("architect-control-plane-boundary")).toHaveTextContent("Architect detects issues before it executes actions.");
    expect(screen.getByTestId("architect-control-plane-boundary")).toHaveTextContent("missing UI, missing auth, or missing environment evidence as Needs Review / Not connected");
    expect(screen.queryByText("CEO Command Center")).not.toBeInTheDocument();
    expect(screen.queryByText("Product Mission Control")).not.toBeInTheDocument();
  });

  it("opens Finance issue detail and copies a deterministic Codex repair prompt", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl laneId="finance" />);

    await waitFor(() => expect(screen.getByText("Finance Mission Control")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Open Payment health issue detail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Stripe status issue detail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Routing health issue detail" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Payment health issue detail" }));

    const dialog = screen.getByRole("dialog", { name: "Payment health" });
    expect(within(dialog).getByText("Finance")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Failed").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("What must be true for Pass")).toBeInTheDocument();
    expect(within(dialog).getByText("What is currently true")).toBeInTheDocument();
    expect(within(dialog).getByText("What is missing or failed")).toBeInTheDocument();
    expect(within(dialog).getByText("Evidence rows")).toBeInTheDocument();
    expect(within(dialog).getByText("Why it matters")).toBeInTheDocument();
    expect(within(dialog).getByText("Suggested fix direction")).toBeInTheDocument();
    expect(within(dialog).getByText("Risk notes")).toBeInTheDocument();
    expect(within(dialog).getByText("Required validation")).toBeInTheDocument();
    expect(within(dialog).getByText("Required tests")).toBeInTheDocument();
    expect(within(dialog).getByText(/Payment health is currently Failed\. Payment health uses appointment\/payment\/routing truth\./)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Generate Codex Prompt" }));

    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Building repair packet..." })).toBeDisabled());
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Copy & Paste in Codex" })).toBeInTheDocument());

    const copiedPrompt = clipboardWriteTextMock.mock.calls.at(-1)?.[0] as string;
    expect(copiedPrompt).toContain("Exact goal:");
    expect(copiedPrompt).toContain("Exact issue name: Payment health");
    expect(copiedPrompt).toContain("Lane: Finance");
    expect(copiedPrompt).toContain("Affected role: Architect / Finance operator");
    expect(copiedPrompt).toContain("Affected flow: Payments finance readiness");
    expect(copiedPrompt).toContain("Current status: Failed");
    expect(copiedPrompt).toContain("V1 Codex Prompt Doctrine:");
    expect(copiedPrompt).toContain("Good = Pass.");
    expect(copiedPrompt).toContain("Wrong, broken, incomplete, confusing, unsafe, unverified, or fake = Failed.");
    expect(copiedPrompt).toContain("Do not mark Pass unless verified.");
    expect(copiedPrompt).toContain("Missing data = Needs Review / Not connected.");
    expect(copiedPrompt).toContain("Server owns serious business logic.");
    expect(copiedPrompt).toContain("UI must not calculate final money.");
    expect(copiedPrompt).toContain("Architect prompt generation does not repair the issue by itself.");
    expect(copiedPrompt).toContain("Payment health uses appointment/payment/routing truth.");
    expect(copiedPrompt).toContain("Evidence groups:");
    expect(copiedPrompt).toContain("Passing evidence:");
    expect(copiedPrompt).toContain("- appointments.status = completed");
    expect(copiedPrompt).toContain("- appointments.completed_at is populated");
    expect(copiedPrompt).toContain("- payment.status = captured");
    const copiedPassingSection = copiedPrompt.split("Passing evidence:")[1].split("Failed evidence:")[0];
    expect(copiedPassingSection.match(/- payment.status = captured/g)).toHaveLength(1);
    expect(copiedPrompt).toContain("Failed evidence:");
    expect(copiedPrompt).toContain("- payment_routing_records lookup by appointment_id returned 0 rows");
    expect(copiedPrompt).toContain("Missing evidence:");
    expect(copiedPrompt).toContain("Conflicting evidence:");
    expect(copiedPrompt).toContain("- payment.status = captured while appointment.status = cancelled");
    expect(copiedPrompt.split("Conflicting evidence:")[1].split("Neutral / Context evidence:")[0]).not.toContain("- None.");
    expect(copiedPrompt.split("Missing evidence:")[1].split("Conflicting evidence:")[0]).not.toContain("appointment.status=cancelled");
    expect(copiedPrompt).toContain("Neutral / Context evidence:");
    expect(copiedPrompt).toContain("- No recent routing repair constraint failure was found.");
    expect(copiedPrompt).toContain("Not inspected yet:");
    expect(copiedPrompt).toContain("- Appointment existence has not been inspected.");
    expect(copiedPrompt).toContain("- Payment existence has not been inspected.");
    expect(copiedPrompt).toContain("- Status history has not been inspected.");
    expect(copiedPrompt).toContain("- Routing state has not been inspected.");
    expect(copiedPrompt).toContain("- Payout release guard has not been inspected.");
    expect(copiedPrompt).toContain("Root-cause hypothesis:");
    const rootCauseSection = copiedPrompt.split("Root-cause hypothesis:")[1].split("Primary repair target:")[0];
    expect(rootCauseSection).toContain("Payment Health is failing because completed/captured money evidence is not reconciled to a payment routing record.");
    expect(rootCauseSection).not.toContain("appointments.status = completed");
    expect(rootCauseSection).not.toContain("payment.status = captured");
    expect(rootCauseSection).not.toContain("payment_routing_records lookup by appointment_id returned 0 rows");
    expect(rootCauseSection).not.toContain("...");
    expect(copiedPrompt).toContain("Primary repair target:");
    expect(copiedPrompt).toContain("Server-side payment routing creation/reconciliation after payment capture and appointment completion.");
    expect(copiedPrompt).toContain("First inspection step:");
    expect(copiedPrompt).toContain("Inspect the completed appointment with captured payment and missing routing record. Do not start by editing UI.");
    expect(copiedPrompt).toContain("Separate conflict path:");
    expect(copiedPrompt).toContain("Captured payments attached to cancelled appointments must be investigated separately from completed/captured appointment routing.");
    expect(copiedPrompt).toContain("Files / areas to inspect:");
    expect(copiedPrompt).toContain("Role and permission rules:");
    expect(copiedPrompt).toContain("Data / source-of-truth rules:");
    expect(copiedPrompt).toContain("Action rules:");
    expect(copiedPrompt).toContain("Money rules:");
    expect(copiedPrompt).toContain("Booking lifecycle rules:");
    expect(copiedPrompt).toContain("payment_routing_records table");
    expect(copiedPrompt).toContain("Acceptance criteria:");
    expect(copiedPrompt).toContain("Tests to run:");
    expect(copiedPrompt).toContain("npm run typecheck must pass.");
    expect(copiedPrompt).toContain("npm run build must pass.");
    expect(copiedPrompt).toContain("No fake Pass states.");
    expect(copiedPrompt).toContain("Do not stage unrelated dirty files.");
    expect(within(dialog).getAllByText("Failed").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows controlled refund actions only for approved active cancelled captured Finance issues", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Cancelled/captured refund resolution issue detail" }));

    const paymentDialog = screen.getByRole("dialog", { name: "Cancelled/captured refund resolution" });
    expect(within(paymentDialog).getByTestId("controlled-refund-resolution")).toBeInTheDocument();
    expect(within(paymentDialog).getByText("Controlled refund resolution")).toBeInTheDocument();
    expect(within(paymentDialog).getByText(APPROVED_REFUND_APPOINTMENT_ID)).toBeInTheDocument();
    expect(within(paymentDialog).getByText(APPROVED_REFUND_PAYMENT_ID)).toBeInTheDocument();
    expect(within(paymentDialog).getAllByRole("button", { name: /Refund \$5 through canonical route for payment/ })).toHaveLength(4);

    fireEvent.click(within(paymentDialog).getByLabelText("Close issue detail"));
    fireEvent.click(screen.getByRole("button", { name: "Open Stripe status issue detail" }));

    const stripeDialog = screen.getByRole("dialog", { name: "Stripe status" });
    expect(within(stripeDialog).queryByTestId("controlled-refund-resolution")).not.toBeInTheDocument();
    expect(within(stripeDialog).queryByRole("button", { name: /Refund \$5 through canonical route/ })).not.toBeInTheDocument();
  });

  it("requires exact typed confirmation before calling the canonical refund route", async () => {
    const resolvedAfterFirstRefund = {
      ...createSnapshot(),
      financeEvidence: createFinanceEvidence(ACTIVE_REFUND_TARGETS.slice(1), [createRefundLog()])
    };
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createSnapshot()
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          refund: {
            id: "refund-approved-1",
            payment_id: APPROVED_REFUND_PAYMENT_ID,
            amount: 5,
            reason: "Cancelled appointment captured booking payment resolution",
            provider_refund_id: "re_stripe_1",
            refunded_at: "2026-06-20T02:00:00.000Z"
          },
          payment: {
            id: APPROVED_REFUND_PAYMENT_ID,
            paymentStatus: "refunded"
          },
          summary: {
            refundedAmount: 5
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => resolvedAfterFirstRefund
      });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Cancelled/captured refund resolution issue detail" }));

    const dialog = screen.getByRole("dialog", { name: "Cancelled/captured refund resolution" });
    const target = within(dialog).getByTestId(`controlled-refund-${APPROVED_REFUND_PAYMENT_ID}`);
    const refundButton = within(target).getByRole("button", { name: `Refund $5 through canonical route for payment ${APPROVED_REFUND_PAYMENT_ID}` });

    expect(refundButton).toBeDisabled();

    fireEvent.change(within(target).getByLabelText(`Type REFUND 5 for payment ${APPROVED_REFUND_PAYMENT_ID}`), {
      target: { value: "refund 5" }
    });
    expect(refundButton).toBeDisabled();

    fireEvent.change(within(target).getByLabelText(`Type REFUND 5 for payment ${APPROVED_REFUND_PAYMENT_ID}`), {
      target: { value: "REFUND 5" }
    });
    expect(refundButton).toBeEnabled();

    fireEvent.click(refundButton);

    await waitFor(() => expect(within(dialog).getByTestId("active-refund-target-count")).toHaveTextContent("3"));
    expect(within(dialog).queryByTestId(`controlled-refund-${APPROVED_REFUND_PAYMENT_ID}`)).not.toBeInTheDocument();
    expect(screen.getByTestId("finance-logs")).toHaveTextContent("refund-approved-1");
    expect(screen.getByTestId("finance-logs")).toHaveTextContent(APPROVED_REFUND_PAYMENT_ID);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/payments/${APPROVED_REFUND_PAYMENT_ID}/refund`);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 5,
        reason: "Cancelled appointment captured booking payment resolution",
        source: "architect_finance_controlled_refund",
        confirmation: "REFUND 5",
        incidentCode: "cancelled_captured_refund_missing"
      })
    });
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("stripe");
  });

  it("handles refund 403 responses without changing the Finance issue status", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createSnapshot()
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Only owner, manager, or front desk can manage this payment action." })
      });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Cancelled/captured refund resolution issue detail" }));

    const dialog = screen.getByRole("dialog", { name: "Cancelled/captured refund resolution" });
    const target = within(dialog).getByTestId(`controlled-refund-${APPROVED_REFUND_PAYMENT_ID}`);
    fireEvent.change(within(target).getByLabelText(`Type REFUND 5 for payment ${APPROVED_REFUND_PAYMENT_ID}`), {
      target: { value: "REFUND 5" }
    });
    fireEvent.click(within(target).getByRole("button", { name: `Refund $5 through canonical route for payment ${APPROVED_REFUND_PAYMENT_ID}` }));

    await waitFor(() => expect(within(target).getByText("Refund failed.")).toBeInTheDocument());
    expect(within(target).getByText(/owner, manager, or front desk/i)).toBeInTheDocument();
    expect(within(dialog).getAllByText("Needs Review").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("Pass")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hides resolved refunded payments from active targets and shows them in Finance Logs", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createResolvedSnapshot()
    });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Cancelled/captured refund resolution issue detail" }));

    const dialog = screen.getByRole("dialog", { name: "Cancelled/captured refund resolution" });
    expect(within(dialog).getByTestId("controlled-refund-resolution")).toHaveTextContent("No active cancelled/captured refund targets. Refund history is available in Finance Logs.");
    expect(within(dialog).queryByTestId(`controlled-refund-${APPROVED_REFUND_PAYMENT_ID}`)).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId("controlled-batch-refund")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Open Finance Logs" }));

    const logs = await screen.findByTestId("finance-logs");
    expect(logs).toHaveTextContent("Refund count");
    expect(logs).toHaveTextContent("4");
    expect(logs).toHaveTextContent("Total refunded");
    expect(logs).toHaveTextContent("$20");
    expect(logs).toHaveTextContent("Active blockers");
    expect(logs).toHaveTextContent(APPROVED_REFUND_PAYMENT_ID);
    expect(logs).toHaveTextContent("refund-approved-1");
    expect(logs).toHaveTextContent("re_stripe_1");
  });

  it("searches Finance Logs by payment, appointment, refund, provider refund ID, and reason", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createResolvedSnapshot()
    });

    render(<ArchitectMissionControl laneId="finance" />);

    const logs = await screen.findByTestId("finance-logs");
    const search = within(logs).getByRole("textbox", { name: "Search Finance Logs" });

    fireEvent.change(search, { target: { value: "refund-approved-3" } });
    expect(logs).toHaveTextContent("refund-approved-3");
    expect(logs).not.toHaveTextContent("refund-approved-1");

    fireEvent.change(search, { target: { value: THIRD_REFUND_PAYMENT_ID } });
    expect(logs).toHaveTextContent(THIRD_REFUND_PAYMENT_ID);
    expect(logs).not.toHaveTextContent(APPROVED_REFUND_PAYMENT_ID);

    fireEvent.change(search, { target: { value: "c4629292-f905-5d88-ba9e-36a33dfa9d0a" } });
    expect(logs).toHaveTextContent("c4629292-f905-5d88-ba9e-36a33dfa9d0a");

    fireEvent.change(search, { target: { value: "re_stripe_2" } });
    expect(logs).toHaveTextContent("re_stripe_2");

    fireEvent.change(search, { target: { value: "captured booking payment resolution" } });
    expect(logs).toHaveTextContent("refund-approved-1");
    expect(logs).toHaveTextContent("refund-approved-4");
  });

  it("filters Finance Logs to failed refund attempts", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...createSnapshot(),
        financeEvidence: createFinanceEvidence([], [createRefundLog(), createFailedRefundLog()])
      })
    });

    render(<ArchitectMissionControl laneId="finance" />);

    const logs = await screen.findByTestId("finance-logs");
    expect(logs).toHaveTextContent("refund-approved-1");
    expect(logs).toHaveTextContent("Canonical route rejected unsafe routing evidence.");

    fireEvent.click(within(logs).getByRole("button", { name: "Failed refund attempts" }));

    expect(logs).not.toHaveTextContent("refund-approved-1");
    expect(logs).toHaveTextContent("Canonical route rejected unsafe routing evidence.");
    expect(logs).toHaveTextContent(SECOND_REFUND_PAYMENT_ID);
  });

  it("renders CEO refund metrics from connected evidence", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createResolvedSnapshot()
    });

    render(<ArchitectMissionControl />);

    const refundCard = await screen.findByTestId("architect-ceo-card-refund-evidence");
    expect(refundCard).toHaveTextContent("Refund Evidence");
    expect(refundCard).toHaveTextContent("4 / $20");
    expect(refundCard).toHaveTextContent("Active refund blockers: 0");
    expect(refundCard).toHaveTextContent("Failed refund attempts: 0");
    expect(refundCard).toHaveTextContent("Last refund: 2026-06-20T02:00:00.000Z");
  });

  it("requires exact batch confirmation and refunds sequentially through the canonical route", async () => {
    const resolvedSnapshot = createResolvedSnapshot();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createSnapshot()
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refund: { id: "refund-batch-1" }, payment: { paymentStatus: "refunded" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refund: { id: "refund-batch-2" }, payment: { paymentStatus: "refunded" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refund: { id: "refund-batch-3" }, payment: { paymentStatus: "refunded" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refund: { id: "refund-batch-4" }, payment: { paymentStatus: "refunded" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => resolvedSnapshot
      });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Cancelled/captured refund resolution issue detail" }));
    const dialog = screen.getByRole("dialog", { name: "Cancelled/captured refund resolution" });
    const batch = within(dialog).getByTestId("controlled-batch-refund");
    const batchButton = within(batch).getByRole("button", { name: "Refund all 4 active targets through canonical route" });

    expect(batch).toHaveTextContent("Batch action covers 4 active eligible target(s), total $20.");
    expect(batchButton).toBeDisabled();

    fireEvent.change(within(batch).getByRole("textbox", { name: "Type batch refund confirmation" }), {
      target: { value: "REFUND ALL 4 FOR $20.00" }
    });
    expect(batchButton).toBeDisabled();

    fireEvent.change(within(batch).getByRole("textbox", { name: "Type batch refund confirmation" }), {
      target: { value: "REFUND ALL 4 FOR $20" }
    });
    expect(batchButton).toBeEnabled();

    fireEvent.click(batchButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    await waitFor(() => expect(within(dialog).getByTestId("controlled-refund-resolution")).toHaveTextContent("No active cancelled/captured refund targets."));
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.slice(1, 5).map((call) => call[0])).toEqual(ACTIVE_REFUND_TARGETS.map((target) => `/api/payments/${target.paymentId}/refund`));
    fetchMock.mock.calls.slice(1, 5).forEach((call) => {
      expect(call[1]).toMatchObject({
        method: "POST",
        body: expect.stringContaining("\"source\":\"architect_finance_controlled_refund\"")
      });
    });
  });

  it("stops controlled batch refunds on the first failure", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createSnapshot()
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refund: { id: "refund-batch-1" }, payment: { paymentStatus: "refunded" } })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "Existing full refund evidence already exists." })
      });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Cancelled/captured refund resolution issue detail" }));
    const dialog = screen.getByRole("dialog", { name: "Cancelled/captured refund resolution" });
    const batch = within(dialog).getByTestId("controlled-batch-refund");

    fireEvent.change(within(batch).getByRole("textbox", { name: "Type batch refund confirmation" }), {
      target: { value: "REFUND ALL 4 FOR $20" }
    });
    fireEvent.click(within(batch).getByRole("button", { name: "Refund all 4 active targets through canonical route" }));

    await waitFor(() => expect(batch).toHaveTextContent("Batch stopped after 1 successful refund(s). Existing full refund evidence already exists."));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/payments/${APPROVED_REFUND_PAYMENT_ID}/refund`);
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/payments/${SECOND_REFUND_PAYMENT_ID}/refund`);
    expect(fetchMock.mock.calls[3][0]).toBe("/api/architect/mission-control");
    expect(fetchMock.mock.calls.find((call) => call[0] === `/api/payments/${THIRD_REFUND_PAYMENT_ID}/refund`)).toBeUndefined();
  });

  it("does not show batch refund controls for a single active target", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...createSnapshot(),
        financeEvidence: createFinanceEvidence([ACTIVE_REFUND_TARGETS[0]], [])
      })
    });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Cancelled/captured refund resolution issue detail" }));

    const dialog = screen.getByRole("dialog", { name: "Cancelled/captured refund resolution" });
    expect(within(dialog).getByTestId("active-refund-target-count")).toHaveTextContent("1");
    expect(within(dialog).queryByTestId("controlled-batch-refund")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId(`controlled-refund-${APPROVED_REFUND_PAYMENT_ID}`)).toBeInTheDocument();
  });

  it("keeps Finance from fake Pass when refund audit or log evidence is missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...createSnapshot(),
        financeEvidence: createFinanceEvidence([], [])
      })
    });

    render(<ArchitectMissionControl laneId="finance" />);

    const logs = await screen.findByTestId("finance-logs");
    expect(logs).toHaveTextContent("Refund count");
    expect(logs).toHaveTextContent("0");
    expect(logs).toHaveTextContent("Total refunded");
    expect(logs).toHaveTextContent("$0");
    expect(logs).toHaveTextContent("Needs Review");
    expect(screen.getByText("Cancelled/captured refund resolution").closest("article")).toHaveTextContent("Needs Review");
    expect(screen.getByText("Cancelled/captured refund resolution").closest("article")).toHaveTextContent("Refund/reversal evidence must be connected before Finance can Pass.");
  });

  it("shows a manual copy textarea when Codex prompt clipboard copy fails", async () => {
    clipboardWriteTextMock.mockRejectedValueOnce(new Error("clipboard blocked"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Routing health issue detail" }));

    const dialog = screen.getByRole("dialog", { name: "Routing health" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Generate Codex Prompt" }));

    const textarea = await within(dialog).findByRole("textbox", { name: "Generated Codex repair prompt" });
    const promptValue = (textarea as HTMLTextAreaElement).value;
    expect(promptValue).toContain("Exact issue name: Routing health");
    expect(promptValue).toContain("No fake Pass states.");
    expect(promptValue).toContain("Dirty files untouched");
    expect(within(dialog).getByText("Clipboard unavailable. Copy the prompt manually.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copy & Paste in Codex" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("copies generated packets", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    await waitFor(() => expect(screen.getByRole("button", { name: /copy codex packet/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /copy codex packet/i }));

    await waitFor(() => expect(clipboardWriteTextMock).toHaveBeenCalledWith(expect.stringContaining("BVRB3R ROUTING FIX")));
    expect(screen.getByText("Packet copied.")).toBeInTheDocument();
  });
});
