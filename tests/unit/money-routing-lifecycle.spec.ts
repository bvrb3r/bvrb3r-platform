import { describe, expect, it } from "vitest";
import { calculatePaymentRouting } from "@/lib/fintech/domain";

describe("Mission 2 payout-readiness lifecycle", () => {
  it("blocks payout readiness for fully refunded money", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "refunded",
      grossAmount: 80,
      refundedAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true
    });

    expect(result.moneyRoutingStatus).toBe("refunded");
    expect(result.payoutReadinessStatus).toBe("blocked");
    expect(result.barberPayoutAmount).toBe(0);
  });

  it("keeps captured appointment money not ready until service completion", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: false
    });

    expect(result.moneyRoutingStatus).toBe("pending");
    expect(result.payoutReadinessStatus).toBe("not_ready");
  });

  it("separates completed money eligibility from missing processor readiness", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: false,
      shopReady: false,
      appointmentCompleted: true
    });

    expect(result.moneyRoutingStatus).toBe("ready_for_payout");
    expect(result.payoutReadinessStatus).toBe("blocked");
    expect(result.blockedReason).toMatch(/payout readiness/i);
  });

  it("allows readiness only after capture, completion, and recipient setup", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true
    });

    expect(result.moneyRoutingStatus).toBe("ready_for_payout");
    expect(result.payoutReadinessStatus).toBe("ready");
    expect(result.blockedReason).toBeNull();
  });

  it("blocks both money routing and payout readiness while a dispute is active", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true,
      disputeHold: true
    });

    expect(result.moneyRoutingStatus).toBe("blocked");
    expect(result.payoutReadinessStatus).toBe("blocked");
    expect(result.blockedReason).toMatch(/dispute|chargeback/i);
  });
});
