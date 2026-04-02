import { describe, expect, it } from "vitest";
import { createInitialLiveOperationsSnapshot } from "@/lib/operations/live-state";
import { buildMoneyTimelineFromContext } from "@/lib/fintech/timeline";
import type { AppointmentFinancialContext } from "@/lib/fintech/breakdown";
import type { LiveAppointmentRecord } from "@/lib/operations/live-state";

function createTimelineContext(): AppointmentFinancialContext {
  const snapshot = createInitialLiveOperationsSnapshot();
  const appointment: LiveAppointmentRecord = {
    ...snapshot.appointments[0],
    id: "appt-money-2",
    barberId: "barber-wave",
    clientId: "client-jordan",
    locationId: "loc-ybor",
    status: "completed",
    subtotal: 50,
    discountTotal: 0,
    taxTotal: 0,
    tipAmount: 5,
    totalAmount: 55,
    grandTotal: 55
  };

  return {
    appointment,
    appointmentCreatedAt: "2026-03-26T09:00:00.000Z",
    clientName: "Jordan Ellis",
    barberName: "Wave Brooks",
    shopLabel: "Ybor / Tampa",
    paymentSummary: null,
    paymentRows: [
      {
        id: "pay-2",
        appointment_id: "appt-money-2",
        payment_status: "authorized",
        payment_type: "booking",
        provider: "stripe",
        amount: 55,
        currency: "usd",
        paid_at: null,
        created_at: "2026-03-26T09:05:00.000Z"
      },
      {
        id: "pay-2-captured",
        appointment_id: "appt-money-2",
        payment_status: "captured",
        payment_type: "booking",
        provider: "stripe",
        amount: 55,
        currency: "usd",
        paid_at: "2026-03-26T09:15:00.000Z",
        created_at: "2026-03-26T09:05:00.000Z"
      }
    ],
    refundRows: [
      {
        id: "refund-2",
        payment_id: "pay-2-captured",
        amount: 10,
        refunded_at: "2026-03-26T13:00:00.000Z"
      }
    ],
    routingRows: [
      {
        id: "route-2",
        payment_id: "pay-2-captured",
        appointment_id: "appt-money-2",
        platform_fee_amount: 3,
        provider_fee_amount: 1.5,
        barber_payout_amount: 25,
        shop_split_amount: 26.5,
        payout_readiness_status: "ready",
        money_routing_status: "paid_out",
        blocked_reason: null,
        reconciliation_status: "settled",
        updated_at: "2026-03-26T10:00:00.000Z"
      }
    ],
    executionRows: [
      {
        id: "exec-2",
        payment_id: "pay-2-captured",
        appointment_id: "appt-money-2",
        amount: 51.5,
        execution_status: "executed",
        failure_reason: null,
        blocked_reason: null,
        processor_transfer_id: "tr_123",
        reconciliation_status: "settled",
        executed_at: "2026-03-26T12:00:00.000Z",
        failed_at: null,
        reversed_at: null,
        created_at: "2026-03-26T11:30:00.000Z",
        updated_at: "2026-03-26T12:05:00.000Z"
      }
    ],
    pointsTransactions: [
      {
        id: "pts-issued-2",
        userId: "client-jordan",
        role: "client",
        pointClass: "earned",
        eventType: "booking",
        sourceType: "appointment",
        sourceId: "appt-money-2",
        pointsDelta: 12,
        inAppValue: 1.2,
        cashValue: 0.84,
        status: "unlocked",
        createdAt: "2026-03-26T12:30:00.000Z",
        unlockedAt: "2026-03-26T12:30:00.000Z",
        metadata: {
          appointmentId: "appt-money-2"
        }
      },
      {
        id: "pts-reversed-2",
        userId: "client-jordan",
        role: "client",
        pointClass: "earned",
        eventType: "booking",
        sourceType: "refund",
        sourceId: "refund-2",
        pointsDelta: -12,
        inAppValue: -1.2,
        cashValue: -0.84,
        status: "reversed",
        createdAt: "2026-03-26T13:05:00.000Z",
        reversedAt: "2026-03-26T13:05:00.000Z",
        metadata: {
          appointmentId: "appt-money-2"
        }
      }
    ],
    payoutVisibility: {
      appointmentId: "appt-money-2",
      paymentId: "pay-2-captured",
      routingRecordId: "route-2",
      status: "paid",
      eligibleAmount: 51.5,
      thresholdAmount: 25,
      thresholdRemaining: 0,
      minimumThresholdMet: true,
      blockedReasons: [],
      stripeReady: true,
      disputeHold: false,
      refundHold: false,
      nextAction: "Payout completed.",
      executionCount: 1,
      lastUpdatedAt: "2026-03-26T12:05:00.000Z"
    }
  };
}

describe("fintech timeline", () => {
  it("reconstructs canonical money milestones from booking, payment, payout, refund, and points state", () => {
    const timeline = buildMoneyTimelineFromContext(createTimelineContext());

    expect(timeline.paymentStatus).toBe("authorized");
    expect(timeline.payoutStatus).toBe("paid");
    expect(timeline.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "booking_created",
      "payment_authorized",
      "payment_captured",
      "platform_fee_taken",
      "barber_earnings_calculated",
      "shop_split_applied",
      "points_issued",
      "payout_eligible",
      "payout_sent",
      "payout_completed",
      "refund_issued",
      "points_reversed"
    ]));
    expect(timeline.events.find((event) => event.type === "payout_completed")?.status).toBe("posted");
    expect(timeline.events.find((event) => event.type === "refund_issued")?.amount).toBe(10);
    expect(timeline.events.find((event) => event.type === "points_reversed")?.status).toBe("posted");
  });
});
