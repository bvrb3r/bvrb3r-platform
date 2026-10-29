import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("essential scheduled jobs", () => {
  it("preserves account privacy hourly and calendar sync every minute", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.crons).toEqual(expect.arrayContaining([
      { path: "/api/cron/account-privacy", schedule: "0 * * * *" },
      { path: "/api/calendar-sync/scheduled", schedule: "* * * * *" }
    ]));
  });
});
