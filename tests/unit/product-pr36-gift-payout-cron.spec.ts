import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runGiftCardPayoutWorkerMock } = vi.hoisted(() => ({
  runGiftCardPayoutWorkerMock: vi.fn()
}));

vi.mock("@/lib/gift-cards/payout-worker", () => ({
  runGiftCardPayoutWorker: runGiftCardPayoutWorkerMock
}));

import { GET } from "@/app/api/cron/gift-card-payouts/route";

describe("Product PR36 gift-card payout cron route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "synthetic-gift-payout-cron-secret";
    runGiftCardPayoutWorkerMock.mockReset();
    runGiftCardPayoutWorkerMock.mockResolvedValue({
      scanned: 1,
      paid: 1,
      recovered: 0,
      alreadyPaid: 0,
      notReady: 0,
      needsReview: 0,
      failed: 0,
      skipped: 0,
      items: []
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects missing and incorrect bearer credentials without moving money", async () => {
    const missing = await GET(new Request("https://bvrb3r.app/api/cron/gift-card-payouts"));
    const incorrect = await GET(new Request("https://bvrb3r.app/api/cron/gift-card-payouts", {
      headers: { authorization: "Bearer incorrect-synthetic-secret" }
    }));

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(runGiftCardPayoutWorkerMock).not.toHaveBeenCalled();
  });

  it("runs the server-owned worker for the exact bearer secret and prevents caching", async () => {
    const response = await GET(new Request("https://bvrb3r.app/api/cron/gift-card-payouts", {
      headers: { authorization: "Bearer synthetic-gift-payout-cron-secret" }
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ ok: true, result: { scanned: 1, paid: 1 } });
    expect(runGiftCardPayoutWorkerMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed without leaking provider or database details", async () => {
    runGiftCardPayoutWorkerMock.mockRejectedValueOnce(new Error("sensitive Stripe or database detail"));
    const response = await GET(new Request("https://bvrb3r.app/api/cron/gift-card-payouts", {
      headers: { authorization: "Bearer synthetic-gift-payout-cron-secret" }
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Gift-card payout worker failed."
    });
  });
});
