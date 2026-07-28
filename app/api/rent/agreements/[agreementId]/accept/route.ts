import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { acceptRentAgreement, getRentWorkspacePayload } from "@/lib/rent/service";

const idSchema = z.string().uuid();

export async function POST(
  _request: Request,
  context: { params: Promise<{ agreementId: string }> }
) {
  try {
    const user = await getSessionUser();
    await getRentWorkspacePayload(user);
    const { agreementId } = await context.params;
    const parsed = idSchema.safeParse(agreementId);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid agreement." }, { status: 400 });
    }
    const agreement = await acceptRentAgreement(parsed.data);
    return NextResponse.json({ agreement });
  } catch (error) {
    return rentErrorResponse(error, "Unable to accept the rent agreement.");
  }
}
