import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberTerminalError, createBarberTerminalConnectionToken } from "@/lib/barber/stripe-terminal";

export async function POST() {
  try {
    const user = await getSessionUser();
    return NextResponse.json(await createBarberTerminalConnectionToken(user));
  } catch (error) {
    if (error instanceof BarberTerminalError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "Unable to initialize Tap to Pay.", code: "terminal_connection_failed" }, { status: 500 });
  }
}