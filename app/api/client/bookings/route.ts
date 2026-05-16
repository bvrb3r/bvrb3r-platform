import { NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { getClientBookingsPayload } from "@/lib/booking/platform-service";

export async function GET() {
  const context = await getClientExperienceContext();

  if (!context.clientId) {
    return NextResponse.json({ error: "No client context is available for client bookings." }, { status: 403 });
  }

  try {
    const payload = await getClientBookingsPayload(context.clientId);
    return NextResponse.json(payload);
  } catch (error) {
    const details = error && typeof error === "object"
      ? error as { code?: string | null; message?: string | null; table?: string | null; column?: string | null }
      : null;
    console.error("[client-activity] appointment_read_failed", {
      reference: "appointment_read_failed",
      errorName: error instanceof Error ? error.name : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      postgresCode: details?.code ?? null,
      table: details?.table ?? null,
      column: details?.column ?? null,
      clientId: context.clientId
    });
    return NextResponse.json({ error: "Unable to load your appointments right now." }, { status: 500 });
  }
}
