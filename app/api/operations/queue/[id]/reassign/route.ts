import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { QueueServiceError, reassignQueueEntry } from "@/lib/queue/service";

const reassignSchema = z.object({
  barberId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500)
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof QueueServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const { id } = await context.params;
    const parsed = reassignSchema.safeParse(await request.json().catch(() => null));
    if (!id || !parsed.success) {
      return NextResponse.json({ error: "A barber and reassignment reason are required." }, { status: 400 });
    }
    const result = await reassignQueueEntry(user, {
      entryId: id,
      barberId: parsed.data.barberId,
      reason: parsed.data.reason
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "Unable to reassign this queue entry.");
  }
}
