import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { FintechServiceError } from "@/lib/fintech/service";

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to access connected-account status.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  _request: Request,
  _context: { params: Promise<{ id: string }> }
) {
  void _request;
  void _context;

  try {
    await getSessionUser();
    return NextResponse.json({
      error: "Stripe connected-account status is read-only. Use Stripe onboarding or refresh the Stripe status."
    }, { status: 409 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
