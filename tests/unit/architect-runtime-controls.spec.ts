import { describe, expect, it } from "vitest";
import {
  ArchitectRuntimeControlError,
  assertArchitectRuntimeControlAllows
} from "@/lib/architect/city-map/runtime-controls.server";

function client(result: {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: string) => {
      expect(table).toBe("architect_system_controls");
      return {
        select: () => ({
          in: async (_column: string, keys: string[]) => {
            expect(keys).toEqual(["maintenance", "bookings"]);
            return result;
          }
        })
      };
    }
  } as never;
}

describe("Architect runtime controls", () => {
  it("allows a guarded mutation only when maintenance and its own switch are inactive", async () => {
    await expect(assertArchitectRuntimeControlAllows(client({
      data: [
        { control_key: "maintenance", active: false, reason: null, version: 1 },
        { control_key: "bookings", active: false, reason: null, version: 1 }
      ],
      error: null
    }), "bookings")).resolves.toBeUndefined();
  });

  it("blocks through the shared maintenance switch or the scoped switch", async () => {
    await expect(assertArchitectRuntimeControlAllows(client({
      data: [
        { control_key: "maintenance", active: true, reason: "Change window", version: 2 },
        { control_key: "bookings", active: false, reason: null, version: 1 }
      ],
      error: null
    }), "bookings")).rejects.toMatchObject({
      controlKey: "maintenance",
      status: 503,
      code: "architect_system_control_active"
    });

    await expect(assertArchitectRuntimeControlAllows(client({
      data: [
        { control_key: "maintenance", active: false, reason: null, version: 2 },
        { control_key: "bookings", active: true, reason: "Incident hold", version: 3 }
      ],
      error: null
    }), "bookings")).rejects.toThrow("New bookings are temporarily paused.");
  });

  it("allows only the explicit pre-migration missing-table state", async () => {
    await expect(assertArchitectRuntimeControlAllows(client({
      data: null,
      error: { code: "42P01", message: "relation architect_system_controls does not exist" }
    }), "bookings")).resolves.toBeUndefined();

    await expect(assertArchitectRuntimeControlAllows(client({
      data: null,
      error: { code: "08006", message: "connection failure" }
    }), "bookings")).rejects.toBeInstanceOf(ArchitectRuntimeControlError);
  });

  it("fails closed when the control registry is incomplete", async () => {
    await expect(assertArchitectRuntimeControlAllows(client({
      data: [{ control_key: "bookings", active: false, reason: null, version: 1 }],
      error: null
    }), "bookings")).rejects.toThrow("control state is incomplete");
  });
});
