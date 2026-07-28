import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { FintechServiceError, updateMembershipCompensation } from "@/lib/fintech/service";

const compensationSchema = z.object({
  routingModel: z.enum(["freelance", "booth_rent", "autobooth_rent"]),
  autoBoothPercent: z.coerce.number().min(0).max(1).optional().nullable(),
  boothRentAmount: z.coerce.number().min(0).optional().nullable(),
  boothRentFrequency: z.enum(["weekly", "monthly"]).optional().nullable(),
  payoutBlockReason: z.string().trim().optional().nullable()
});

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to update the compensation assignment.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const parsed = compensationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid compensation assignment payload." }, { status: 400 });
    }

    const { id } = await params;
    const payload = await updateMembershipCompensation(user, id, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
