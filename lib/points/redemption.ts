import type { AppointmentFinancialQuote } from "@/lib/appointments/domain";
import type { PointsRedemptionPreview } from "@/types/points";

export const POINT_IN_APP_VALUE = 0.1;
export const POINT_CASH_VALUE = 0.07;
export const DEFAULT_MAX_REDEMPTION_RATE = 0.35;

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPoints(value: number) {
  return Math.max(0, Math.floor(value));
}

export function pointsToInAppValue(points: number) {
  return roundCurrency(points * POINT_IN_APP_VALUE);
}

export function pointsToCashValue(points: number, rate = POINT_CASH_VALUE) {
  return roundCurrency(points * rate);
}

export function previewPointsRedemption(input: {
  requestedPoints: number;
  promoUnlockedPoints: number;
  earnedUnlockedPoints: number;
  orderTotal: number;
  maxRedemptionRate?: number;
}): PointsRedemptionPreview {
  const maxRedemptionRate = input.maxRedemptionRate ?? DEFAULT_MAX_REDEMPTION_RATE;
  const totalUnlockedPoints = roundPoints(input.promoUnlockedPoints + input.earnedUnlockedPoints);
  const requestedPoints = roundPoints(input.requestedPoints);
  const maxDiscountValue = roundCurrency(Math.max(0, input.orderTotal) * Math.min(Math.max(maxRedemptionRate, 0), 1));
  const maxRedeemablePoints = roundPoints(Math.min(totalUnlockedPoints, Math.floor(maxDiscountValue / POINT_IN_APP_VALUE)));

  if (requestedPoints <= 0) {
    return {
      requestedPoints,
      approvedPoints: 0,
      promoPointsUsed: 0,
      earnedPointsUsed: 0,
      discountAmount: 0,
      maxRedeemablePoints,
      remainingUnlockedPoints: totalUnlockedPoints,
      remainingPromoPoints: roundPoints(input.promoUnlockedPoints),
      remainingEarnedPoints: roundPoints(input.earnedUnlockedPoints),
      maxRedemptionRate
    };
  }

  if (!maxRedeemablePoints) {
    return {
      requestedPoints,
      approvedPoints: 0,
      promoPointsUsed: 0,
      earnedPointsUsed: 0,
      discountAmount: 0,
      maxRedeemablePoints,
      remainingUnlockedPoints: totalUnlockedPoints,
      remainingPromoPoints: roundPoints(input.promoUnlockedPoints),
      remainingEarnedPoints: roundPoints(input.earnedUnlockedPoints),
      maxRedemptionRate,
      blockedReason: "No redeemable points are available for this order."
    };
  }

  const approvedPoints = Math.min(requestedPoints, maxRedeemablePoints);
  const promoPointsUsed = Math.min(roundPoints(input.promoUnlockedPoints), approvedPoints);
  const earnedPointsUsed = Math.max(0, approvedPoints - promoPointsUsed);

  return {
    requestedPoints,
    approvedPoints,
    promoPointsUsed,
    earnedPointsUsed,
    discountAmount: pointsToInAppValue(approvedPoints),
    maxRedeemablePoints,
    remainingUnlockedPoints: totalUnlockedPoints - approvedPoints,
    remainingPromoPoints: roundPoints(input.promoUnlockedPoints) - promoPointsUsed,
    remainingEarnedPoints: roundPoints(input.earnedUnlockedPoints) - earnedPointsUsed,
    maxRedemptionRate,
    blockedReason: approvedPoints < requestedPoints ? "Requested points were reduced by the order cap or available balance." : undefined
  };
}

export function applyPointsPreviewToQuote(
  quote: AppointmentFinancialQuote,
  preview: PointsRedemptionPreview
): AppointmentFinancialQuote {
  if (!preview.approvedPoints || preview.discountAmount <= 0) {
    return quote;
  }

  const existingTaxableBase = Math.max(quote.subtotal - quote.discountTotal, 0);
  const inferredTaxRate = existingTaxableBase > 0 ? quote.taxTotal / existingTaxableBase : 0;
  const nextDiscountTotal = roundCurrency(Math.min(quote.subtotal, quote.discountTotal + preview.discountAmount));
  const nextTaxableBase = Math.max(quote.subtotal - nextDiscountTotal, 0);
  const nextTaxTotal = roundCurrency(nextTaxableBase * Math.max(inferredTaxRate, 0));
  const nextGrandTotal = roundCurrency(nextTaxableBase + nextTaxTotal + quote.tipTotal);
  const preTipCharge = roundCurrency(Math.max(nextGrandTotal - quote.tipTotal, 0));
  const nextDepositDue = roundCurrency(Math.min(quote.depositDue, preTipCharge));
  const nextBalanceDue = roundCurrency(Math.max(nextGrandTotal - nextDepositDue, 0));

  return {
    ...quote,
    discountTotal: nextDiscountTotal,
    taxTotal: nextTaxTotal,
    grandTotal: nextGrandTotal,
    depositDue: nextDepositDue,
    balanceDue: nextBalanceDue
  };
}
