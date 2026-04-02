import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { reverseCashoutRequest } from "@/lib/points/cashout-review";

const reverseSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
  payoutReference: z.string().trim().max(200).optional()
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can reverse BVR Points cash-out payouts." }, { status: 403 });
  }

  const parsed = reverseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cash-out reversal payload." }, { status: 400 });
  }

  try {
    const cashout = await reverseCashoutRequest({
      requestId: parsed.data.requestId,
      actorUserId: user.id,
      actorRole: user.role,
      note: parsed.data.note,
      payoutReference: parsed.data.payoutReference
    });
    return NextResponse.json({ cashout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reverse this cash-out payout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
