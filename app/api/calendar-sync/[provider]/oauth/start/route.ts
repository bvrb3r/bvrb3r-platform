import { NextResponse } from "next/server";
import { z } from "zod";
import { CalendarSyncError } from "@/lib/calendar-sync/domain";
import { getCalendarBarberUser } from "@/lib/calendar-sync/route-auth";
import { startCalendarOAuth } from "@/lib/calendar-sync/service";

const providerSchema = z.enum(["square", "google"]);

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    const provider = providerSchema.safeParse((await context.params).provider);
    if (!provider.success) {
      return NextResponse.json({ error: "OAuth is unavailable for this calendar provider." }, { status: 404 });
    }
    const user = await getCalendarBarberUser();
    return NextResponse.json(await startCalendarOAuth(user, provider.data), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    if (error instanceof CalendarSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to start calendar authorization." }, { status: 500 });
  }
}
