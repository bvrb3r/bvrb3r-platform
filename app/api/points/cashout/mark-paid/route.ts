import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { markCashoutRequestPaid } from "@/lib/points/cashout-review";

const markPaidSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
  payoutReference: z.string().trim().max(200).optional()
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager")) {
    return NextResponse.json({ error: "Only owners or managers can complete BVR Points cash-out payouts." }, { status: 403 });
  }

  const parsed = markPaidSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cash-out payout completion payload." }, { status: 400 });
  }

  try {
    const cashout = await markCashoutRequestPaid({
      requestId: parsed.data.requestId,
      actorUserId: user.id,
      actorRole: user.role,
      note: parsed.data.note,
      payoutReference: parsed.data.payoutReference
    });
    return NextResponse.json({ cashout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete this cash-out payout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
