import { describe, expect, it } from "vitest";
import {
  assertPaymentStatusTransition,
  normalizePaymentMethodReference,
  resolveAppointmentPaymentIntent,
  resolveRefundOutcome
} from "@/lib/payments/domain";

describe("phase 9 payment domain", () => {
  it("allows valid payment state transitions and rejects invalid ones", () => {
    expect(() => assertPaymentStatusTransition("pending", "authorized")).not.toThrow();
    expect(() => assertPaymentStatusTransition("authorized", "captured")).not.toThrow();
    expect(() => assertPaymentStatusTransition("captured", "partially_refunded")).not.toThrow();
    expect(() => assertPaymentStatusTransition("partially_refunded", "refunded")).not.toThrow();
    expect(() => assertPaymentStatusTransition("captured", "authorized")).toThrow(/Cannot transition payment/);
  });

  it("builds a deterministic full-booking payment intent for an upcoming appointment", () => {
    const intent = resolveAppointmentPaymentIntent({
      appointmentStatus: "booked",
      depositAmount: 15,
      balanceDue: 40,
      grandTotal: 55,
      hasActiveBookingPayment: false
    });

    expect(intent.amount).toBe(55);
    expect(intent.status).toBe("captured");
    expect(intent.stage).toBe("booking");
  });

  it("builds a checkout payment intent for a completed appointment balance", () => {
    const intent = resolveAppointmentPaymentIntent({
      appointmentStatus: "completed",
      depositAmount: 15,
      balanceDue: 40,
      grandTotal: 55,
      hasActiveBookingPayment: false
    });

    expect(intent.amount).toBe(40);
    expect(intent.status).toBe("captured");
    expect(intent.stage).toBe("checkout");
  });

  it("rejects duplicate booking payment creation when one is already active", () => {
    expect(() =>
      resolveAppointmentPaymentIntent({
        appointmentStatus: "booked",
        depositAmount: 15,
        balanceDue: 40,
        grandTotal: 55,
        hasActiveBookingPayment: true
      })
    ).toThrow(/already active/i);
  });

  it("computes partial and full refund outcomes safely", () => {
    const partial = resolveRefundOutcome(55, 15);
    const full = resolveRefundOutcome(55, 55);

    expect(partial.nextStatus).toBe("partially_refunded");
    expect(partial.remainingAmount).toBe(40);
    expect(full.nextStatus).toBe("refunded");
    expect(full.remainingAmount).toBe(0);
  });

  it("rejects refund totals that exceed the original payment", () => {
    expect(() => resolveRefundOutcome(55, 60)).toThrow(/cannot exceed/i);
  });

  it("normalizes tokenized payment method metadata and rejects invalid last4 values", () => {
    const normalized = normalizePaymentMethodReference({
      provider: "stripe",
      providerCustomerId: "cus_demo",
      providerPaymentMethodId: "pm_demo",
      brand: "Visa",
      last4: "4242",
      expMonth: 8,
      expYear: 2028,
      isDefault: true
    });

    expect(normalized.providerPaymentMethodId).toBe("pm_demo");
    expect(normalized.last4).toBe("4242");
    expect(() =>
      normalizePaymentMethodReference({
        provider: "stripe",
        providerPaymentMethodId: "pm_bad",
        last4: "42424"
      })
    ).toThrow(/final four digits/i);
  });
});
