import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { cancelQueueEntry, QueueServiceError } from "@/lib/queue/service";

const cancelSchema = z.object({
  reason: z.string().trim().max(240).optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof QueueServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Queue entry id is required." }, { status: 400 });
    }

    const parsed = cancelSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid queue cancellation payload." }, { status: 400 });
    }

    const result = await cancelQueueEntry(user, {
      entryId: id,
      reason: parsed.data.reason
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "Unable to cancel the queue entry.");
  }
}
