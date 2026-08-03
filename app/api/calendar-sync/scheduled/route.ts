import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processCalendarSyncSchedule } from "@/lib/calendar-sync/worker";

function authorized(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const secrets = [process.env.CALENDAR_SYNC_CRON_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  if (!secrets.length || !bearer) return false;
  const actual = Buffer.from(bearer);
  return secrets.some((secret) => {
    const expected = Buffer.from(secret);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json(await processCalendarSyncSchedule(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Calendar sync schedule failed." }, { status: 500 });
  }
}

export const GET = POST;
