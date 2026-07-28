import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { getRentWorkspacePayload, settleCashContribution } from "@/lib/rent/service";

const schema = z.object({
  evidenceReference: z.string().trim().min(3).max(500)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ contributionId: string }> }
) {
  try {
    const user = await getSessionUser();
    const workspace = await getRentWorkspacePayload(user);
    if (workspace.viewer !== "owner") {
      return NextResponse.json({ error: "Only the shop owner may confirm cash transfer evidence." }, { status: 403 });
    }
    const { contributionId } = await context.params;
    if (!z.string().uuid().safeParse(contributionId).success) {
      return NextResponse.json({ error: "Invalid contribution." }, { status: 400 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Transfer evidence is required." }, { status: 400 });
    }
    const contribution = await settleCashContribution({
      contributionId,
      evidenceReference: parsed.data.evidenceReference
    });
    return NextResponse.json({ contribution });
  } catch (error) {
    return rentErrorResponse(error, "Unable to settle the cash contribution.");
  }
}
