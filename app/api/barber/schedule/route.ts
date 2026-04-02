import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberToolsServiceError, getBarberSchedulePayload, updateBarberSchedule } from "@/lib/barber/service";

const scheduleViewSchema = z.object({
  view: z.enum(["day", "week", "month"]).optional(),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const updateScheduleSchema = z.object({
  locationId: z.string().trim().min(1),
  workingHours: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().trim().regex(/^\d{2}:\d{2}$/)
  })).optional(),
  blockedPeriod: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().optional()
  }).optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof BarberToolsServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const parsed = scheduleViewSchema.safeParse({
      view: request.nextUrl.searchParams.get("view") ?? undefined,
      date: request.nextUrl.searchParams.get("date") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid barber schedule range." }, { status: 400 });
    }

    const payload = await getBarberSchedulePayload(user, {
      viewMode: parsed.data.view,
      anchorDate: parsed.data.date
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load barber schedule.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = updateScheduleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid barber schedule payload." }, { status: 400 });
    }

    const payload = await updateBarberSchedule(user, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to update barber schedule.");
  }
}
