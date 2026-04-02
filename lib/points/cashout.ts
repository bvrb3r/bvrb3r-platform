import type { PointsCashoutPreview } from "@/types/points";
import { POINT_CASH_VALUE } from "@/lib/points/redemption";

export const DEFAULT_CASHOUT_MIN_POINTS = 100;

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPoints(value: number) {
  return Math.max(0, Math.floor(value));
}

export function previewCashoutRequest(input: {
  requestedPoints: number;
  availableEarnedPoints: number;
  minimumThresholdPoints?: number;
  cashoutRate?: number;
}): PointsCashoutPreview {
  const minimumThresholdPoints = input.minimumThresholdPoints ?? DEFAULT_CASHOUT_MIN_POINTS;
  const requestedPoints = roundPoints(input.requestedPoints);
  const availableEarnedPoints = roundPoints(input.availableEarnedPoints);

  if (!requestedPoints) {
    return {
      requestedPoints,
      approvedPoints: 0,
      cashValue: 0,
      minimumThresholdPoints,
      remainingEarnedPoints: availableEarnedPoints
    };
  }

  if (availableEarnedPoints < minimumThresholdPoints) {
    return {
      requestedPoints,
      approvedPoints: 0,
      cashValue: 0,
      minimumThresholdPoints,
      remainingEarnedPoints: availableEarnedPoints,
      blockedReason: `At least ${minimumThresholdPoints} earned points are required before cash-out can be requested.`
    };
  }

  const approvedPoints = Math.min(requestedPoints, availableEarnedPoints);
  if (approvedPoints < minimumThresholdPoints) {
    return {
      requestedPoints,
      approvedPoints: 0,
      cashValue: 0,
      minimumThresholdPoints,
      remainingEarnedPoints: availableEarnedPoints,
      blockedReason: `Cash-out requests must be at least ${minimumThresholdPoints} earned points.`
    };
  }

  const cashoutRate = input.cashoutRate ?? POINT_CASH_VALUE;
  return {
    requestedPoints,
    approvedPoints,
    cashValue: roundCurrency(approvedPoints * cashoutRate),
    minimumThresholdPoints,
    remainingEarnedPoints: availableEarnedPoints - approvedPoints
  };
}
