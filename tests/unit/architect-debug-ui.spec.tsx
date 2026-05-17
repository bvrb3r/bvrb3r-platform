import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DebugConsole } from "@/components/architect/debug/debug-console";

const fetchMock = vi.fn();

function createPacket() {
  return {
    ok: true,
    checkedAt: "2026-05-17T14:00:00.000Z",
    debugType: "appointment",
    targetType: "appointment",
    targetId: "2090ae1e-3b7c-59d2-81ac-9f88908fd735",
    environment: { appEnv: "production", commitHash: "abc", deploymentId: "dep" },
    summary: {
      health: "broken",
      diagnosisCode: "completed_but_routing_missing",
      headline: "Appointment is completed and payment is captured, but routing is missing.",
      confidence: "high",
      recommendedAction: "Run safe repair: payment routing.",
      canRepair: true,
      repairType: "payment_routing",
      codexRequired: false
    },
    entities: {
      appointment: { id: "2090ae1e-3b7c-59d2-81ac-9f88908fd735", status: "completed" },
      client: null,
      clientProfile: null,
      barber: null,
      barberProfile: null,
      shop: null,
      service: null,
      payment: { id: "payment", status: "captured", amount: 5 },
      payments: [],
      paymentMethod: null,
      routing: null,
      routingRows: [],
      statusHistory: [],
      platformEvents: []
    },
    evidence: {
      databaseTruth: [{ label: "routing", status: "fail", detail: "No routing row matched appointment_id." }],
      routeEvidence: [],
      schemaEvidence: [],
      logEvidence: [],
      userSymptom: null
    },
    diagnosis: {
      likelyRootCause: "Missing routing",
      affectedLayer: "payment routing",
      failedInvariant: "completed paid appointments must have routing",
      supportingFacts: ["routing missing"],
      ruledOut: ["payment row exists"]
    },
    repairActions: [{
      repairType: "payment_routing",
      targetType: "appointment",
      targetId: "2090ae1e-3b7c-59d2-81ac-9f88908fd735",
      safetyClass: "safe",
      label: "Repair payment routing",
      description: "Create the missing routing row.",
      endpoint: "/api/architect/repairs/payment-routing",
      method: "POST",
      canRun: true
    }],
    codexPrompt: "BVRB3R ROUTING FIX",
    sqlSnippets: [{ label: "Routing", sql: "select * from payment_routing_records;" }],
    validationChecklist: [{ stage: "routing_row_exists", status: "fail", reason: "missing" }],
    audit: { sessionId: "session-1" }
  };
}

describe("architect debug UI", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("looks up an appointment and renders repair, prompt, and SQL panels", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createPacket()
    });

    render(<DebugConsole />);
    fireEvent.click(screen.getByRole("button", { name: /run debug/i }));

    await waitFor(() => expect(screen.getByText("completed_but_routing_missing")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /run safe repair/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("BVRB3R ROUTING FIX")).toBeInTheDocument();
    expect(screen.getByText("select * from payment_routing_records;")).toBeInTheDocument();
  });
});
