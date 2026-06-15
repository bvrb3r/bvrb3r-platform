import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("renders health, incidents, analysis, and action buttons", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    await waitFor(() => expect(screen.getByText("BVRB3R Architect Operating System")).toBeInTheDocument());
    expect(screen.getByTestId("architect-mission-control-root").className).not.toMatch(/min-h|h-screen|100svh|items-center|justify-end/);
    expect(screen.getByText("BVRB3R Mission Control Navigation")).toBeInTheDocument();
    expect(screen.getByText("CEO Command Center")).toBeInTheDocument();
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText("Barbers")).toBeInTheDocument();
    expect(screen.getByText("Shop Owners")).toBeInTheDocument();
    expect(screen.getByText("Payment Routing Health")).toBeInTheDocument();
    expect(screen.getByText("Payout Readiness Health")).toBeInTheDocument();
    expect(screen.getByText("Core Loop Validators")).toBeInTheDocument();
    expect(screen.getByText("Source Vault")).toBeInTheDocument();
    expect(screen.getByText("Action Registry")).toBeInTheDocument();
    expect(screen.getByText("Hive AI / Agent Registry")).toBeInTheDocument();
    expect(screen.getByText("Active Incidents")).toBeInTheDocument();
    expect(screen.getAllByText("Completed paid appointment is missing payment routing.").length).toBeGreaterThan(0);
    expect(screen.getByText("The payout-routing ledger was never created or repaired after completion.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /run safe repair/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /copy chatgpt packet/i })).toBeInTheDocument();
  });

  it("places Mission Control Navigation immediately after the operating header", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    const header = await screen.findByText("BVRB3R Architect Operating System");
    const navigation = screen.getByText("BVRB3R Mission Control Navigation");

    expect(header.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("CEO Command Center")).toBeInTheDocument();
  });

  it("renders the official Mission Control lanes with CEO as default", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl />);

    await waitFor(() => expect(screen.getByText("CEO lane is routed and active")).toBeInTheDocument());
    for (const lane of ["CEO", "Product", "Technology", "Operations", "Finance", "Marketing", "Compliance", "Security", "Content & Community"]) {
      expect(screen.getAllByText(lane).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("link", { name: /CEO/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Product/ })).toHaveAttribute("href", "/architect/product");
    expect(screen.getByRole("link", { name: /Product/ }).getAttribute("href")).not.toContain("#");
    expect(screen.queryByText(/sidebar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/admin menu/i)).not.toBeInTheDocument();
  });

  it("renders a routed department lane without the CEO scoreboard", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createSnapshot()
    });

    render(<ArchitectMissionControl laneId="finance" />);

    await waitFor(() => expect(screen.getByText("Finance lane is routed and active")).toBeInTheDocument());
    expect(screen.getByText("Finance Mission Control")).toBeInTheDocument();
    expect(screen.getByText("Payment health")).toBeInTheDocument();
    expect(screen.queryByText("CEO Command Center")).not.toBeInTheDocument();
    expect(screen.queryByText("Product Mission Control")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Finance/ })).toHaveAttribute("aria-current", "page");
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
