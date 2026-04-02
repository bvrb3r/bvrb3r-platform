import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { executeFintechPayouts, FintechServiceError } from "@/lib/fintech/service";

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to execute payout transfers.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await request.json().catch(() => ({})) as { mode?: unknown; speed?: unknown };
    const mode = body.mode;
    const speed = body.speed;

    if (!(mode === undefined || mode === "ready" || mode === "retry_failed")) {
      return NextResponse.json({ error: "mode must be 'ready' or 'retry_failed'." }, { status: 400 });
    }
    if (!(speed === undefined || speed === "standard" || speed === "instant")) {
      return NextResponse.json({ error: "speed must be 'standard' or 'instant'." }, { status: 400 });
    }

    const normalizedMode = mode === "retry_failed" ? "retry_failed" : "ready";
    const normalizedSpeed = speed === "instant" ? "instant" : "standard";

    const payload = await executeFintechPayouts(user, {
      mode: normalizedMode,
      speed: normalizedSpeed
    });
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
