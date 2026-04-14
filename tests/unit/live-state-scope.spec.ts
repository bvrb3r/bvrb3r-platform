import { createInitialLiveOperationsSnapshot, scopeLiveOperationsSnapshot } from "@/lib/operations/live-state";

describe("live operations snapshot role scoping", () => {
  it("limits owner views to assigned shop locations only", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const ownerView = scopeLiveOperationsSnapshot(snapshot, { role: "owner", locationIds: ["loc-ybor"] });

    expect(ownerView.appointments.length).toBeGreaterThan(0);
    expect(ownerView.appointments.every((appointment) => appointment.locationId === "loc-ybor")).toBe(true);
    expect(ownerView.walkIns.every((entry) => entry.locationId === "loc-ybor")).toBe(true);
    expect(ownerView.ownerAnalytics.every((entry) => entry.locationReference === "loc-ybor")).toBe(true);
    expect(ownerView.compensationSnapshots.every((entry) => entry.locationReference === "loc-ybor")).toBe(true);
  });

  it("returns an empty operational view for owners without a shop scope", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const ownerView = scopeLiveOperationsSnapshot(snapshot, { role: "owner", locationIds: [] });

    expect(ownerView.appointments).toHaveLength(0);
    expect(ownerView.clients).toHaveLength(0);
    expect(ownerView.walkIns).toHaveLength(0);
    expect(ownerView.workflowEvents).toHaveLength(0);
    expect(ownerView.compensationSnapshots).toHaveLength(0);
    expect(ownerView.ownerAnalytics).toHaveLength(0);
  });

  it("keeps compensation data out of manager and front desk views", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const managerView = scopeLiveOperationsSnapshot(snapshot, { role: "manager", locationIds: ["loc-ybor"] });
    const frontDeskView = scopeLiveOperationsSnapshot(snapshot, { role: "front_desk", locationIds: ["loc-ybor"] });

    expect(managerView.ownerAnalytics.length).toBeGreaterThan(0);
    expect(managerView.compensationSnapshots).toHaveLength(0);
    expect(frontDeskView.compensationSnapshots).toHaveLength(0);
    expect(frontDeskView.ownerAnalytics).toHaveLength(0);
  });

  it("limits barber views to personal appointments and compensation only", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const barberView = scopeLiveOperationsSnapshot(snapshot, { role: "commission_barber", barberId: "barber-wave", locationIds: ["loc-ybor"] });

    expect(barberView.appointments.every((appointment) => appointment.barberId === "barber-wave")).toBe(true);
    expect(barberView.compensationSnapshots.every((entry) => entry.barberReference === "barber-wave")).toBe(true);
    expect(barberView.ownerAnalytics).toHaveLength(0);
  });

  it("keeps client views client-only and hides internal workflow events", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const clientView = scopeLiveOperationsSnapshot(snapshot, { role: "client", clientId: "client-jordan", email: "client@bvrb3r.demo", locationIds: ["loc-ybor"] });

    expect(clientView.appointments.every((appointment) => appointment.clientId === "client-jordan")).toBe(true);
    expect(clientView.workflowEvents).toHaveLength(0);
    expect(clientView.compensationSnapshots).toHaveLength(0);
    expect(clientView.ownerAnalytics).toHaveLength(0);
  });
});
