import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { createPromotion, listPromotionsForManagement, PromotionServiceError } from "@/lib/promotions/service";

const promotionSchema = z.object({
  shopId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  code: z.string().trim().optional(),
  description: z.string().trim().max(280).optional(),
  promotionType: z.enum(["code", "automatic", "featured"]),
  discountType: z.enum(["percent", "fixed_amount"]),
  discountValue: z.coerce.number().positive(),
  appliesToScope: z.enum(["booking", "service", "shop"]),
  serviceId: z.string().trim().optional(),
  barberId: z.string().trim().optional(),
  minSubtotal: z.coerce.number().min(0).optional(),
  maxDiscountAmount: z.coerce.number().min(0).optional(),
  usageLimit: z.coerce.number().int().min(1).optional(),
  startsAt: z.string().trim().min(1),
  endsAt: z.string().trim().min(1),
  isActive: z.boolean().optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof PromotionServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await listPromotionsForManagement(user);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load the promotions workspace.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = promotionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid promotion payload." }, { status: 400 });
    }

    const result = await createPromotion(user, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Unable to create the promotion.");
  }
}
