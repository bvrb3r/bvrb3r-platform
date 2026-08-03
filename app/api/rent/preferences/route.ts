import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { getRentWorkspacePayload, setRentAutopay } from "@/lib/rent/service";

const schema = z.object({
  agreementId: z.string().uuid(),
  enabled: z.boolean(),
  paymentMethodReference: z.string().min(3).max(500).nullable().optional()
});

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    const workspace = await getRentWorkspacePayload(user);
    if (workspace.viewer !== "barber") {
      return NextResponse.json(
        { error: "Only the named barber can change AutoPay." },
        { status: 403 }
      );
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid AutoPay request." },
        { status: 400 }
      );
    }
    const preference = await setRentAutopay(parsed.data);
    return NextResponse.json({ preference });
  } catch (error) {
    return rentErrorResponse(error, "Unable to change AutoPay.");
  }
}
