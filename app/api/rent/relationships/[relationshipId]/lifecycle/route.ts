import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import {
  applyRentRelationshipLifecycle,
  getRentWorkspacePayload
} from "@/lib/rent/service";

const schema = z.object({
  type: z.enum(["change_terms", "pause", "leave", "end"]),
  reason: z.string().trim().min(3).max(1000),
  effectiveAt: z.string().datetime(),
  idempotencyKey: z.string().min(8).max(200),
  proposedTerms: z.record(z.unknown()).default({}),
  shopId: z.string().min(1).max(200).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ relationshipId: string }> }
) {
  try {
    const user = await getSessionUser();
    const input = await request.json().catch(() => null);
    const parsed = schema.safeParse(input);
    const workspace = await getRentWorkspacePayload(
      user,
      parsed.success ? parsed.data.shopId : null
    );
    const { relationshipId } = await context.params;
    if (!z.string().uuid().safeParse(relationshipId).success || !parsed.success) {
      return NextResponse.json(
        { error: parsed.success ? "Invalid shop relationship." : parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }
    const lifecycle = await applyRentRelationshipLifecycle({
      relationshipId,
      ...parsed.data
    });
    return NextResponse.json({ lifecycle, viewer: workspace.viewer });
  } catch (error) {
    return rentErrorResponse(error, "Unable to change this shop relationship.");
  }
}
