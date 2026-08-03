import type { OwnerOperationsResponse } from "@/lib/owner-operations/domain";

export type OwnerReportRange = "daily" | "weekly" | "monthly";

export type OwnerOperationalReport = {
  id: string;
  label: string;
  value: string;
  detail: string;
  group: "floor" | "rent" | "team" | "clientbridge" | "integrity";
  ownership: "shop" | "operational";
};

function percent(numerator: number, denominator: number) {
  return denominator <= 0 ? "—" : `${Math.round((numerator / denominator) * 100)}%`;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export function buildOwnerReportPack(
  payload: OwnerOperationsResponse,
  range: OwnerReportRange
): OwnerOperationalReport[] {
  const boothRent = payload.controls.boothRent;
  const bridge = payload.controls.clientBridge;
  const externalVisits = payload.sourceCounts
    .filter((row) => ["booksy", "square", "thecut"].includes(row.source))
    .reduce((total, row) => total + row.count, 0);
  const activeFloor = payload.summary.waiting
    + payload.summary.checkedIn
    + payload.summary.inService;
  const assignedChairs = payload.controls.chairs.filter(
    (chair) => chair.active && chair.assignedBarberId
  ).length;
  const activeChairs = payload.controls.chairs.filter((chair) => chair.active).length;

  return [
    {
      id: "shop-report",
      label: "Shop report",
      value: money(boothRent.paidCents),
      detail: `${range} booth rent collected · ${boothRent.overdueCount} overdue`,
      group: "rent",
      ownership: "shop"
    },
    {
      id: "floor-volume",
      label: "Floor volume",
      value: String(payload.summary.floorVolume),
      detail: "Booked and walk-in visits at this shop only",
      group: "floor",
      ownership: "operational"
    },
    {
      id: "booked",
      label: "Booked",
      value: String(payload.summary.booked),
      detail: "Native and external appointment counts; external amounts excluded",
      group: "floor",
      ownership: "operational"
    },
    {
      id: "walk-ins",
      label: "Walk-ins",
      value: String(payload.floor.filter((row) => row.kind === "walk_in").length),
      detail: "Walk-in queue volume",
      group: "floor",
      ownership: "operational"
    },
    {
      id: "active-floor",
      label: "Live floor",
      value: String(activeFloor),
      detail: "Waiting · checked in · in service",
      group: "floor",
      ownership: "operational"
    },
    {
      id: "completion",
      label: "Completion",
      value: percent(payload.summary.completed, payload.summary.floorVolume),
      detail: `${payload.summary.completed} completed visits`,
      group: "floor",
      ownership: "operational"
    },
    {
      id: "chair-utilization",
      label: "Chair utilization",
      value: percent(assignedChairs, activeChairs),
      detail: `${assignedChairs} assigned · ${payload.summary.openChairs} open`,
      group: "team",
      ownership: "operational"
    },
    {
      id: "team-eligible",
      label: "Floor-eligible team",
      value: String(payload.summary.activeBarbers),
      detail: "Active shop relationships only",
      group: "team",
      ownership: "operational"
    },
    {
      id: "kiosk-health",
      label: "Kiosk health",
      value: payload.controls.kiosk.healthStatus.replaceAll("_", " "),
      detail: payload.controls.kiosk.enabled ? "Paired and available" : "Not collecting check-ins",
      group: "floor",
      ownership: "operational"
    },
    {
      id: "rent-billed",
      label: "Booth rent billed",
      value: money(boothRent.billedCents),
      detail: "Shop-owned rent only",
      group: "rent",
      ownership: "shop"
    },
    {
      id: "rent-collected",
      label: "Rent collected",
      value: money(boothRent.paidCents),
      detail: percent(boothRent.paidCents, boothRent.billedCents),
      group: "rent",
      ownership: "shop"
    },
    {
      id: "rent-outstanding",
      label: "Rent outstanding",
      value: money(boothRent.outstandingCents),
      detail: `${boothRent.overdueCount} overdue obligation${boothRent.overdueCount === 1 ? "" : "s"}`,
      group: "rent",
      ownership: "shop"
    },
    {
      id: "autobooth",
      label: "AutoBooth",
      value: boothRent.billedCents === 0 ? "—" : "Live",
      detail: "Contribution share comes from the canonical rent statement",
      group: "rent",
      ownership: "shop"
    },
    {
      id: "clientbridge",
      label: "ClientBridge",
      value: percent(bridge.claimed, bridge.offered),
      detail: `${bridge.claimed} claimed · ${bridge.optedOut} opted out`,
      group: "clientbridge",
      ownership: "operational"
    },
    {
      id: "external-counts",
      label: "External visits",
      value: String(externalVisits),
      detail: "Counts only · provider-owned money never valued",
      group: "integrity",
      ownership: "operational"
    },
    {
      id: "money-separation",
      label: "Money separation",
      value: "Protected",
      detail: "Barber earnings, tips, payouts, contacts, and external amounts are excluded",
      group: "integrity",
      ownership: "operational"
    }
  ];
}

export function buildOwnerReportPackCsv(
  reports: readonly OwnerOperationalReport[],
  range: OwnerReportRange
) {
  const cell = (value: string) => (
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  );
  return [
    ["Report", "Value", "Detail", "Group", "Ownership", "Range"],
    ...reports.map((report) => [
      report.label,
      report.value,
      report.detail,
      report.group,
      report.ownership,
      range
    ])
  ].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
