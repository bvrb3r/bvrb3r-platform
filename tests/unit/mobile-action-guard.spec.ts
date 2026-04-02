import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetActionGuardsForTests, runGuardedAction } from "@/lib/mobile/action-guard";

describe("mobile action guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetActionGuardsForTests();
  });

  afterEach(() => {
    resetActionGuardsForTests();
    vi.useRealTimers();
  });

  it("reuses the same in-flight promise for duplicate actions", async () => {
    const action = vi.fn(async () => "ok");

    const first = runGuardedAction("booking:create:test", action);
    const second = runGuardedAction("booking:create:test", action);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe("ok");
    expect(secondResult).toBe("ok");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("blocks immediate repeat execution inside the dedupe window and reopens after expiry", async () => {
    let counter = 0;
    const action = vi.fn(async () => ({ id: `result-${++counter}` }));

    const firstResult = await runGuardedAction("points:cashout:test", action, { dedupeWindowMs: 5_000 });
    const secondResult = await runGuardedAction("points:cashout:test", action, { dedupeWindowMs: 5_000 });

    expect(action).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual(firstResult);

    vi.advanceTimersByTime(5_100);

    const thirdResult = await runGuardedAction("points:cashout:test", action, { dedupeWindowMs: 5_000 });

    expect(action).toHaveBeenCalledTimes(2);
    expect(thirdResult).not.toEqual(firstResult);
  });
});
