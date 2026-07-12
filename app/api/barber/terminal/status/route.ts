import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberTerminalError, getBarberTerminalStatus } from "@/lib/barber/stripe-terminal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    const status = await getBarberTerminalStatus(user);
    return NextResponse.json(status, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof BarberTerminalError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "Unable to load Tap to Pay readiness.", code: "terminal_status_failed" }, { status: 500 });
  }
}