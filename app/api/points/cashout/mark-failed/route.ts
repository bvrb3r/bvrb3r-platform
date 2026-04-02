import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { markCashoutRequestFailed } from "@/lib/points/cashout-review";

const markFailedSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
  payoutReference: z.string().trim().max(200).optional(),
  fraudFlags: z.array(z.string().min(1)).max(10).optional()
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager")) {
    return NextResponse.json({ error: "Only owners or managers can mark BVR Points cash-out payouts as failed." }, { status: 403 });
  }

  const parsed = markFailedSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cash-out failure payload." }, { status: 400 });
  }

  try {
    const cashout = await markCashoutRequestFailed({
      requestId: parsed.data.requestId,
      actorUserId: user.id,
      actorRole: user.role,
      note: parsed.data.note,
      payoutReference: parsed.data.payoutReference,
      fraudFlags: parsed.data.fraudFlags
    });
    return NextResponse.json({ cashout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to mark this cash-out payout as failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
