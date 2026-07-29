import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { createRentAgreement, getRentWorkspacePayload } from "@/lib/rent/service";

const schema = z.object({
  relationshipId: z.string().uuid(),
  model: z.enum(["booth_rent", "autobooth_rent"]),
  rentAmountCents: z.number().int().positive(),
  billingFrequency: z.enum(["weekly", "monthly"]),
  autoBoothBasisPoints: z.number().int().min(0).max(10_000),
  graceHours: z.number().int().min(0).max(168).default(24),
  lateFeeCents: z.number().int().min(0).default(0),
  cashSettlementMethod: z.enum(["provider_transfer", "manual_transfer_with_evidence"]),
  termsSnapshot: z.record(z.unknown()).default({}),
  effectiveAt: z.string().datetime(),
  shopId: z.string().min(1).max(200).optional()
}).superRefine((value, context) => {
  if (value.model === "booth_rent" && value.autoBoothBasisPoints !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["autoBoothBasisPoints"],
      message: "Full Booth Rent cannot apply transaction proceeds."
    });
  }
  if (value.model === "autobooth_rent" && value.autoBoothBasisPoints === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["autoBoothBasisPoints"],
      message: "AutoBooth requires an owner-approved contribution percentage."
    });
  }
});

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const input = await request.json().catch(() => null);
    const parsed = schema.safeParse(input);
    const workspace = await getRentWorkspacePayload(
      user,
      parsed.success ? parsed.data.shopId : null
    );
    if (workspace.viewer !== "owner") {
      return NextResponse.json(
        { error: "Only the shop owner may create a rent agreement." },
        { status: 403 }
      );
    }
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid rent agreement." },
        { status: 400 }
      );
    }
    const agreement = await createRentAgreement(parsed.data);
    return NextResponse.json({ agreement }, { status: 201 });
  } catch (error) {
    return rentErrorResponse(error, "Unable to create the rent agreement.");
  }
}
