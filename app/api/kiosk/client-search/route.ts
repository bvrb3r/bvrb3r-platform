import { NextResponse } from "next/server";
import { searchKioskClientProfiles, KioskClientCaptureError } from "@/lib/kiosk/client-capture";
import { isKioskFixtureEnabled, searchKioskFixtureClients } from "@/lib/kiosk/local-fixture";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import { KioskSessionError, assertAnyActiveKioskDeviceSession, readKioskSessionToken } from "@/lib/kiosk/session-service";

export async function GET(request: Request) {
  try {
    const rate = consumeRateLimit({ bucket: "kiosk-client-search", key: clientKeyFromRequest(request), limit: 30, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many kiosk searches. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    }

    const query = new URL(request.url).searchParams.get("q") ?? "";

    // The seeded local fixture has no device session and no Supabase profiles,
    // so returning-client lookup is served from memory when it is enabled.
    if (isKioskFixtureEnabled()) {
      return NextResponse.json({ results: searchKioskFixtureClients(query) });
    }

    await assertAnyActiveKioskDeviceSession(readKioskSessionToken(request));

    const results = await searchKioskClientProfiles(query);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof KioskClientCaptureError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof KioskSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to search kiosk client profiles." }, { status: 500 });
  }
}
