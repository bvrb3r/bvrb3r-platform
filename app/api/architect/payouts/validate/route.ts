import { NextRequest, NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { FintechServiceError, validateFreelancePayoutReleaseEligibility } from "@/lib/fintech/service";

function toPayoutValidationError(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to validate this freelance payout.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const body = await request.json().catch(() => ({})) as { routingRecordId?: unknown };
    const routingRecordId = typeof body.routingRecordId === "string" ? body.routingRecordId.trim() : "";
    if (!routingRecordId) {
      return NextResponse.json({ error: "routingRecordId is required." }, { status: 400 });
    }

    return NextResponse.json(await validateFreelancePayoutReleaseEligibility(routingRecordId));
  } catch (error) {
    return toPayoutValidationError(error);
  }
}
