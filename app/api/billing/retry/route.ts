import { NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { MonetizationServiceError, requestClientBillingRetry } from "@/lib/monetization/service";

function toErrorResponse(error: unknown) {
  if (error instanceof MonetizationServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to start billing retry.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST() {
  const context = await getClientExperienceContext();
  if (!context.isSignedInClient || context.viewer.role !== "client") {
    return NextResponse.json({ error: "Only signed-in clients can retry billing." }, { status: 403 });
  }

  try {
    const retry = await requestClientBillingRetry({
      user: context.viewer
    });
    return NextResponse.json({ retry });
  } catch (error) {
    return toErrorResponse(error);
  }
}
