import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import {
  joinPr36PrelaunchWaitlist,
  Pr36PrelaunchServiceError,
  withdrawPr36PrelaunchWaitlist
} from "@/lib/shops/pr36-prelaunch-service";

function errorResponse(error: unknown) {
  const known = error instanceof Pr36PrelaunchServiceError ? error : null;
  return NextResponse.json({
    error: known?.message ?? "The opening waitlist could not complete that request.",
    code: known?.code ?? "waitlist_request_failed"
  }, {
    status: known?.status ?? 500,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ shop: string }> }) {
  try {
    const [{ shop }, session, body] = await Promise.all([
      params,
      getCurrentUserFromServer(),
      request.json().catch(() => ({})) as Promise<{ email?: string | null; phone?: string | null; consent?: unknown }>
    ]);
    const waitlist = await joinPr36PrelaunchWaitlist({
      slug: shop,
      user: session.authenticated && session.user.id !== "guest-user" ? session.user : null,
      email: body.email,
      phone: body.phone,
      consent: body.consent,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return NextResponse.json({ ok: true, waitlist }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ shop: string }> }) {
  try {
    const [{ shop }, session, body] = await Promise.all([
      params,
      getCurrentUserFromServer(),
      request.json().catch(() => ({})) as Promise<{ email?: string | null; phone?: string | null }>
    ]);
    const withdrawal = await withdrawPr36PrelaunchWaitlist({
      slug: shop,
      user: session.authenticated && session.user.id !== "guest-user" ? session.user : null,
      email: body.email,
      phone: body.phone,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return NextResponse.json({ ok: true, withdrawal }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
