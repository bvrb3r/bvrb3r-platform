import { NextRequest, NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { approveFreelancePayoutReadinessForRouting, FintechServiceError } from "@/lib/fintech/service";

function toPayoutApprovalError(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to approve this payout setup.";
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

    const payload = await approveFreelancePayoutReadinessForRouting({
      routingRecordId,
      approvedByProfileId: access.actor.id
    });

    return NextResponse.json(payload, { status: payload.ok ? 200 : 409 });
  } catch (error) {
    return toPayoutApprovalError(error);
  }
}
