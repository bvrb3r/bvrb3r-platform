import type { AppointmentStatus } from "@/types/domain";

export type AppointmentCheckInEventType = "arrived" | "checked_in" | "seated" | "started" | "completed";

export type AppointmentTransitionTarget =
  | "pending"
  | "confirmed"
  | "booked"
  | "checked_in"
  | "in_service"
  | "completed"
  | "cancelled"
  | "no_show"
  | "refunded";

export type AppointmentLifecycleFields = {
  checkedInAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

export type BookableServiceSnapshot = {
  id: string;
  referenceCode?: string | null;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  unitPrice: number;
  depositAmount: number;
  fullPrepayRequired: boolean;
};

export type AppointmentFinancialQuote = {
  serviceTotal: number;
  addOnTotal: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  tipTotal: number;
  grandTotal: number;
  depositDue: number;
  balanceDue: number;
  totalDurationMinutes: number;
};

const transitionMap: Record<AppointmentTransitionTarget, AppointmentTransitionTarget[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "completed", "cancelled", "no_show", "refunded"],
  booked: ["confirmed", "checked_in", "cancelled", "no_show"],
  checked_in: ["in_service", "completed", "cancelled"],
  in_service: ["completed", "cancelled"],
  completed: ["refunded"],
  cancelled: [],
  no_show: [],
  refunded: []
};

const UPCOMING_APPOINTMENT_STATUSES = new Set<AppointmentTransitionTarget>([
  "confirmed",
  "booked",
  "checked_in",
  "in_service"
]);

const SCHEDULED_APPOINTMENT_STATUSES = new Set<AppointmentTransitionTarget>([
  "confirmed",
  "booked"
]);

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function hashSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function generateAppointmentConfirmationCode(seed: string) {
  const primary = hashSeed(seed).toString(36).toUpperCase();
  const secondary = hashSeed(`${seed}:bvrb3r`).toString(36).toUpperCase();

  return `${primary}${secondary}`
    .replace(/[^A-Z0-9]/g, "")
    .padEnd(10, "0")
    .slice(0, 10);
}

export function calculateAppointmentQuote(
  primaryService: BookableServiceSnapshot,
  addOnServices: BookableServiceSnapshot[],
  locationTaxRate = 0,
  options?: {
    discountTotal?: number;
    tipTotal?: number;
  }
): AppointmentFinancialQuote {
  const serviceTotal = roundCurrency(primaryService.unitPrice);
  const addOnTotal = roundCurrency(addOnServices.reduce((sum, addOn) => sum + addOn.unitPrice, 0));
  const subtotal = roundCurrency(serviceTotal + addOnTotal);
  const discountTotal = roundCurrency(Math.min(options?.discountTotal ?? 0, subtotal));
  const taxableBase = Math.max(subtotal - discountTotal, 0);
  const taxTotal = roundCurrency(taxableBase * Math.max(locationTaxRate, 0));
  const tipTotal = roundCurrency(options?.tipTotal ?? 0);
  const grandTotal = roundCurrency(taxableBase + taxTotal + tipTotal);
  const preTipCharge = roundCurrency(Math.max(grandTotal - tipTotal, 0));
  const requestedDeposit = roundCurrency(
    primaryService.fullPrepayRequired
      ? preTipCharge
      : primaryService.depositAmount + addOnServices.reduce((sum, addOn) => sum + addOn.depositAmount, 0)
  );
  const depositDue = roundCurrency(Math.min(requestedDeposit, preTipCharge));
  const balanceDue = roundCurrency(Math.max(grandTotal - depositDue, 0));
  const totalDurationMinutes =
    primaryService.durationMinutes
    + primaryService.bufferMinutes
    + addOnServices.reduce((sum, addOn) => sum + addOn.durationMinutes + addOn.bufferMinutes, 0);

  return {
    serviceTotal,
    addOnTotal,
    subtotal,
    discountTotal,
    taxTotal,
    tipTotal,
    grandTotal,
    depositDue,
    balanceDue,
    totalDurationMinutes
  };
}

export function canTransitionAppointmentStatus(
  currentStatus: AppointmentStatus | AppointmentTransitionTarget,
  nextStatus: AppointmentTransitionTarget
) {
  if (currentStatus === "booked" && nextStatus === "completed") {
    return false;
  }

  return transitionMap[normalizeAppointmentStatus(currentStatus)]?.includes(nextStatus) ?? false;
}

export function assertAppointmentTransition(
  currentStatus: AppointmentStatus | AppointmentTransitionTarget,
  nextStatus: AppointmentTransitionTarget
) {
  if (!canTransitionAppointmentStatus(currentStatus, nextStatus)) {
    throw new Error(`Cannot transition appointment from ${currentStatus} to ${nextStatus}.`);
  }
}

export function normalizeAppointmentStatus(
  status: AppointmentStatus | AppointmentTransitionTarget
): AppointmentTransitionTarget {
  return status === "booked" ? "confirmed" : (status as AppointmentTransitionTarget);
}

export function isUpcomingAppointmentStatus(
  status: AppointmentStatus | AppointmentTransitionTarget
) {
  return UPCOMING_APPOINTMENT_STATUSES.has(status as AppointmentTransitionTarget);
}

export function isScheduledAppointmentStatus(
  status: AppointmentStatus | AppointmentTransitionTarget
) {
  return SCHEDULED_APPOINTMENT_STATUSES.has(status as AppointmentTransitionTarget);
}

export function buildAppointmentLifecycleFields(
  previous: AppointmentLifecycleFields,
  nextStatus: AppointmentTransitionTarget,
  timestamp: string,
  cancellationReason?: string | null
): AppointmentLifecycleFields {
  if (nextStatus === "checked_in") {
    return {
      ...previous,
      checkedInAt: previous.checkedInAt ?? timestamp
    };
  }

  if (nextStatus === "in_service") {
    return {
      ...previous,
      checkedInAt: previous.checkedInAt ?? timestamp,
      serviceStartedAt: previous.serviceStartedAt ?? timestamp
    };
  }

  if (nextStatus === "completed") {
    return {
      ...previous,
      checkedInAt: previous.checkedInAt ?? timestamp,
      serviceStartedAt: previous.serviceStartedAt ?? timestamp,
      completedAt: previous.completedAt ?? timestamp
    };
  }

  if (nextStatus === "cancelled") {
    return {
      ...previous,
      cancelledAt: timestamp,
      cancellationReason: cancellationReason ?? previous.cancellationReason ?? null
    };
  }

  return previous;
}
