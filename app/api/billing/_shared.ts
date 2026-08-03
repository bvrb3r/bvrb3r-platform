import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { Pr34BillingServiceError } from "@/lib/billing/pr34-service";

export async function requireBillingSession() {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    throw new Pr34BillingServiceError("A signed-in account is required for billing.", 401, "billing_auth_required");
  }
  return session.user;
}

export function billingErrorResponse(error: unknown) {
  if (error instanceof Pr34BillingServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  return NextResponse.json(
    { error: "Billing could not complete that request.", code: "billing_request_failed" },
    { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}

export function billingJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
