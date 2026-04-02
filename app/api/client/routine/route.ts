import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { saveClientRoutine } from "@/lib/booking/platform-service";

const routineSchema = z.object({
  cadenceId: z.enum(["weekly", "biweekly", "monthly"]),
  barberReference: z.string().min(1).optional(),
  serviceReference: z.string().min(1).optional(),
  anchorStartAt: z.string().datetime().optional(),
  lastCompletedAt: z.string().datetime().optional()
});

export async function POST(request: Request) {
  const context = await getClientExperienceContext();

  if (!context.clientId) {
    return NextResponse.json({ error: "No client context is available for auto-book." }, { status: 403 });
  }

  const parsed = routineSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid auto-book payload." }, { status: 400 });
  }

  try {
    const routine = await saveClientRoutine({
      clientId: context.clientId,
      cadenceId: parsed.data.cadenceId,
      barberReference: parsed.data.barberReference,
      serviceReference: parsed.data.serviceReference,
      anchorStartAt: parsed.data.anchorStartAt,
      lastCompletedAt: parsed.data.lastCompletedAt
    });

    return NextResponse.json({ routine });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save auto-book routine.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
