import { NextResponse } from "next/server";
import { z } from "zod";
import { CalendarSyncError } from "@/lib/calendar-sync/domain";
import { getCalendarBarberUser } from "@/lib/calendar-sync/route-auth";
import { completeCalendarOAuth } from "@/lib/calendar-sync/service";

const providerSchema = z.enum(["square", "google"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const requestUrl = new URL(request.url);
  const provider = providerSchema.safeParse((await context.params).provider);
  if (!provider.success) {
    return NextResponse.json({ error: "Unknown calendar provider." }, { status: 404 });
  }
  const fallbackPath = `/dashboard/barber/calendar/${provider.data}`;
  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(new URL(`${fallbackPath}?connection=denied`, requestUrl.origin));
  }
  const parsed = z.object({
    code: z.string().min(2).max(2048),
    state: z.string().min(32).max(256)
  }).safeParse({
    code: requestUrl.searchParams.get("code"),
    state: requestUrl.searchParams.get("state")
  });
  if (!parsed.success) {
    return NextResponse.redirect(new URL(`${fallbackPath}?connection=invalid`, requestUrl.origin));
  }
  try {
    const user = await getCalendarBarberUser();
    const result = await completeCalendarOAuth({
      user,
      provider: provider.data,
      code: parsed.data.code,
      state: parsed.data.state
    });
    return NextResponse.redirect(new URL(`${result.returnPath}?connection=connected`, requestUrl.origin));
  } catch (error) {
    const code = error instanceof CalendarSyncError ? error.code : "calendar_oauth_failed";
    return NextResponse.redirect(new URL(`${fallbackPath}?connection=${encodeURIComponent(code)}`, requestUrl.origin));
  }
}
