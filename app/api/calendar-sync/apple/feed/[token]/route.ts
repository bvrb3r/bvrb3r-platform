import { NextResponse } from "next/server";
import { CalendarSyncError } from "@/lib/calendar-sync/domain";
import { readAppleCalendarFeed } from "@/lib/calendar-sync/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const value = (await context.params).token.replace(/\.ics$/i, "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    return NextResponse.json({ error: "Calendar feed not found." }, { status: 404 });
  }
  try {
    const feed = await readAppleCalendarFeed(value);
    return new NextResponse(feed, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=private-bvrb3r-calendar.ics",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof CalendarSyncError && error.status === 404) {
      return NextResponse.json({ error: "Calendar feed not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Calendar feed is temporarily unavailable." }, { status: 503 });
  }
}
