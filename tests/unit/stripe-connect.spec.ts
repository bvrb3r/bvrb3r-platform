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
});
