import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import {
  addPr27DisputeEvidence,
  getPr27DisputeCase
} from "@/lib/trust/product-pr27-disputes";
import { ProductPr27ServiceError } from "@/lib/trust/product-pr27-service";

const evidenceSchema = z.object({
  evidenceType: z.enum(["image", "document", "message", "receipt", "timeline_note"]),
  storageReference: z.string().trim().min(3).optional(),
  statement: z.string().trim().min(3).max(4000).optional()
}).refine(
  (value) => Boolean(value.storageReference || value.statement),
  "Evidence needs a file reference or a statement."
);

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid evidence." }, { status: 400 });
  }
  if (error instanceof ProductPr27ServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "Dispute review failed." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ disputeId: string }> }
) {
  try {
    const [{ user }, { disputeId }] = await Promise.all([
      getCurrentUserFromServer(),
      context.params
    ]);
    return NextResponse.json(await getPr27DisputeCase(user, disputeId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ disputeId: string }> }
) {
  try {
    const [{ user }, { disputeId }, input] = await Promise.all([
      getCurrentUserFromServer(),
      context.params,
      request.json().then((body) => evidenceSchema.parse(body))
    ]);
    return NextResponse.json({
      evidence: await addPr27DisputeEvidence(user, disputeId, input)
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
