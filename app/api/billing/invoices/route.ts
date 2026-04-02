import { NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { MonetizationServiceError, readClientBillingInvoices } from "@/lib/monetization/service";

function toErrorResponse(error: unknown) {
  if (error instanceof MonetizationServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load billing invoices.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const context = await getClientExperienceContext();
  if (!context.isSignedInClient || context.viewer.role !== "client") {
    return NextResponse.json({ error: "Only signed-in clients can view billing invoices." }, { status: 403 });
  }

  try {
    const invoices = await readClientBillingInvoices({
      user: context.viewer
    });
    return NextResponse.json({ invoices });
  } catch (error) {
    return toErrorResponse(error);
  }
}
