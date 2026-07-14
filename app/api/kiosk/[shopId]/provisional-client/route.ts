import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PriorityOneActivationError,
  createPriorityOneProvisionalClient,
} from "@/lib/kiosk/priority1-provisional";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(180),
  preferredChannel: z.enum(["sms", "email"]),
  transactionalSmsConsent: z.boolean(),
  transactionalEmailConsent: z.boolean(),
  marketingConsent: z.boolean().default(false),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  bookingPolicyAccepted: z.literal(true),
  termsVersion: z.string().trim().max(80).optional(),
  privacyVersion: z.string().trim().max(80).optional(),
  shopPolicyVersion: z.string().trim().max(80).optional(),
  sourceAttribution: z.record(z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(16).max(200),
  guestVisitId: z.string().uuid().nullish(),
  clientBridgeInvitationId: z.string().uuid().nullish(),
});

function respond(error: unknown) {
  if (error instanceof PriorityOneActivationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "Unable to create the account shell.", code: "provisional_client_failed" },
    { status: 500 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Complete name, contact, required legal choices, and activation delivery preferences.",
          code: "provisional_client_invalid",
        },
        { status: 400 },
      );
    }
    const result = await createPriorityOneProvisionalClient({
      shopId,
      ...parsed.data,
    });
    return NextResponse.json(result, {
      status: result.status === "possible_duplicate" ? 409 : 201,
    });
  } catch (error) {
    return respond(error);
  }
}
