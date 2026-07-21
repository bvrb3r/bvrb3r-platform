import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PriorityOneCheckInError,
  secureCheckInKioskAppointment,
} from "@/lib/kiosk/priority1-checkin";
import { PriorityOneActivationError } from "@/lib/kiosk/priority1-provisional";
import { PriorityOneIdentityError } from "@/lib/kiosk/priority1-identity";

const schema = z
  .object({
    appointmentId: z.string().uuid(),
    appointmentKind: z.enum(["native", "external"]),
    continueAs: z.enum(["guest", "verified_client", "join_bvrb3r"]),
    verificationToken: z.string().trim().min(20).max(256).optional(),
    fullName: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().email().max(180).optional().or(z.literal("")),
    preferredChannel: z.enum(["sms", "email"]).optional(),
    transactionalSmsConsent: z.boolean().default(false),
    transactionalEmailConsent: z.boolean().default(false),
    marketingConsent: z.boolean().default(false),
    termsAccepted: z.boolean().default(false),
    privacyAccepted: z.boolean().default(false),
    bookingPolicyAccepted: z.boolean().default(false),
    termsVersion: z.string().trim().max(80).optional(),
    privacyVersion: z.string().trim().max(80).optional(),
    shopPolicyVersion: z.string().trim().max(80).optional(),
    idempotencyKey: z.string().trim().min(16).max(200),
  })
  .superRefine((value, context) => {
    if (value.continueAs === "verified_client" && !value.verificationToken) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verificationToken"],
        message: "Verify the BVRB3R account by phone or email first.",
      });
    }
    if (!value.transactionalSmsConsent && !value.transactionalEmailConsent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transactionalSmsConsent"],
        message: "Choose SMS, email, or both for operational queue updates.",
      });
    }
    if (value.continueAs === "join_bvrb3r") {
      if (!value.fullName || !value.phone || !value.email) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fullName"],
          message: "Name, phone, and email are required to start an account.",
        });
      }
      if (!value.termsAccepted || !value.privacyAccepted || !value.bookingPolicyAccepted) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["termsAccepted"],
          message: "Terms, Privacy, and the booking policy must each be accepted.",
        });
      }
    }
  });

function respond(error: unknown) {
  if (
    error instanceof PriorityOneCheckInError ||
    error instanceof PriorityOneIdentityError ||
    error instanceof PriorityOneActivationError
  ) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "Unable to check in this appointment.", code: "check_in_failed" },
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
          error: "The check-in information is incomplete.",
          code: "invalid_check_in_payload",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await secureCheckInKioskAppointment(shopId, {
        ...parsed.data,
        email: parsed.data.email || undefined,
      }),
      { status: 201 },
    );
  } catch (error) {
    return respond(error);
  }
}
