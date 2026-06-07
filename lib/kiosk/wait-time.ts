export type KioskWaitContext = {
  serviceDurationMinutes?: number | null;
  bufferMinutes?: number | null;
  queueDepth?: number | null;
  currentServiceRemainingMinutes?: number | null;
  manualAdjustmentMinutes?: number | null;
  nextAvailableAt?: string | null;
  barberStatus?: string | null;
  acceptsWalkIns?: boolean | null;
};

function positive(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function formatKioskWaitLabel(minutes: number | null | undefined, unavailableLabel = "Not Available Today") {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return unavailableLabel;
  }

  if (minutes <= 0) {
    return "Ready now";
  }

  if (minutes <= 7) {
    return "About 5 min";
  }

  if (minutes <= 12) {
    return "About 10 min";
  }

  if (minutes <= 20) {
    return "About 15 min";
  }

  if (minutes <= 37) {
    return "About 30 min";
  }

  if (minutes <= 52) {
    return "About 45 min";
  }

  if (minutes <= 75) {
    return "About 1 hour";
  }

  return "Over 1 hour";
}

export function calculateKioskWaitTime(input: KioskWaitContext) {
  const status = input.barberStatus?.toLowerCase();
  if (input.acceptsWalkIns === false || status === "offline" || status === "done_for_day" || status === "not_taking_walk_ins") {
    return {
      estimatedWaitMinutes: null,
      estimatedStartTime: null,
      waitDisplayLabel: status === "not_taking_walk_ins" ? "Schedule Ahead Only" : "Not Available Today"
    };
  }

  if (status === "on_break") {
    return {
      estimatedWaitMinutes: null,
      estimatedStartTime: null,
      waitDisplayLabel: "Schedule Ahead Only"
    };
  }

  const slotWait = input.nextAvailableAt
    ? Math.max(0, Math.round((new Date(input.nextAvailableAt).getTime() - Date.now()) / 60_000))
    : 0;
  const serviceBlock = positive(input.serviceDurationMinutes) + positive(input.bufferMinutes);
  const queueBlock = positive(input.queueDepth) * Math.max(serviceBlock, 10);
  const statusBlock = status === "busy" || status === "in_service" || status === "running_behind"
    ? positive(input.currentServiceRemainingMinutes) || Math.max(serviceBlock, 10)
    : 0;
  const estimatedWaitMinutes = Math.max(0, slotWait, queueBlock + statusBlock + positive(input.manualAdjustmentMinutes));
  const estimatedStartTime = new Date(Date.now() + estimatedWaitMinutes * 60_000).toISOString();

  return {
    estimatedWaitMinutes,
    estimatedStartTime,
    waitDisplayLabel: formatKioskWaitLabel(estimatedWaitMinutes)
  };
}
