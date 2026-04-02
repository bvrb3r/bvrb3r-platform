import { NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { MonetizationServiceError, readClientBillingHistory } from "@/lib/monetization/service";

function toErrorResponse(error: unknown) {
  if (error instanceof MonetizationServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load billing history.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const context = await getClientExperienceContext();
  if (!context.isSignedInClient || context.viewer.role !== "client") {
    return NextResponse.json({ error: "Only signed-in clients can view billing history." }, { status: 403 });
  }

  try {
    const billing = await readClientBillingHistory({
      user: context.viewer
    });
    return NextResponse.json({ billing });
  } catch (error) {
    return toErrorResponse(error);
  }
}
