import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { groupMemberInputSchema } from "@/lib/group-booking/domain";

describe("Zod 4 compatibility", () => {
  it("preserves UUID-shaped identifiers and defaults while rejecting malformed IDs", () => {
    const member = {
      memberKey: "first", fullName: "Test Client", email: "test@example.com",
      phone: "8135550100", startsAt: "2026-10-29T12:00:00-04:00",
      barberId: "11111111-1111-1111-1111-111111111111",
      serviceId: "22222222-2222-2222-2222-222222222222",
      locationId: "33333333-3333-3333-3333-333333333333"
    };
    expect(groupMemberInputSchema.parse(member).isMinor).toBe(false);
    expect(groupMemberInputSchema.safeParse({ ...member, barberId: "invalid" }).success).toBe(false);
  });

  it("returns field errors through the booking form resolver instead of throwing", async () => {
    const resolver = zodResolver(z.object({ clientName: z.string().min(2) }));
    const options = { fields: {}, shouldUseNativeValidation: false };
    const invalid = await resolver({ clientName: "" }, undefined, options);
    expect(invalid.errors.clientName?.message).toBeTruthy();
    const valid = await resolver({ clientName: "Phil" }, undefined, options);
    expect(valid.errors).toEqual({});
    expect(valid.values).toEqual({ clientName: "Phil" });
  });
});
