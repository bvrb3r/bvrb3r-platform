import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { approveCashoutRequest } from "@/lib/points/cashout-review";

const approveSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can approve BVR Points cash-out requests." }, { status: 403 });
  }

  const parsed = approveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cash-out approval payload." }, { status: 400 });
  }

  try {
    const cashout = await approveCashoutRequest({
      requestId: parsed.data.requestId,
      actorUserId: user.id,
      actorRole: user.role,
      note: parsed.data.note
    });
    return NextResponse.json({ cashout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to approve this cash-out request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
