import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchitectMissionControl } from "@/components/architect/mission-control/mission-control";
import { APPOINTMENT_ID } from "@/tests/unit/architect-debug-test-utils";

const fetchMock = vi.fn();
const clipboardWriteTextMock = vi.fn();
const APPROVED_REFUND_PAYMENT_ID = "2d2d2770-50dc-4e9d-9b05-6ea335a1e1bd";
const APPROVED_REFUND_APPOINTMENT_ID = "168b6424-d4a6-5d04-bfa0-1a2953fc4a38";

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
    }
  };
}

function createNoIncidentSnapshot() {
  const snapshot = createSnapshot();
  return {
    ...snapshot,
    incidents: [],
    selectedIncidentId: null,
    packets: {}
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
    }
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
    expect(screen.getByText("App Readiness")).toBeInTheDocument();
    expect(screen.getByText("Pass count")).toBeInTheDocument();
    expect(screen.getByText("Failed count")).toBeInTheDocument();
    expect(screen.getByText("Needs Review count")).toBeInTheDocument();
    expect(screen.getByText("Critical blockers")).toBeInTheDocument();
    expect(screen.getByText("Overall status")).toBeInTheDocument();
    expect(screen.getByTestId("architect-ceo-card-platform-health")).toBeInTheDocument();
    expect(screen.getByText("Money / App Revenue")).toBeInTheDocument();
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText("Barbers")).toBeInTheDocument();
    expect(screen.getByText("Shop Owners")).toBeInTheDocument();
    expect(screen.getByText("Bookings")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
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
    expect(screen.getByTestId("ceo-readiness-failed-count")).toHaveTextContent("1");
    expect(screen.getByTestId("ceo-readiness-critical-blockers")).toHaveTextContent("1");
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
    expect(screen.getByTestId("ceo-readiness-pass-count")).toHaveTextContent("17");
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

  it("shows controlled refund actions only for approved cancelled captured Finance issues", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Payment health issue detail" }));

    const paymentDialog = screen.getByRole("dialog", { name: "Payment health" });
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
      });

    render(<ArchitectMissionControl laneId="finance" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Payment health issue detail" }));

    const dialog = screen.getByRole("dialog", { name: "Payment health" });
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

    await waitFor(() => expect(within(target).getByText("Refund success.")).toBeInTheDocument());
    expect(within(target).getByText("Refund ID: refund-approved-1")).toBeInTheDocument();
    expect(within(target).getByText("Updated payment status: refunded")).toBeInTheDocument();
    expect(within(target).getByText("Refund record exists.")).toBeInTheDocument();
    expect(within(target).getByText("Routing released_at remains null.")).toBeInTheDocument();
    expect(within(target).getByText("payout_executions remains 0.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/payments/${APPROVED_REFUND_PAYMENT_ID}/refund`);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 5,
        reason: "Cancelled appointment captured booking payment resolution"
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

    fireEvent.click(await screen.findByRole("button", { name: "Open Payment health issue detail" }));

    const dialog = screen.getByRole("dialog", { name: "Payment health" });
    const target = within(dialog).getByTestId(`controlled-refund-${APPROVED_REFUND_PAYMENT_ID}`);
    fireEvent.change(within(target).getByLabelText(`Type REFUND 5 for payment ${APPROVED_REFUND_PAYMENT_ID}`), {
      target: { value: "REFUND 5" }
    });
    fireEvent.click(within(target).getByRole("button", { name: `Refund $5 through canonical route for payment ${APPROVED_REFUND_PAYMENT_ID}` }));

    await waitFor(() => expect(within(target).getByText("Refund failed.")).toBeInTheDocument());
    expect(within(target).getByText(/owner, manager, or front desk/i)).toBeInTheDocument();
    expect(within(dialog).getAllByText("Failed").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
