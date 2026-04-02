import { getPaymentProvider } from "@/lib/payments/provider";

describe("payment provider", () => {
  it("requires Stripe configuration instead of falling back to a local manual provider", async () => {
    const originalSecret = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    await expect(getPaymentProvider()).rejects.toThrow(/stripe payment execution is required/i);

    if (originalSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalSecret;
    }
  });
});
