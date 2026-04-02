import type { WalkInStatus } from "@/types/domain";

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

  if (clientName.length < 2) {
    throw new Error("Walk-in queue entries need a real client name.");
  }

  if (clientPhone.length < 7) {
    throw new Error("Walk-in queue entries need a real client phone number.");
  }

  return {
    ...input,
    clientName,
    clientPhone,
    clientEmail,
    notes,
    flexibilityMinutes,
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
