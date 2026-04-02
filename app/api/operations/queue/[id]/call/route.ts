import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { callQueueEntry, QueueServiceError } from "@/lib/queue/service";

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof QueueServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Queue entry id is required." }, { status: 400 });
    }

    const result = await callQueueEntry(user, id);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "Unable to call the queue entry.");
  }
}
