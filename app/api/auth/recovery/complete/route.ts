import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completeRecoveryChallenge,
  RecoveryChallengeError
} from "@/lib/auth/recovery-challenge";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";

const completeSchema = z.object({
  challengeId: z.string().uuid(),
  resetToken: z.string().min(32).max(200),
  newPassword: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  const limit = consumeRateLimit({
    bucket: "account-recovery-complete",
    key: clientKeyFromRequest(request),
    limit: 10,
    windowMs: 15 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json({
      error: "Too many reset attempts. Try again shortly.",
      code: "rate_limited",
      retryAfterSeconds: limit.retryAfterSeconds
    }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) }
    });
  }

  const parsed = completeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "Enter a password of at least 8 characters.",
      code: "weak_password"
    }, { status: 400 });
  }
  try {
    return NextResponse.json(await completeRecoveryChallenge(parsed.data), {
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
