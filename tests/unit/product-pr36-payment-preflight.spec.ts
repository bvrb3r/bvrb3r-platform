import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Product PR36 payment and gift checkout preflight", () => {
  it("checks shop launch state before either appointment charge path reaches Stripe", () => {
    const guard = read("lib/payments/appointment-payment-guard.ts");
    const service = read("lib/payments/service.ts");
    const provider = read("lib/payments/provider.ts");

    expect(guard).toContain('rpc("pr36_shop_payment_allowed"');
    expect(guard).toContain("This shop is not open yet, so no payment can be taken.");
    expect(service).toMatch(/createCapturedStripePaymentRecord[\s\S]*requireAppointmentPaymentAllowed[\s\S]*paymentIntents\.create/);
    expect(service).toMatch(/input\.posSaleId[\s\S]*requireShopPaymentAllowed[\s\S]*paymentIntents\.create/);
    expect(provider).toMatch(/createDepositIntent[\s\S]*requireAppointmentPaymentAllowed[\s\S]*paymentIntents\.create/);
  });

  it("uses the database deposit amount and never trusts a browser-supplied amount", () => {
    const route = read("app/api/payments/deposit/route.ts");
    const provider = read("lib/payments/provider.ts");

    expect(route).not.toContain("amount: body.amount");
    expect(route).toContain("isClientRole(getCanonicalAccountRole(user.role))");
    expect(provider).toContain("appointment.depositAmount");
    expect(provider).toContain("expectedClientProfileId: input.clientProfileId");
  });

  it("applies claimed gift value before Stripe computes the remaining charge", () => {
    const giftService = read("lib/gift-cards/service.ts");
    const paymentService = read("lib/payments/service.ts");

    expect(giftService).toContain("applyEligibleGiftBalanceAtCheckout");
    expect(giftService).toContain("auto-checkout:${input.appointmentId}");
    expect(paymentService).toMatch(/applyEligibleGiftBalanceAtCheckout[\s\S]*loadAppointmentOrThrow[\s\S]*resolveAppointmentPaymentIntent/);
    expect(paymentService).toContain("giftCardAppliedCents: giftApplication.appliedCents");
    expect(paymentService).toContain("giftCardTipAppliedCents: giftApplication.tipAppliedCents");
  });
});
