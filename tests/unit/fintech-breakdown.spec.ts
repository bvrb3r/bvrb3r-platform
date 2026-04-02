import { describe, expect, it } from "vitest";
import { createInitialLiveOperationsSnapshot } from "@/lib/operations/live-state";
import { buildBookingTransactionBreakdownFromContext, type AppointmentFinancialContext } from "@/lib/fintech/breakdown";
import type { LiveAppointmentRecord } from "@/lib/operations/live-state";

function createContext(): AppointmentFinancialContext {
  const snapshot = createInitialLiveOperationsSnapshot();
  const appointment: LiveAppointmentRecord = {
    ...snapshot.appointments[0],
    id: "appt-money-1",
    barberId: "barber-blaze",
    clientId: "client-jordan",
    locationId: "loc-ybor",
    status: "completed",
    subtotal: 40,
    discountTotal: 5,
    taxTotal: 2,
    tipAmount: 3,
    totalAmount: 40,
    grandTotal: 40
  };

  return {
    appointment,
    appointmentCreatedAt: "2026-03-26T10:00:00.000Z",
    clientName: "Jordan Ellis",
    barberName: "Blaze Carter",
    shopLabel: "Ybor / Tampa",
    paymentSummary: null,
    paymentRows: [
      {
        id: "pay-1",
        appointment_id: "appt-money-1",
        payment_status: "captured",
        payment_type: "booking",
        provider: "stripe",
        amount: 40,
        currency: "usd",
        paid_at: "2026-03-26T10:30:00.000Z",
        created_at: "2026-03-26T10:15:00.000Z"
      }
    ],
    refundRows: [],
    routingRows: [
      {
        id: "route-1",
        payment_id: "pay-1",
        appointment_id: "appt-money-1",
        platform_fee_amount: 2,
        provider_fee_amount: 1,
        barber_payout_amount: 16.5,
        shop_split_amount: 16.5,
        payout_readiness_status: "ready",
        money_routing_status: "ready_for_payout",
        blocked_reason: null,
        reconciliation_status: "settled",
        updated_at: "2026-03-26T11:00:00.000Z"
      }
    ],
    executionRows: [],
    pointsTransactions: [
      {
        id: "pts-redeem-1",
        userId: "client-jordan",
        role: "client",
        pointClass: "promo",
        eventType: "booking",
        sourceType: "booking_redemption",
        sourceId: "appt-money-1",
        pointsDelta: -50,
        inAppValue: -5,
        cashValue: 0,
        status: "redeemed",
        createdAt: "2026-03-26T10:10:00.000Z",
        metadata: {
          appointmentId: "appt-money-1"
        }
      },
      {
        id: "pts-earned-1",
        userId: "client-jordan",
        role: "client",
        pointClass: "earned",
        eventType: "booking",
        sourceType: "appointment",
        sourceId: "appt-money-1",
        pointsDelta: 10,
        inAppValue: 1,
        cashValue: 0.7,
        status: "pending",
        createdAt: "2026-03-26T11:10:00.000Z",
        metadata: {
          appointmentId: "appt-money-1"
        }
      }
    ],
    payoutVisibility: {
      appointmentId: "appt-money-1",
      paymentId: "pay-1",
      routingRecordId: "route-1",
      status: "pending",
      eligibleAmount: 33,
      thresholdAmount: 25,
      thresholdRemaining: 0,
      minimumThresholdMet: true,
      blockedReasons: [],
      stripeReady: true,
      disputeHold: false,
      refundHold: false,
      nextAction: "Ready for payout execution.",
      executionCount: 0,
      lastUpdatedAt: "2026-03-26T11:00:00.000Z"
    }
  };
}

describe("fintech breakdown", () => {
  it("builds a canonical booking transaction breakdown from shared financial context", () => {
    const breakdown = buildBookingTransactionBreakdownFromContext(createContext());

    expect(breakdown).toMatchObject({
      appointmentId: "appt-money-1",
      currency: "usd",
      gross: 40,
      discounts: 5,
      net: 35,
      tax: 2,
      tip: 3,
      total: 40,
      platformFee: 2,
      processorFee: 1,
      barberEarnings: 16.5,
      shopEarnings: 16.5,
      pointsUsed: 50,
      pointsEarned: 10,
      payoutStatus: "pending"
    });
  });
});
