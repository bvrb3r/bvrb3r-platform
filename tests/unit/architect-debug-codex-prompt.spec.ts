import { describe, expect, it } from "vitest";
import { buildAppointmentDebugPacket } from "@/lib/architect/debug/appointment-debug";
import { generateCodexPromptFromDebugPacket } from "@/lib/architect/debug/codex-prompt";
import { APPOINTMENT_ID, ARCHITECT_USER, createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

describe("architect debug Codex prompt", () => {
  it("generates a concrete fix prompt from packet evidence", async () => {
    const packet = await buildAppointmentDebugPacket(
      createSupabaseStub(createArchitectDebugTables()) as never,
      APPOINTMENT_ID,
      ARCHITECT_USER,
      { persistSession: false }
    );

    const prompt = generateCodexPromptFromDebugPacket(packet);

    expect(prompt).toContain("BVRB3R COMPLETED_BUT_ROUTING_MISSING FIX");
    expect(prompt).toContain(APPOINTMENT_ID);
    expect(prompt).toContain("payment_routing_records");
    expect(prompt).toContain("Do not touch:");
    expect(prompt).toContain("Tests required:");
  });
});
