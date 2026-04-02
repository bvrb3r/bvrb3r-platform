import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { convertQueueEntry, QueueServiceError } from "@/lib/queue/service";

const convertSchema = z.object({
  barberId: z.string().trim().optional(),
  serviceId: z.string().trim().optional(),
  appointmentTime: z.string().trim().optional()
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

    const parsed = convertSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid queue conversion payload." }, { status: 400 });
    }

    const result = await convertQueueEntry(user, {
      entryId: id,
      barberId: parsed.data.barberId,
      serviceId: parsed.data.serviceId,
      appointmentTime: parsed.data.appointmentTime
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Unable to convert the queue entry.");
  }
}
