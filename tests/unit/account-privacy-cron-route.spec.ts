import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runWorkerMock } = vi.hoisted(() => ({
  runWorkerMock: vi.fn()
}));

vi.mock("@/lib/trust/account-privacy-worker", () => ({
  runPr31AccountPrivacyWorker: runWorkerMock
}));

import { GET } from "@/app/api/cron/account-privacy/route";

describe("Product PR31 account privacy cron route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "synthetic-cron-secret-for-tests";
    runWorkerMock.mockReset();
    runWorkerMock.mockResolvedValue({
      expiredExports: 1,
      builtExports: 2,
      failedExports: 0,
      finalizedAccounts: 1,
      failedFinalizations: 0
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects a missing or incorrect bearer secret without running the worker", async () => {
    const missing = await GET(new Request("https://bvrb3r.app/api/cron/account-privacy"));
    const incorrect = await GET(new Request("https://bvrb3r.app/api/cron/account-privacy", {
      headers: { authorization: "Bearer incorrect-synthetic-secret" }
    }));
    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(runWorkerMock).not.toHaveBeenCalled();
  });

  it("runs the server-owned worker for the exact bearer secret", async () => {
    const response = await GET(new Request("https://bvrb3r.app/api/cron/account-privacy", {
      headers: { authorization: "Bearer synthetic-cron-secret-for-tests" }
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      result: { builtExports: 2, finalizedAccounts: 1 }
    });
    expect(runWorkerMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed without leaking worker details", async () => {
    runWorkerMock.mockRejectedValueOnce(new Error("sensitive internal detail"));
    const response = await GET(new Request("https://bvrb3r.app/api/cron/account-privacy", {
      headers: { authorization: "Bearer synthetic-cron-secret-for-tests" }
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Account privacy worker failed."
    });
  });
});
