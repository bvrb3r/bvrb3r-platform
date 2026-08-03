import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { getRentWorkspacePayload, requestRentPayment } from "@/lib/rent/service";

const schema = z.object({
  rail: z.enum(["card", "barber_balance", "cash"]),
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ obligationId: string }> }
) {
  try {
    const user = await getSessionUser();
    const workspace = await getRentWorkspacePayload(user);
    if (workspace.viewer !== "barber") {
      return NextResponse.json(
        { error: "Only the named barber can pay this rent obligation." },
        { status: 403 }
      );
    }
    const { obligationId } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(obligationId).success || !parsed.success) {
      return NextResponse.json(
        { error: parsed.success ? "Invalid rent obligation." : parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }
    const paymentRequest = await requestRentPayment({
      obligationId,
      ...parsed.data
    });
    return NextResponse.json({ paymentRequest }, { status: 202 });
  } catch (error) {
    return rentErrorResponse(error, "Unable to request the rent payment.");
  }
}
