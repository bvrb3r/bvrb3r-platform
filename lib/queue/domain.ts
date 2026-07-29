import type { WalkInStatus } from "@/types/domain";
import type { BookingSourceProvider, PaymentOwner } from "@/lib/clientbridge/domain";

export type QueueStatus = Extract<
  WalkInStatus,
  "active" | "called" | "assigned" | "converted" | "cancelled" | "expired" | "no_show"
>;

export type QueueSource = "walk_in" | "cancellation_fill" | "manual" | "app" | "kiosk";

export type QueueBarberCandidate = {
  barberId: string;
  barberName: string;
  currentShopId?: string | null;
  liveStatus: "offline" | "available" | "busy" | "on_break" | "away";
  isOnline: boolean;
  acceptsWalkIns: boolean;
  nextAvailableAt?: string | null;
  supportsRequestedService: boolean;
  preferredMatch: boolean;
};

export type QueueCreateInput = {
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  shopId: string;
  serviceId?: string;
  preferredBarberId?: string;
  preferredDate?: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  flexibilityMinutes?: number;
  queueSource?: QueueSource;
  entryType?: "booked" | "walkin";
  sourceProvider?: BookingSourceProvider;
  paymentOwner?: PaymentOwner;
  idempotencyKey?: string;
  chairsyncAppointmentId?: string;
  sourceServiceName?: string;
  operationalSmsConsent?: boolean;
  rejoinOfEntryId?: string;
  notes?: string;
};

const queueTransitions: Record<QueueStatus, QueueStatus[]> = {
  active: ["called", "assigned", "cancelled", "expired"],
  called: ["assigned", "cancelled", "expired"],
  assigned: ["converted", "cancelled", "no_show"],
  converted: [],
  cancelled: [],
  expired: [],
  no_show: []
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function barberStatusPriority(status: QueueBarberCandidate["liveStatus"]) {
  switch (status) {
    case "available":
      return 0;
    case "busy":
      return 1;
    case "on_break":
      return 2;
    case "away":
      return 3;
    case "offline":
    default:
      return 4;
  }
}

export function normalizeQueueCreateInput(input: QueueCreateInput) {
  const clientName = input.clientName.trim();
  const clientPhone = normalizePhone(input.clientPhone);
  const notes = input.notes?.trim() || undefined;
  const clientEmail = input.clientEmail?.trim().toLowerCase() || undefined;
  const flexibilityMinutes = Math.max(0, Math.round(input.flexibilityMinutes ?? 0));
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  const sourceServiceName = input.sourceServiceName?.trim() || undefined;

  if (clientName.length < 2) {
    throw new Error("Walk-in queue entries need a real client name.");
  }

  if (clientPhone.length < 7) {
    throw new Error("Walk-in queue entries need a real client phone number.");
  }

  if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
    throw new Error("Queue idempotency keys must be between 8 and 200 characters.");
  }

  const sourceProvider = input.sourceProvider ?? "bvrb3r";
  const entryType = input.entryType ?? (input.chairsyncAppointmentId ? "booked" : "walkin");
  const paymentOwner = input.paymentOwner
    ?? (sourceProvider === "bvrb3r"
      ? entryType === "walkin" ? "bvrb3r_cash" : "unpaid_manual"
      : `external:${sourceProvider}`);

  return {
    ...input,
    clientName,
    clientPhone,
    clientEmail,
    notes,
    flexibilityMinutes,
    idempotencyKey,
    sourceServiceName,
    entryType,
    sourceProvider,
    paymentOwner,
    queueSource: input.queueSource ?? "walk_in"
  };
}

export function canTransitionQueueStatus(current: QueueStatus, next: QueueStatus) {
  return queueTransitions[current].includes(next);
}

export function assertQueueStatusTransition(current: QueueStatus, next: QueueStatus) {
  if (!canTransitionQueueStatus(current, next)) {
    throw new Error(`Queue entry cannot move from ${current} to ${next}.`);
  }
}

export function computeQueueWaitMinutes(createdAt: string, now = new Date()) {
  return Math.max(0, Math.round((now.getTime() - new Date(createdAt).getTime()) / 60_000));
}

export type CanonicalQueueProjectionInput = {
  id: string;
  createdAt: string;
  serviceDurationMinutes: number | null;
  serviceBufferMinutes?: number | null;
};

/**
 * Mirrors the database projection for deterministic tests and offline
 * diagnostics. Product surfaces never call this to display queue truth.
 */
export function projectCanonicalQueueTruth(
  entries: readonly CanonicalQueueProjectionInput[],
  activeChairCount: number
) {
  const chairs = Math.max(1, Math.floor(activeChairCount));
  let minutesAhead = 0;
  return sortQueueEntries([...entries]).map((entry, index) => {
    const position = index + 1;
    const estimatedWaitMinutes = Math.ceil(minutesAhead / chairs);
    const duration = Math.max(1, Math.round(entry.serviceDurationMinutes ?? 30))
      + Math.max(0, Math.round(entry.serviceBufferMinutes ?? 0));
    const projection = {
      id: entry.id,
      position,
      estimatedWaitMinutes,
      waitReason: `${position - 1} ahead · service-duration schedule across ${chairs} active chair${chairs === 1 ? "" : "s"}`
    };
    minutesAhead += duration;
    return projection;
  });
}

export function getQueueSyncHealth(lastSyncedAt: string, now = new Date()) {
  const syncedAt = new Date(lastSyncedAt);
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - syncedAt.getTime()) / 1_000));
  return {
    ageSeconds,
    stale: !Number.isFinite(syncedAt.getTime()) || ageSeconds > 45,
    label: !Number.isFinite(syncedAt.getTime())
      ? "Sync time unavailable"
      : ageSeconds > 45
        ? `Last synced ${ageSeconds}s ago · polling for truth`
        : `Live truth · synced ${ageSeconds}s ago`
  };
}

export function sortQueueEntries<T extends { createdAt: string; id: string }>(entries: T[]) {
  return [...entries].sort((left, right) => {
    const createdDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (createdDelta !== 0) {
      return createdDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

export function getQueueStatusLabel(status: QueueStatus) {
  switch (status) {
    case "active":
      return "Waiting";
    case "called":
      return "Called";
    case "assigned":
      return "Assigned";
    case "converted":
      return "Converted";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "no_show":
      return "No-show";
    default:
      return status;
  }
}

export function pickBestQueueBarber(candidates: QueueBarberCandidate[]) {
  const eligible = candidates.filter((candidate) => candidate.supportsRequestedService && candidate.isOnline && candidate.liveStatus !== "offline");
  if (!eligible.length) {
    return null;
  }

  return [...eligible].sort((left, right) => {
    if (left.preferredMatch !== right.preferredMatch) {
      return left.preferredMatch ? -1 : 1;
    }

    if (left.acceptsWalkIns !== right.acceptsWalkIns) {
      return left.acceptsWalkIns ? -1 : 1;
    }

    const statusDelta = barberStatusPriority(left.liveStatus) - barberStatusPriority(right.liveStatus);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const leftNext = left.nextAvailableAt ? new Date(left.nextAvailableAt).getTime() : 0;
    const rightNext = right.nextAvailableAt ? new Date(right.nextAvailableAt).getTime() : 0;
    if (leftNext !== rightNext) {
      return leftNext - rightNext;
    }

    return left.barberName.localeCompare(right.barberName);
  })[0];
}
