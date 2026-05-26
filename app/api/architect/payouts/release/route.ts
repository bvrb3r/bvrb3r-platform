import { NextRequest, NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { FintechServiceError, releaseFreelanceRoutingPayout } from "@/lib/fintech/service";

function toPayoutReleaseError(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to release this freelance payout.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const body = await request.json().catch(() => ({})) as { routingRecordId?: unknown; dryRun?: unknown };
    const routingRecordId = typeof body.routingRecordId === "string" ? body.routingRecordId.trim() : "";
    if (!routingRecordId) {
      return NextResponse.json({ error: "routingRecordId is required." }, { status: 400 });
    }

    const payload = await releaseFreelanceRoutingPayout({
      routingRecordId,
      requestedByProfileId: access.actor.id,
      dryRun: body.dryRun === true
    });

    return NextResponse.json(payload, { status: payload.ok || payload.failedStep ? 200 : 409 });
  } catch (error) {
    return toPayoutReleaseError(error);
  }
}
