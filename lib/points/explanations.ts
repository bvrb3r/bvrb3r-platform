import { DEFAULT_CASHOUT_MIN_POINTS } from "@/lib/points/cashout";
import {
  POINT_CASH_VALUE,
  POINT_IN_APP_VALUE,
  pointsToCashValue,
  pointsToInAppValue
} from "@/lib/points/redemption";
import type {
  CashoutRequestRecord,
  PointsActivityTone,
  PointsActivityView,
  PointsBalanceExplanation,
  PointsEventType,
  PointsHistoryView,
  PointsRole,
  PointsTransactionRecord
} from "@/types/points";

const POINTS_PROGRESS_STEP = 50;

type BalanceExplanationInput = {
  role: PointsRole;
  unlockedPoints: number;
  pendingPoints: number;
  earnedUnlockedPoints: number;
  cashoutEligiblePoints: number;
  cashoutValue: number;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formatEventLabel(eventType: PointsEventType) {
  switch (eventType) {
    case "booking":
      return "Completed booking";
    case "retention":
      return "Retention reward";
    case "tip":
      return "Qualified tip";
    case "referral":
      return "Referral completion";
    case "cashout":
      return "Cash-out";
    case "campaign":
    default:
      return "Campaign reward";
  }
}

function getTransactionTitle(transaction: PointsTransactionRecord) {
  if (transaction.status === "reversed") {
    return "Points reversed";
  }

  if (transaction.pointsDelta < 0) {
    const purpose = typeof transaction.metadata.redemptionPurpose === "string"
      ? transaction.metadata.redemptionPurpose
      : null;
    if (transaction.status === "cashed_out") {
      return "Points cashed out";
    }
    if (purpose === "subscription_credit") {
      return "Subscription credit applied";
    }
    if (purpose === "campaign_credit") {
      return "Campaign credit applied";
    }
    if (purpose === "booking_discount") {
      return "Booking discount applied";
    }
    return "Points redeemed";
  }

  return formatEventLabel(transaction.eventType);
}

function getTransactionDetail(transaction: PointsTransactionRecord) {
  if (transaction.status === "reversed") {
    return typeof transaction.metadata.reason === "string"
      ? transaction.metadata.reason.replaceAll("_", " ")
      : "A refund, dispute, or validation failure reversed this reward.";
  }

  if (transaction.pointsDelta < 0) {
    if (transaction.status === "cashed_out") {
      return "Paid through the cash-out review and payout rails.";
    }
    return "Used against an in-app redemption path.";
  }

  const campaignName = typeof transaction.metadata.campaignName === "string"
    ? transaction.metadata.campaignName
    : null;
  const appointmentId = typeof transaction.metadata.appointmentId === "string"
    ? transaction.metadata.appointmentId
    : null;
  if (campaignName) {
    return `${campaignName} applied${appointmentId ? ` on ${appointmentId}.` : "."}`;
  }
  if (transaction.eventType === "tip" && typeof transaction.metadata.tipAmount === "number") {
    return `Tip reward qualified on ${formatCurrency(transaction.metadata.tipAmount)} gratuity.`;
  }
  if (transaction.eventType === "retention" && typeof transaction.metadata.completedBookingCount === "number") {
    return `${transaction.metadata.completedBookingCount} completed visits are now on the board.`;
  }
  return "Closed-loop validation cleared and the reward was written to the ledger.";
}

function getActivityTone(transaction: PointsTransactionRecord): PointsActivityTone {
  if (transaction.status === "reversed") {
    return "warning";
  }

  if (transaction.pointsDelta < 0) {
    return transaction.status === "cashed_out" ? "neutral" : "warning";
  }

  return transaction.status === "pending" ? "neutral" : "positive";
}

function toActivityItem(transaction: PointsTransactionRecord): PointsActivityView {
  return {
    id: transaction.id,
    eventType: transaction.eventType,
    status: transaction.status,
    title: getTransactionTitle(transaction),
    detail: getTransactionDetail(transaction),
    amountLabel: `${transaction.pointsDelta > 0 ? "+" : ""}${transaction.pointsDelta} pts`,
    statusLabel: formatStatusLabel(transaction.status),
    occurredAt: transaction.createdAt,
    tone: getActivityTone(transaction)
  };
}

function getCashoutActivityTone(status: CashoutRequestRecord["status"]): PointsActivityTone {
  if (status === "failed" || status === "rejected" || status === "reversed") {
    return "warning";
  }

  return status === "paid" ? "positive" : "neutral";
}

function toCashoutActivityItem(request: CashoutRequestRecord): PointsActivityView {
  return {
    id: request.id,
    eventType: "cashout",
    status: request.status,
    title: request.status === "paid" ? "Cash-out paid" : `Cash-out ${formatStatusLabel(request.status)}`,
    detail: typeof request.metadata.reviewNote === "string"
      ? request.metadata.reviewNote
      : `${request.pointsRequested} earned points requested for ${formatCurrency(request.cashValue)}.`,
    amountLabel: `${request.pointsRequested} pts`,
    statusLabel: formatStatusLabel(request.status),
    occurredAt: request.processedAt ?? request.createdAt,
    tone: getCashoutActivityTone(request.status)
  };
}

export function buildPointsBalanceExplanation(balance: BalanceExplanationInput): PointsBalanceExplanation {
  const trackedPoints = Math.max(0, balance.unlockedPoints + balance.pendingPoints);
  const nextMilestonePoints = Math.max(
    POINTS_PROGRESS_STEP,
    Math.ceil(Math.max(trackedPoints + 1, 1) / POINTS_PROGRESS_STEP) * POINTS_PROGRESS_STEP
  );
  const pointsToNextMilestone = Math.max(0, nextMilestonePoints - trackedPoints);
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round((trackedPoints / Math.max(nextMilestonePoints, POINTS_PROGRESS_STEP)) * 100))
  );
  const nextMilestoneInAppValue = pointsToInAppValue(nextMilestonePoints);
  const nextMilestoneCashValue = pointsToCashValue(nextMilestonePoints);
  const inAppAdvantage = roundCurrency(nextMilestoneInAppValue - nextMilestoneCashValue);
  const unlockHint = balance.pendingPoints > 0
    ? `${balance.pendingPoints} pending point${balance.pendingPoints === 1 ? "" : "s"} are still validating before they unlock.`
    : "Everything shown here is already available for the next move.";

  let cashoutHint = "In-app value stays stronger than cash-out by design.";
  if (balance.role === "barber" || balance.role === "owner") {
    if (balance.cashoutEligiblePoints >= DEFAULT_CASHOUT_MIN_POINTS) {
      cashoutHint = `${balance.cashoutEligiblePoints} earned points are cash-out ready at ${formatCurrency(balance.cashoutValue)}, but worth ${formatCurrency(pointsToInAppValue(balance.cashoutEligiblePoints))} in-app.`;
    } else {
      const remainingToCashout = Math.max(0, DEFAULT_CASHOUT_MIN_POINTS - balance.cashoutEligiblePoints);
      cashoutHint = `${remainingToCashout} more earned point${remainingToCashout === 1 ? "" : "s"} unlock the default ${DEFAULT_CASHOUT_MIN_POINTS}-point cash-out minimum.`;
    }
  } else if (balance.earnedUnlockedPoints > 0) {
    cashoutHint = `Earned points are worth ${formatCurrency(pointsToInAppValue(balance.earnedUnlockedPoints))} in-app versus ${formatCurrency(pointsToCashValue(balance.earnedUnlockedPoints))} at the default cash-out rate.`;
  }

  return {
    nextMilestonePoints,
    pointsToNextMilestone,
    progressPercent,
    nextMilestoneInAppValue,
    nextMilestoneCashValue,
    progressLabel: pointsToNextMilestone
      ? `${pointsToNextMilestone} pts until ${formatCurrency(nextMilestoneInAppValue)} in-app value.`
      : `${nextMilestonePoints} pts is already worth ${formatCurrency(nextMilestoneInAppValue)} in-app.`,
    valueAdvantageLabel: `${formatCurrency(inAppAdvantage)} more value in-app than cash-out at the default rate.`,
    unlockHint,
    cashoutHint
  };
}

export function buildPointsActivityView(input: Pick<PointsHistoryView, "transactions" | "cashoutRequests">) {
  const cashoutRequestIds = new Set(input.cashoutRequests.map((request) => request.id));

  return [
    ...input.transactions
      .filter((transaction) => !(transaction.sourceType === "cashout_request" && cashoutRequestIds.has(transaction.sourceId)))
      .map(toActivityItem),
    ...input.cashoutRequests.map(toCashoutActivityItem)
  ]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 8);
}

export const POINTS_VALUE_COPY = {
  inAppRate: `${formatCurrency(POINT_IN_APP_VALUE)} per point in app`,
  cashoutRate: `${formatCurrency(POINT_CASH_VALUE)} per point default cash-out`
};
