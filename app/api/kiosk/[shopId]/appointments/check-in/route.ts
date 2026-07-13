import { NextResponse } from "next/server";
import { z } from "zod";
import { checkInKioskAppointment, PriorityOneKioskError } from "@/lib/kiosk/priority1-service";

const checkInSchema = z.object({
  appointmentId: z.string().uuid(),
  appointmentKind: z.enum(["native", "external"]),
  continueAs: z.enum(["guest", "verified_client", "join_bvrb3r"]),
  selectedProfileId: z.string().uuid().optional(),
  fullName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  transactionalSmsConsent: z.boolean().optional(),
  transactionalEmailConsent: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  termsVersion: z.string().trim().optional(),
  privacyVersion: z.string().trim().optional(),
  shopPolicyVersion: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(12).max(200)
}).superRefine((value, context) => {
  if (value.continueAs === "verified_client" && !value.selectedProfileId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedProfileId"], message: "Verify the BVRB3R Client account before checking in." });
  }
  if (value.continueAs === "join_bvrb3r" && !value.phone && !value.email) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "A phone or email is required to send the private activation link." });
  }
});

function errorResponse(error: unknown) {
  if (error instanceof PriorityOneKioskError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check in this appointment." }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;
    const parsed = checkInSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "The check-in information is incomplete.", code: "invalid_check_in_payload" }, { status: 400 });
    }
    return NextResponse.json(await checkInKioskAppointment(shopId, {
      ...parsed.data,
      email: parsed.data.email || undefined
    }), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
