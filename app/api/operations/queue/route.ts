import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { createQueueEntry, getQueueWorkspacePayload, QueueServiceError } from "@/lib/queue/service";

const createQueueSchema = z.object({
  clientId: z.string().trim().optional(),
  clientName: z.string().trim().min(2),
  clientPhone: z.string().trim().min(7),
  clientEmail: z.string().trim().email().optional(),
  shopId: z.string().trim().min(1),
  serviceId: z.string().trim().optional(),
  preferredBarberId: z.string().trim().optional(),
  preferredDate: z.string().trim().optional(),
  preferredStartTime: z.string().trim().optional(),
  preferredEndTime: z.string().trim().optional(),
  flexibilityMinutes: z.number().int().min(0).max(480).optional(),
  queueSource: z.enum(["walk_in", "cancellation_fill", "manual", "app", "kiosk"]).optional(),
  notes: z.string().trim().max(500).optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof QueueServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await getQueueWorkspacePayload(user);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load the walk-in queue.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = createQueueSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid queue entry payload." }, { status: 400 });
    }

    const result = await createQueueEntry(user, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Unable to create the queue entry.");
  }
}
