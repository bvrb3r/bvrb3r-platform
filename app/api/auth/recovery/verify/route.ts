import { NextResponse } from "next/server";
import { z } from "zod";
import {
  RecoveryChallengeError,
  verifyRecoveryChallenge
} from "@/lib/auth/recovery-challenge";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";

const verifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/)
});

export async function POST(request: Request) {
  const limit = consumeRateLimit({
    bucket: "account-recovery-verify",
    key: clientKeyFromRequest(request),
    limit: 25,
    windowMs: 15 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json({
      error: "Too many code attempts. Try again shortly.",
      code: "rate_limited",
      retryAfterSeconds: limit.retryAfterSeconds
    }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) }
    });
  }

  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "Enter the complete six-digit code.",
      code: "invalid_code"
    }, { status: 400 });
  }
  try {
    return NextResponse.json(await verifyRecoveryChallenge(parsed.data), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    if (error instanceof RecoveryChallengeError) {
      return NextResponse.json({
        error: error.message,
        code: error.code
      }, { status: error.status });
    }
    return NextResponse.json({
      error: "Account recovery is temporarily unavailable.",
      code: "recovery_unavailable"
    }, { status: 503 });
  }
}
