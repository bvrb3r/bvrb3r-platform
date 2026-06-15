import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchitectMissionControl } from "@/components/architect/mission-control/mission-control";
import { APPOINTMENT_ID } from "@/tests/unit/architect-debug-test-utils";

const fetchMock = vi.fn();
const clipboardWriteTextMock = vi.fn();

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
      evidence: ["appointment completed", "payment captured", "routing missing"],
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
    expect(screen.queryByText("CEO Command Center")).not.toBeInTheDocument();
    expect(screen.queryByText("Product Mission Control")).not.toBeInTheDocument();
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
