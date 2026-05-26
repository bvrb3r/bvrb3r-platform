import { NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { FintechServiceError, listArchitectFreelancePayoutQueue } from "@/lib/fintech/service";

function toPayoutQueueError(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load the freelance payout queue.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(await listArchitectFreelancePayoutQueue());
  } catch (error) {
    return toPayoutQueueError(error);
  }
}
