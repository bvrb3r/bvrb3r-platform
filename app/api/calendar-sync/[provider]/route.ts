import { NextResponse } from "next/server";
import { z } from "zod";
import { CalendarSyncError, type CalendarProvider } from "@/lib/calendar-sync/domain";
import { getCalendarBarberUser } from "@/lib/calendar-sync/route-auth";
import {
  disconnectCalendar,
  getCalendarConnectionState,
  ingestAppleBusyWindows,
  regenerateAppleCalendarFeed,
  setCalendarSourcePreference
} from "@/lib/calendar-sync/service";
import {
  getSquareMappingOptionsForUser,
  saveSquareMappingForUser,
  syncCalendarNowForUser
} from "@/lib/calendar-sync/worker";

const providerSchema = z.enum(["square", "apple", "google"]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync_now") }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
  z.object({ action: z.literal("regenerate_feed") }).strict(),
  z.object({ action: z.literal("square_mapping_options") }).strict(),
  z.object({
    action: z.literal("square_mapping_save"),
    locationId: z.string().uuid(),
    teamMemberId: z.string().trim().min(1).max(255)
  }).strict(),
  z.object({
    action: z.literal("source_preference"),
    calendarIdHash: z.string().regex(/^[0-9a-f]{64}$/),
    calendarId: z.string().min(1).max(1024).optional(),
    name: z.string().trim().min(1).max(120),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
    blocking: z.boolean()
  }).strict(),
  z.object({
    action: z.literal("ingest_busy"),
    calendarIdHash: z.string().regex(/^[0-9a-f]{64}$/),
    calendarName: z.string().trim().min(1).max(120),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
    blocks: z.array(z.object({
      externalIdHash: z.string().regex(/^[0-9a-f]{64}$/),
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }),
      originTag: z.string().max(200).optional()
    }).strict()).max(500)
  }).strict()
]);

function errorResponse(error: unknown) {
  if (error instanceof CalendarSyncError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "Calendar sync request failed.", code: "calendar_sync_failed" }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    const parsedProvider = providerSchema.safeParse((await context.params).provider);
    if (!parsedProvider.success) {
      return NextResponse.json({ error: "Unknown calendar provider." }, { status: 404 });
    }
    const user = await getCalendarBarberUser();
    return NextResponse.json(await getCalendarConnectionState(user, parsedProvider.data), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    const parsedProvider = providerSchema.safeParse((await context.params).provider);
    if (!parsedProvider.success) {
      return NextResponse.json({ error: "Unknown calendar provider." }, { status: 404 });
    }
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid calendar sync request." }, { status: 400 });
    }
    const provider = parsedProvider.data as CalendarProvider;
    const user = await getCalendarBarberUser();
    if (parsed.data.action === "sync_now") {
      if (provider === "apple") {
        return NextResponse.json({ error: "Apple busy windows sync from the device; the private feed updates when Apple refreshes it." }, { status: 409 });
      }
      return NextResponse.json(await syncCalendarNowForUser(user, provider));
    }
    if (parsed.data.action === "disconnect") {
      await disconnectCalendar(user, provider);
      return NextResponse.json({ disconnected: true });
    }
    if (parsed.data.action === "regenerate_feed") {
      if (provider !== "apple") {
        return NextResponse.json({ error: "Private feeds are available only for Apple Calendar." }, { status: 400 });
      }
      return NextResponse.json(await regenerateAppleCalendarFeed(user), { status: 201 });
    }
    if (parsed.data.action === "square_mapping_options") {
      if (provider !== "square") {
        return NextResponse.json({ error: "Square mapping is available only for Square Calendar." }, { status: 400 });
      }
      return NextResponse.json(await getSquareMappingOptionsForUser(user), {
        headers: { "Cache-Control": "private, no-store" }
      });
    }
    if (parsed.data.action === "square_mapping_save") {
      if (provider !== "square") {
        return NextResponse.json({ error: "Square mapping is available only for Square Calendar." }, { status: 400 });
      }
      return NextResponse.json(await saveSquareMappingForUser({
        user,
        locationId: parsed.data.locationId,
        teamMemberId: parsed.data.teamMemberId
      }));
    }
    if (parsed.data.action === "source_preference") {
      if (provider === "square") {
        return NextResponse.json({ error: "Square appointments are always busy-blocking and read-only." }, { status: 400 });
      }
      await setCalendarSourcePreference({
        user,
        provider,
        calendarIdHash: parsed.data.calendarIdHash,
        calendarId: parsed.data.calendarId,
        name: parsed.data.name,
        color: parsed.data.color,
        blocking: parsed.data.blocking
      });
      return NextResponse.json({ saved: true });
    }
    if (provider !== "apple") {
      return NextResponse.json({ error: "Busy-window device ingestion is available only for Apple Calendar." }, { status: 400 });
    }
    return NextResponse.json(await ingestAppleBusyWindows({
      user,
      calendarIdHash: parsed.data.calendarIdHash,
      calendarName: parsed.data.calendarName,
      color: parsed.data.color,
      blocks: parsed.data.blocks
    }), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
