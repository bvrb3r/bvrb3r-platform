import {
  buildBookingTransactionBreakdownFromContext,
  readAppointmentFinancialContext,
  type AppointmentFinancialContext
} from "@/lib/fintech/breakdown";
import type {
  BookingMoneyTimelineView,
  MoneyTimelineEventStatus,
  MoneyTimelineEventType,
  MoneyTimelineEventView
} from "@/types/fintech";

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function sortEvents(events: MoneyTimelineEventView[]) {
  return [...events].sort((left, right) => {
    const leftValue = left.occurredAt ? new Date(left.occurredAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightValue = right.occurredAt ? new Date(right.occurredAt).getTime() : Number.MAX_SAFE_INTEGER;
    return leftValue - rightValue || left.label.localeCompare(right.label);
  });
}

function addEvent(
  events: MoneyTimelineEventView[],
  input: {
    type: MoneyTimelineEventType;
    label: string;
    status: MoneyTimelineEventStatus;
    occurredAt?: string | null;
    amount?: number;
    note?: string;
    sourceId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  events.push({
    id: `${input.type}:${input.sourceId ?? input.occurredAt ?? events.length}`,
    type: input.type,
    label: input.label,
    status: input.status,
    occurredAt: input.occurredAt ?? null,
    amount: input.amount,
    note: input.note,
    sourceId: input.sourceId,
    metadata: input.metadata ?? {}
  });
}

export function buildMoneyTimelineFromContext(context: AppointmentFinancialContext): BookingMoneyTimelineView {
  const breakdown = buildBookingTransactionBreakdownFromContext(context);
  const bookingPayment = context.paymentRows.find((row) => row.payment_type === "booking") ?? null;
  const authorizedPayment = context.paymentRows.find((row) =>
    row.payment_type === "booking" && ["authorized", "captured", "partially_refunded", "refunded"].includes(row.payment_status)
  ) ?? bookingPayment;
  const capturedPayment = context.paymentRows.find((row) =>
    row.payment_type === "booking" && ["captured", "partially_refunded", "refunded"].includes(row.payment_status)
  ) ?? null;
  const latestRouting = context.routingRows[0] ?? null;
  const latestExecution = context.executionRows[0] ?? null;
  const redeemedTransaction = context.pointsTransactions.find((transaction) => transaction.pointsDelta < 0 && transaction.sourceType === "booking_redemption") ?? null;
  const issuedTransaction = context.pointsTransactions.find((transaction) => transaction.pointsDelta > 0) ?? null;
  const reversedTransaction = context.pointsTransactions.find((transaction) => transaction.status === "reversed" || transaction.metadata.reversalOfCashoutRequestId) ?? null;
  const refund = context.refundRows[0] ?? null;
  const events: MoneyTimelineEventView[] = [];

  addEvent(events, {
    type: "booking_created",
    label: "Booking created",
    status: "posted",
    occurredAt: context.appointmentCreatedAt,
    amount: breakdown.gross,
    sourceId: context.appointment.id,
    metadata: {
      barberId: context.appointment.barberId,
      clientId: context.appointment.clientId,
      locationId: context.appointment.locationId
    }
  });

  addEvent(events, {
    type: "payment_authorized",
    label: "Payment authorized",
    status: authorizedPayment ? "posted" : "pending",
    occurredAt: authorizedPayment?.created_at ?? null,
    amount: authorizedPayment ? roundCurrency(Number(authorizedPayment.amount)) : undefined,
    sourceId: authorizedPayment?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "payment_captured",
    label: "Payment captured",
    status: capturedPayment ? "posted" : "pending",
    occurredAt: capturedPayment?.paid_at ?? capturedPayment?.created_at ?? null,
    amount: capturedPayment ? roundCurrency(Number(capturedPayment.amount)) : undefined,
    sourceId: capturedPayment?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "platform_fee_taken",
    label: "Platform fee taken",
    status: latestRouting && breakdown.platformFee > 0 ? "posted" : "pending",
    occurredAt: latestRouting?.updated_at ?? null,
    amount: breakdown.platformFee,
    sourceId: latestRouting?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "barber_earnings_calculated",
    label: "Barber earnings calculated",
    status: latestRouting && breakdown.barberEarnings > 0 ? "posted" : "pending",
    occurredAt: latestRouting?.updated_at ?? null,
    amount: breakdown.barberEarnings,
    sourceId: latestRouting?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "shop_split_applied",
    label: "Shop split applied",
    status: latestRouting && breakdown.shopEarnings > 0 ? "posted" : "pending",
    occurredAt: latestRouting?.updated_at ?? null,
    amount: breakdown.shopEarnings,
    sourceId: latestRouting?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "points_redeemed",
    label: "BVR Points redeemed",
    status: redeemedTransaction ? "posted" : "pending",
    occurredAt: redeemedTransaction?.createdAt ?? null,
    amount: breakdown.pointsUsed,
    sourceId: redeemedTransaction?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "points_issued",
    label: "BVR Points issued",
    status: issuedTransaction ? (issuedTransaction.status === "pending" ? "pending" : "posted") : "pending",
    occurredAt: issuedTransaction?.createdAt ?? issuedTransaction?.unlockedAt ?? null,
    amount: breakdown.pointsEarned,
    note: issuedTransaction?.status === "pending" ? "Pending unlock window." : undefined,
    sourceId: issuedTransaction?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "payout_eligible",
    label: "Payout eligible",
    status: context.payoutVisibility?.status === "pending"
      || context.payoutVisibility?.status === "queued"
      || context.payoutVisibility?.status === "in_transit"
      || context.payoutVisibility?.status === "paid"
      ? "posted"
      : context.payoutVisibility?.status === "not_ready"
        ? "blocked"
        : "pending",
    occurredAt: context.payoutVisibility?.status !== "not_ready"
      ? context.payoutVisibility?.lastUpdatedAt ?? latestRouting?.updated_at ?? null
      : null,
    amount: context.payoutVisibility?.eligibleAmount ?? roundCurrency(breakdown.barberEarnings + breakdown.shopEarnings),
    note: context.payoutVisibility?.blockedReasons.join(" | ") || context.payoutVisibility?.nextAction,
    sourceId: latestRouting?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "payout_sent",
    label: "Payout sent",
    status: latestExecution?.execution_status === "executed" ? "posted" : latestExecution?.execution_status === "failed" ? "blocked" : "pending",
    occurredAt: latestExecution?.executed_at ?? null,
    amount: latestExecution ? roundCurrency(Number(latestExecution.amount)) : undefined,
    note: latestExecution?.failure_reason ?? latestExecution?.blocked_reason ?? undefined,
    sourceId: latestExecution?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "payout_completed",
    label: "Payout completed",
    status: context.payoutVisibility?.status === "paid"
      ? "posted"
      : context.payoutVisibility?.status === "failed"
        ? "blocked"
        : "pending",
    occurredAt: context.payoutVisibility?.status === "paid"
      ? latestExecution?.executed_at ?? latestExecution?.updated_at ?? context.payoutVisibility.lastUpdatedAt
      : null,
    amount: context.payoutVisibility?.eligibleAmount ?? undefined,
    sourceId: latestExecution?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "refund_issued",
    label: "Refund issued",
    status: refund ? "posted" : "pending",
    occurredAt: refund?.refunded_at ?? null,
    amount: refund ? roundCurrency(Number(refund.amount)) : undefined,
    sourceId: refund?.id ?? context.appointment.id
  });

  addEvent(events, {
    type: "points_reversed",
    label: "BVR Points reversed",
    status: reversedTransaction ? "posted" : "pending",
    occurredAt: reversedTransaction?.reversedAt ?? reversedTransaction?.createdAt ?? null,
    amount: reversedTransaction ? Math.abs(roundCurrency(Number(reversedTransaction.pointsDelta))) : undefined,
    sourceId: reversedTransaction?.id ?? context.appointment.id
  });

  return {
    appointmentId: context.appointment.id,
    currency: breakdown.currency,
    paymentStatus: bookingPayment?.payment_status ?? context.paymentSummary?.latestBookingPayment?.paymentStatus ?? null,
    payoutStatus: breakdown.payoutStatus,
    events: sortEvents(events)
  };
}

export async function readBookingMoneyTimeline(appointmentId: string) {
  const context = await readAppointmentFinancialContext(appointmentId);
  if (!context) {
    return null;
  }

  return buildMoneyTimelineFromContext(context);
}
