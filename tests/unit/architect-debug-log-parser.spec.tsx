import { describe, expect, it } from "vitest";
import { parseArchitectRuntimeLog } from "@/lib/architect/debug/log-parser";

describe("architect debug log parser", () => {
  it("maps postgres codes and appointment ids from pasted runtime logs", () => {
    const parsed = parseArchitectRuntimeLog(`
      POST /api/barber/appointments/2090ae1e-3b7c-59d2-81ac-9f88908fd735/complete 500
      stage: database_update
      postgresCode = 23503
      Key (location_id)=(bad-id) is not present in table "locations".
    `);

    expect(parsed.route).toContain("/api/barber/appointments");
    expect(parsed.httpStatus).toBe("500");
    expect(parsed.postgresDiagnosis).toBe("foreign_key_violation");
    expect(parsed.appointmentId).toBe("2090ae1e-3b7c-59d2-81ac-9f88908fd735");
    expect(parsed.suggestedNextSql).toContain("appointments");
  });
});
