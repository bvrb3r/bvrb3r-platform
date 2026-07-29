import type { getShopDashboardPayload } from "@/lib/booking/platform-service";
import type { UserAccount } from "@/types/domain";

type LegacyShopDashboard = Awaited<ReturnType<typeof getShopDashboardPayload>>;

export type OwnerOperationsStatus =
  | "booked"
  | "checked_in"
  | "in_service"
  | "completed"
  | "cancelled"
  | "no_show"
  | "waiting"
  | "active"
  | "called"
  | "assigned"
  | "converted"
  | "expired";

export interface OwnerOperationsResponse {
  scope: {
    shopId: string;
    shopName: string;
    locationLabel: string;
  };
  generatedAt: string;
  summary: {
    floorVolume: number;
    booked: number;
    waiting: number;
    checkedIn: number;
    inService: number;
    completed: number;
    activeBarbers: number;
    openChairs: number;
  };
  sourceCounts: Array<{
    source: string;
    label: string;
    count: number;
  }>;
  team: Array<{
    barberId: string;
    name: string;
    booked: number;
    completed: number;
    liveAppointments: number;
    nextAppointmentStart: string | null;
    floorState: "open" | "busy" | "offline";
  }>;
  floor: Array<{
    id: string;
    kind: "appointment" | "walk_in";
    status: OwnerOperationsStatus;
    clientDisplayName: string;
    serviceDisplayName: string;
    barberId: string | null;
    barberDisplayName: string | null;
    source: string;
    sourceLabel: string;
    paymentOwner: "barber" | "external_provider" | "unassigned";
    startsAt: string;
    waitMinutes: number | null;
    position: number | null;
  }>;
  alerts: Array<{
    id: string;
    tone: "warning" | "critical";
    title: string;
    detail: string;
  }>;
  controls: OwnerOperationsControlState;
  privacyNotice: string;
}

export interface OwnerOperationsControlState {
  floor: {
    intakeOpen: boolean;
    floorNote: string | null;
    version: number;
  };
  kiosk: {
    paired: boolean;
    enabled: boolean;
    healthStatus: string;
    emergencyDisabledAt: string | null;
    privacyMode: boolean;
    autoResetEnabled: boolean;
    qrEntryEnabled: boolean;
    nfcEntryEnabled: boolean;
    clientBridgePromptEnabled: boolean;
  };
  chairs: Array<{
    chairId: string;
    label: string;
    sortOrder: number;
    active: boolean;
    assignedBarberId: string | null;
    retiredAt: string | null;
  }>;
  boothRent: {
    billedCents: number;
    paidCents: number;
    outstandingCents: number;
    overdueCount: number;
  };
  clientBridge: {
    offered: number;
    consented: number;
    invitations: number;
    claimed: number;
    optedOut: number;
  };
}

function canonicalSource(value?: string | null) {
  const source = value?.trim().toLowerCase() || "bvrb3r";
  if (source.includes("booksy")) return "booksy";
  if (source.includes("square")) return "square";
  if (source.includes("thecut") || source.includes("the_cut")) return "thecut";
  if (source.includes("kiosk")) return "kiosk";
  if (source.includes("walk")) return "walk_in";
  return "bvrb3r";
}

function sourceLabel(source: string) {
  if (source === "booksy") return "Booksy";
  if (source === "square") return "Square";
  if (source === "thecut") return "theCut";
  if (source === "kiosk") return "Kiosk";
  if (source === "walk_in") return "Walk-in";
  return "BVRB3R";
}

function paymentOwnerForSource(source: string) {
  return ["booksy", "square", "thecut"].includes(source)
    ? "external_provider" as const
    : "barber" as const;
}

function belongsToShop(
  record: { locationId?: string | null; shopId?: string | null },
  shopId: string
) {
  return record.locationId === shopId || record.shopId === shopId;
}

export function resolveOwnerOperationsShopId(
  user: Pick<UserAccount, "ownedShopId" | "locationIds">,
  requestedShopId?: string | null
) {
  const allowed = Array.from(new Set(
    [user.ownedShopId, ...user.locationIds].filter((value): value is string => Boolean(value))
  ));
  const requested = requestedShopId?.trim();

  if (requested) {
    return allowed.includes(requested) ? requested : null;
  }

  return user.ownedShopId && allowed.includes(user.ownedShopId)
    ? user.ownedShopId
    : allowed.length === 1
      ? allowed[0]
      : null;
}

export function buildOwnerOperationsPayload(input: {
  shopId: string;
  dashboard: LegacyShopDashboard;
  controls?: OwnerOperationsControlState;
  generatedAt?: string;
}): OwnerOperationsResponse {
  const appointments = input.dashboard.appointments.filter((entry) =>
    belongsToShop(entry, input.shopId)
  );
  const walkIns = input.dashboard.walkIns.filter((entry) =>
    belongsToShop(entry, input.shopId)
  );
  const location = input.dashboard.locations.find((entry) => entry.id === input.shopId);
  const sourceMap = new Map<string, number>();

  const appointmentFloor: OwnerOperationsResponse["floor"] = appointments.map((entry) => {
    const source = canonicalSource(entry.bookingSource ?? entry.source);
    sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
    return {
      id: entry.id,
      kind: "appointment",
      status: entry.status as OwnerOperationsStatus,
      clientDisplayName: entry.display.clientName,
      serviceDisplayName: entry.display.serviceName,
      barberId: entry.barberId,
      barberDisplayName: entry.display.barberName,
      source,
      sourceLabel: sourceLabel(source),
      paymentOwner: paymentOwnerForSource(source),
      startsAt: entry.start,
      waitMinutes: null,
      position: null
    };
  });

  const walkInFloor: OwnerOperationsResponse["floor"] = walkIns.map((entry) => {
    const source = canonicalSource(entry.queueSource ?? "walk_in");
    sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
    return {
      id: entry.id,
      kind: "walk_in",
      status: entry.status as OwnerOperationsStatus,
      clientDisplayName: entry.clientName,
      serviceDisplayName: entry.requestedService,
      barberId: entry.assignedBarberId ?? null,
      barberDisplayName: entry.display.assignedBarberName ?? null,
      source,
      sourceLabel: sourceLabel(source),
      paymentOwner: entry.assignedBarberId ? "barber" : "unassigned",
      startsAt: entry.requestedAt,
      waitMinutes: entry.waitMinutes,
      position: entry.position
    };
  });

  const floor = [...appointmentFloor, ...walkInFloor].sort(
    (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
  );
  const team = input.dashboard.barbers.map((barber) => ({
    barberId: barber.id,
    name: barber.name,
    booked: barber.bookedCount,
    completed: barber.completedCount,
    liveAppointments: barber.liveAppointmentCount,
    nextAppointmentStart: barber.nextAppointmentStart,
    floorState: barber.liveAppointmentCount > 0
      ? "busy" as const
      : input.dashboard.activeBarbers.some((entry) => entry.id === barber.id)
        ? "open" as const
        : "offline" as const
  }));
  const waiting = walkIns.filter((entry) =>
    ["waiting", "active", "called"].includes(entry.status)
  ).length;
  const unassigned = walkIns.filter((entry) =>
    ["waiting", "active", "called"].includes(entry.status) && !entry.assignedBarberId
  ).length;

  return {
    scope: {
      shopId: input.shopId,
      shopName: location?.name ?? input.shopId,
      locationLabel: location?.label ?? location?.name ?? input.shopId
    },
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      floorVolume: floor.length,
      booked: appointments.filter((entry) => ["pending", "confirmed", "booked"].includes(entry.status)).length,
      waiting,
      checkedIn: appointments.filter((entry) => entry.status === "checked_in").length,
      inService: appointments.filter((entry) => entry.status === "in_service").length,
      completed: appointments.filter((entry) => entry.status === "completed").length,
      activeBarbers: team.filter((entry) => entry.floorState !== "offline").length,
      openChairs: team.filter((entry) => entry.floorState === "open").length
    },
    sourceCounts: [...sourceMap.entries()]
      .map(([source, count]) => ({ source, label: sourceLabel(source), count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    team,
    floor,
    alerts: [
      ...(unassigned > 0 ? [{
        id: "unassigned-walk-ins",
        tone: "critical" as const,
        title: `${unassigned} walk-in${unassigned === 1 ? "" : "s"} need a chair`,
        detail: "Only cash walk-ins may be reassigned, and every reassignment requires a reason."
      }] : []),
      ...(waiting > 0 ? [{
        id: "waiting-floor",
        tone: "warning" as const,
        title: `${waiting} guest${waiting === 1 ? "" : "s"} waiting`,
        detail: "Review chair availability and source ownership before changing the floor."
      }] : [])
    ],
    controls: input.controls ?? {
      floor: { intakeOpen: true, floorNote: null, version: 0 },
      kiosk: {
        paired: false,
        enabled: false,
        healthStatus: "unpaired",
        emergencyDisabledAt: null,
        privacyMode: true,
        autoResetEnabled: true,
        qrEntryEnabled: true,
        nfcEntryEnabled: false,
        clientBridgePromptEnabled: true
      },
      chairs: [],
      boothRent: {
        billedCents: 0,
        paidCents: 0,
        outstandingCents: 0,
        overdueCount: 0
      },
      clientBridge: {
        offered: 0,
        consented: 0,
        invitations: 0,
        claimed: 0,
        optedOut: 0
      }
    },
    privacyNotice: "Floor volume — barbers’ money, not the shop’s. Shop-owned money is limited to booth rent billed, paid, and outstanding."
  };
}

export function findForbiddenOwnerOperationsKeys(value: unknown, path = "$"): string[] {
  const forbidden = /(?:^|_)(?:revenue|earning|tip|payout|gross|subtotal|total_amount|balance_due|client_note|internal_note|email|phone|exact_location)(?:$|_)/i;
  const findings: string[] = [];

  if (Array.isArray(value)) {
    value.forEach((entry, index) => findings.push(...findForbiddenOwnerOperationsKeys(entry, `${path}[${index}]`)));
    return findings;
  }

  if (!value || typeof value !== "object") {
    return findings;
  }

  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    const normalizedKey = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
    if (forbidden.test(normalizedKey)) {
      findings.push(nextPath);
    }
    findings.push(...findForbiddenOwnerOperationsKeys(entry, nextPath));
  }

  return findings;
}
