import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { applyRentAction, getRentWorkspacePayload } from "@/lib/rent/service";

const schema = z.object({
  action: z.enum(["remind", "retry", "grace", "late_fee", "waive"]),
  reason: z.string().trim().min(3).max(500).optional()
}).superRefine((value, context) => {
  if (value.action === "waive" && !value.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A waiver requires an auditable reason."
    });
  }
});

export async function POST(
  request: Request,
  context: { params: Promise<{ obligationId: string }> }
) {
  try {
    const user = await getSessionUser();
    const workspace = await getRentWorkspacePayload(user);
    if (workspace.viewer !== "owner") {
      return NextResponse.json({ error: "Only the shop owner may perform rent recovery actions." }, { status: 403 });
    }
    const { obligationId } = await context.params;
    if (!z.string().uuid().safeParse(obligationId).success) {
      return NextResponse.json({ error: "Invalid obligation." }, { status: 400 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid rent action." },
        { status: 400 }
      );
    }
    const obligation = await applyRentAction({
      obligationId,
      action: parsed.data.action,
      reason: parsed.data.reason
    });
    return NextResponse.json({ obligation });
  } catch (error) {
    return rentErrorResponse(error, "Unable to perform the rent action.");
  }
}
