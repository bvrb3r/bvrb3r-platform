import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { disputeRentLine, getRentWorkspacePayload } from "@/lib/rent/service";

const schema = z.object({
  reason: z.string().trim().min(3).max(1000),
  evidenceReference: z.string().trim().min(3).max(500)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ contributionId: string }> }
) {
  try {
    const user = await getSessionUser();
    const workspace = await getRentWorkspacePayload(user);
    if (workspace.viewer !== "barber") {
      return NextResponse.json(
        { error: "Only the named barber can dispute this rent line." },
        { status: 403 }
      );
    }
    const { contributionId } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(contributionId).success || !parsed.success) {
      return NextResponse.json(
        { error: parsed.success ? "Invalid rent line." : parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }
    const dispute = await disputeRentLine({ contributionId, ...parsed.data });
    return NextResponse.json({ dispute }, { status: 201 });
  } catch (error) {
    return rentErrorResponse(error, "Unable to dispute this rent line.");
  }
}
