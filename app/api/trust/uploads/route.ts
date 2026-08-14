import { NextResponse } from "next/server";
import { z } from "zod";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { requireTrustActor } from "@/lib/trust/auth";
import { trustErrorResponse } from "@/lib/trust/http";
import { serializeVerificationUpload } from "@/lib/trust/serialization";

const uploadSchema = z.object({
  ownerType: z.enum(["barber", "shop"]),
  ownerId: z.string().optional(),
  category: z.enum(["identity_verification", "license_verification", "payout_verification", "shop_affiliation_verification", "business_verification", "ownership_verification"]),
  fileName: z.string().trim().min(3).max(180),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  fileSizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  expiresAt: z.string().optional()
}).superRefine((input, context) => {
  const shopCategory = input.category === "business_verification" || input.category === "ownership_verification";
  if ((input.ownerType === "shop") !== shopCategory) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["category"],
      message: "Verification category does not match the owner type."
    });
  }
});

export async function POST(request: Request) {
  try {
    const actor = await requireTrustActor(["shop_owner_user", "barber_user"]);
    const payload = uploadSchema.parse(await request.json());
    const provider = await getMarketplaceActivationProvider();
    const result = await provider.createVerificationUpload(actor, payload);
    return NextResponse.json(
      { upload: serializeVerificationUpload(result.upload, result.signedUploadUrl) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid verification upload payload." }, { status: 400 });
    }

    return trustErrorResponse(error);
  }
}

