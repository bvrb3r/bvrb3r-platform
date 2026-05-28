import { NextRequest, NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { FintechServiceError, releaseReadyFreelancePayoutBatch } from "@/lib/fintech/service";

function toPayoutBatchReleaseError(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to release ready freelance payouts.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const body = await request.json().catch(() => ({})) as { scope?: unknown; mode?: unknown };
    if (body.scope !== "freelance" || body.mode !== "ready_only") {
      return NextResponse.json({ error: "scope freelance and mode ready_only are required." }, { status: 400 });
    }

    const payload = await releaseReadyFreelancePayoutBatch({
      requestedByProfileId: access.actor.id,
      scope: "freelance",
      mode: "ready_only"
    });

    return NextResponse.json(payload, { status: payload.ok || payload.errorCode ? 200 : 409 });
  } catch (error) {
    return toPayoutBatchReleaseError(error);
  }
}
