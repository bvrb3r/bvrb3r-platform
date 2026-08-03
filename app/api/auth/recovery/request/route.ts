import { NextResponse } from "next/server";
import { z } from "zod";
import {
  RecoveryChallengeError,
  requestRecoveryChallenge
} from "@/lib/auth/recovery-challenge";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";

const requestSchema = z.object({
  channel: z.enum(["email", "sms"]),
  destination: z.string().trim().min(3).max(320)
});

function recoveryError(error: unknown) {
  if (error instanceof RecoveryChallengeError) {
    return NextResponse.json({
      error: error.message,
      code: error.code,
      retryAfterSeconds: error.retryAfterSeconds
    }, {
      status: error.status,
      headers: error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : undefined
    });
  }
  return NextResponse.json({
    error: "Account recovery is temporarily unavailable.",
    code: "recovery_unavailable"
  }, { status: 503 });
}

export async function POST(request: Request) {
  const source = clientKeyFromRequest(request);
  const edgeLimit = consumeRateLimit({
    bucket: "account-recovery-request",
    key: source,
    limit: 10,
    windowMs: 15 * 60 * 1000
  });
  if (!edgeLimit.allowed) {
    return NextResponse.json({
      error: "Too many recovery requests. Try again shortly.",
      code: "rate_limited",
      retryAfterSeconds: edgeLimit.retryAfterSeconds
    }, {
      status: 429,
      headers: { "Retry-After": String(edgeLimit.retryAfterSeconds) }
    });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "Choose email or SMS and enter a valid destination.",
      code: "invalid_destination"
    }, { status: 400 });
  }

  try {
    return NextResponse.json(await requestRecoveryChallenge({
      ...parsed.data,
      requestSource: source
    }), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return recoveryError(error);
  }
}
