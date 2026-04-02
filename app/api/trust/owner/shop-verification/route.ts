import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTrustActor } from "@/lib/trust/auth";
import { trustErrorResponse } from "@/lib/trust/http";
import { getTrustProvider } from "@/lib/trust/provider";
import {
  serializeShopVerificationForSubject,
  serializeVerificationDocumentForSubject
} from "@/lib/trust/serialization";

const verificationSchema = z.object({
  shopId: z.string().min(1),
  category: z.enum(["business_verification", "ownership_verification"]),
  businessName: z.string().min(2),
  documentPath: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const actor = await requireTrustActor(["owner"]);
    const payload = verificationSchema.parse(await request.json());
    const trustProvider = await getTrustProvider();
    const result = await trustProvider.submitShopVerification(actor, payload);
    return NextResponse.json({
      verification: serializeShopVerificationForSubject(result.verification),
      document: result.document ? serializeVerificationDocumentForSubject(result.document) : null
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid shop verification payload." }, { status: 400 });
    }

    return trustErrorResponse(error);
  }
}
