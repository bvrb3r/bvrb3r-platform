import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { FintechServiceError, getBarberPayouts } from "@/lib/fintech/service";

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load barber payout execution visibility.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await getBarberPayouts(user);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
