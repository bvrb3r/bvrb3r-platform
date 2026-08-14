import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTrustActor } from "@/lib/trust/auth";
import { getBarberTrustSummary, TrustValidationError } from "@/lib/trust/engine";
import { trustErrorResponse } from "@/lib/trust/http";
import { getTrustProvider } from "@/lib/trust/provider";
import {
  serializeBarberVerificationForSubject,
  serializeVerificationDocumentForSubject
} from "@/lib/trust/serialization";

const verificationSchema = z.object({
  category: z.enum([
    "identity_verification",
    "license_verification",
    "payout_verification",
    "shop_affiliation_verification"
  ]),
  legalName: z.string().min(1),
  licenseType: z.string().optional(),
  licenseNumber: z.string().optional(),
  issuingState: z.string().optional(),
  expirationDate: z.string().optional(),
  uploadId: z.string().trim().min(1).optional()
}).superRefine((input, context) => {
  if (input.category === "license_verification" && !input.uploadId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["uploadId"],
      message: "A securely uploaded license document is required."
    });
  }
});

export async function GET() {
  try {
    const actor = await requireTrustActor(["barber_user"]);
    if (!actor.barberId) {
      throw new TrustValidationError("A barber profile is required for trust verification.");
    }

    const trustProvider = await getTrustProvider();
    const state = await trustProvider.readState();
    return NextResponse.json({ summary: getBarberTrustSummary(state, actor.barberId) });
  } catch (error) {
    return trustErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireTrustActor(["barber_user"]);
    const payload = verificationSchema.parse(await request.json());
    const trustProvider = await getTrustProvider();
    const result = await trustProvider.submitBarberVerification(actor, payload);

    return NextResponse.json({
      verification: serializeBarberVerificationForSubject(result.verification),
      document: result.document ? serializeVerificationDocumentForSubject(result.document) : null
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
    }

    return trustErrorResponse(error);
  }
}
