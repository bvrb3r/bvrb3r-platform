import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { FintechServiceError, recordLegalAcceptance } from "@/lib/fintech/service";

const legalAcceptanceSchema = z.object({
  agreementType: z.enum(["platform_terms", "barber_agreement", "shop_agreement", "payout_tax_acknowledgment"]),
  agreementVersion: z.string().trim().optional(),
  shopId: z.string().uuid().optional()
});

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to record the legal acceptance.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = legalAcceptanceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid legal acceptance payload." }, { status: 400 });
    }

    const payload = await recordLegalAcceptance(user, parsed.data);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
