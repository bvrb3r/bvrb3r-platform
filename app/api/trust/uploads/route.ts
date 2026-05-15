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
  fileName: z.string().min(3),
  contentType: z.string().min(3),
  fileSizeBytes: z.number().int().positive(),
  expiresAt: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const actor = await requireTrustActor(["shop_owner_user", "barber_user"]);
    const payload = uploadSchema.parse(await request.json());
    const provider = await getMarketplaceActivationProvider();
    const result = await provider.createVerificationUpload(actor, payload);
    return NextResponse.json({ upload: serializeVerificationUpload(result.upload) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid verification upload payload." }, { status: 400 });
    }

    return trustErrorResponse(error);
  }
}

