import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PriorityOneIdentityError,
  startPriorityOneIdentityChallenge,
} from "@/lib/kiosk/priority1-identity";

const schema = z.object({
  candidateToken: z.string().trim().min(20).max(256),
  channel: z.enum(["sms", "email"]),
});

function respond(error: unknown) {
  if (error instanceof PriorityOneIdentityError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "Unable to send the verification code.", code: "identity_challenge_failed" },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Choose a valid verification channel.", code: "identity_challenge_invalid" },
        { status: 400 },
      );
    }
    return NextResponse.json(await startPriorityOneIdentityChallenge(parsed.data), {
      status: 201,
    });
  } catch (error) {
    return respond(error);
  }
}
