import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("stripe connect helpers", () => {
  it("requires NEXT_PUBLIC_APP_URL for Stripe return URLs", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    const { buildStripeReturnUrl } = await import("@/lib/stripe/connect");

    expect(() => buildStripeReturnUrl("/api/fintech/connect")).toThrowError(/NEXT_PUBLIC_APP_URL/i);
  });

  it("builds Stripe return URLs from the configured app URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    const { buildStripeReturnUrl } = await import("@/lib/stripe/connect");

    expect(buildStripeReturnUrl("/api/stripe/webhook")).toBe("http://localhost:3000/api/stripe/webhook");
  });

  it("points barber onboarding returns back to Barber More", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.bvrb3r.test";

    const { buildStripeReturnUrl, getStripeConnectOnboardingPath } = await import("@/lib/stripe/connect");

    expect(getStripeConnectOnboardingPath("barber", "return")).toBe("/dashboard/barber/more?stripe=return");
    expect(getStripeConnectOnboardingPath("barber", "refresh")).toBe("/dashboard/barber/more?stripe=refresh");
    expect(buildStripeReturnUrl(getStripeConnectOnboardingPath("barber", "return"))).toBe("https://app.bvrb3r.test/dashboard/barber/more?stripe=return");
    expect(buildStripeReturnUrl(getStripeConnectOnboardingPath("barber", "refresh"))).toBe("https://app.bvrb3r.test/dashboard/barber/more?stripe=refresh");
  });

  it("labels Stripe test mode as not live payouts", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";

    const { getStripeConnectEnvironment } = await import("@/lib/stripe/connect");

    expect(getStripeConnectEnvironment()).toMatchObject({
      mode: "test",
      label: "Stripe test mode - not live payouts.",
      blocksLivePayouts: true
    });
  });
});
