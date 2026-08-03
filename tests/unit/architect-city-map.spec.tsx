import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ArchitectCityMap,
  buildCityReport
} from "@/components/architect/city-map/architect-city-map";
import {
  buildArchitectCityManifest,
  readArchitectLedger
} from "@/lib/architect/city-map/manifest.server";

describe("Architect City Map", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every canonical floor and door without fabricating green evidence", async () => {
    const manifest = await buildArchitectCityManifest({ snapshot: null, supabase: null });
    const doorCount = manifest.floors.reduce((total, floor) => total + floor.doors.length, 0);

    expect(manifest.floors).toHaveLength(7);
    expect(doorCount).toBe(43);
    expect(manifest.floors.flatMap((floor) => floor.doors).every((door) => door.status === "needs_review")).toBe(true);
    expect(manifest.controlsBlocked).toBe(true);

    render(<ArchitectCityMap initialManifest={manifest} architect={{ name: "Architect Prime", email: "architect@bvrb3r.app" }} />);

    expect(screen.getByTestId("architect-city-map")).toHaveTextContent("DoorW001");
    expect(screen.getByTestId("architect-city-map")).toHaveTextContent("Next available barber");
    expect(screen.getByTestId("architect-system-ledger")).toHaveTextContent("No real records match");
  });

  it("produces an all-city human and machine report and replays the selected route", async () => {
    const manifest = await buildArchitectCityManifest({ snapshot: null, supabase: null });
    const report = buildCityReport(manifest);

    expect(report).toContain("BVRB3R ARCHITECT — ALL-CITY REPORT");
    expect(report).toContain("7 floors · 43 doors");
    expect(report).toContain("--- MACHINE BLOCK ---");
    expect(report).toContain("\"doors\": 43");

    render(<ArchitectCityMap initialManifest={manifest} architect={{ name: "Architect Prime", email: "architect@bvrb3r.app" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Replay route" }));
    expect(screen.getByRole("button", { name: "Replaying…" })).toBeInTheDocument();
  });

  it("bounds ledger reads to the selected UTC day", async () => {
    const filters: Array<{ operation: string; column: string; value: string }> = [];
    const supabase = {
      from: () => {
        const query = {
          select: () => query,
          gte: (column: string, value: string) => {
            filters.push({ operation: "gte", column, value });
            return query;
          },
          lt: (column: string, value: string) => {
            filters.push({ operation: "lt", column, value });
            return query;
          },
          order: () => query,
          limit: async () => ({ data: [], error: null })
        };
        return query;
      }
    };

    await readArchitectLedger(supabase as never, "2026-07-29T20:00:00.000Z", "2026-07-21");

    expect(filters.filter((entry) => entry.operation === "gte")).toHaveLength(4);
    expect(filters.filter((entry) => entry.operation === "lt")).toHaveLength(4);
    expect(filters.map((entry) => entry.value)).toEqual(expect.arrayContaining([
      "2026-07-21T00:00:00.000Z",
      "2026-07-22T00:00:00.000Z"
    ]));
  });

  it("switches floors, inspects gates, and keeps controls locked on connection uncertainty", async () => {
    const manifest = await buildArchitectCityManifest({ snapshot: null, supabase: null });
    render(<ArchitectCityMap initialManifest={manifest} architect={{ name: "Architect Prime", email: "architect@bvrb3r.app" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Clients" }));
    expect(screen.getByTestId("architect-city-route")).toHaveTextContent("DoorC001");

    fireEvent.click(screen.getByRole("button", { name: /01 · DoorC001-G01/i }));
    expect(screen.getByText("Mission Control evidence is unavailable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Connections/i }));
    expect(screen.getByText("Connections — right account, right project")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Connections/i }));
    fireEvent.click(screen.getByRole("button", { name: /Controls/i }));
    expect(screen.getByText("Control writes are locked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Maintenance mode/i })).toBeDisabled();
  });

  it("requires an explicit reason and two clicks before posting a live control", async () => {
    const manifest = await buildArchitectCityManifest({ snapshot: null, supabase: null });
    manifest.controlsBlocked = false;
    manifest.controlBlockReason = null;
    const controlSnapshot = {
      controls: [{
        control_key: "maintenance",
        label: "Maintenance mode",
        active: false,
        reason: null,
        version: 3,
        changed_by: null,
        changed_at: "2026-07-29T22:00:00.000Z"
      }],
      featureFlags: [{
        gate_key: "owner.analytics.forecasting",
        reason: "plan",
        enabled: false,
        updated_at: "2026-07-29T22:00:00.000Z"
      }],
      audit: []
    };
    const operationsSnapshot = {
      jobs: [],
      failedWebhooks: [],
      devices: [],
      commands: [],
      maintenance: [],
      reportPreference: null,
      capabilities: {}
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/architect/operations")) {
        return new Response(JSON.stringify(operationsSnapshot), { status: 200 });
      }
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, requestId: "request-29" }), { status: 200 });
      }
      return new Response(JSON.stringify(controlSnapshot), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchitectCityMap initialManifest={manifest} architect={{ name: "Architect Prime", email: "architect@bvrb3r.app" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Controls/i }));
    await screen.findByText("Feature gates");
    fireEvent.click(screen.getByRole("button", { name: /Maintenance mode/i }));
    fireEvent.change(screen.getByPlaceholderText("Incident, change, or rollout reason…"), {
      target: { value: "Production smoke validation" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Arm control" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm now" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    const command = JSON.parse(String(postCall?.[1]?.body));
    expect(command).toMatchObject({
      action: "system_control",
      target: "maintenance",
      active: true,
      expectedVersion: 3,
      reason: "Production smoke validation",
      confirmation: "CONFIRM maintenance ON"
    });
    expect(await screen.findByText(/audited request request-29/i)).toBeInTheDocument();
  });
});
