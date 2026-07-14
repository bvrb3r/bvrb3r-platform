import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PriorityOneIdentityError,
  verifyPriorityOneIdentityChallenge,
} from "@/lib/kiosk/priority1-identity";

const schema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
});

function respond(error: unknown) {
  if (error instanceof PriorityOneIdentityError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "Unable to verify this Client account.", code: "identity_verify_failed" },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter the six-digit verification code.", code: "identity_code_invalid" },
        { status: 400 },
      );
    }
    return NextResponse.json(await verifyPriorityOneIdentityChallenge(parsed.data));
  } catch (error) {
    return respond(error);
  }
}
