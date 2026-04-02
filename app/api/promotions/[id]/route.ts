import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { PromotionServiceError, updatePromotion } from "@/lib/promotions/service";

const updatePromotionSchema = z.object({
  shopId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2).optional(),
  code: z.string().trim().optional(),
  description: z.string().trim().max(280).optional(),
  promotionType: z.enum(["code", "automatic", "featured"]).optional(),
  discountType: z.enum(["percent", "fixed_amount"]).optional(),
  discountValue: z.coerce.number().positive().optional(),
  appliesToScope: z.enum(["booking", "service", "shop"]).optional(),
  serviceId: z.string().trim().optional(),
  barberId: z.string().trim().optional(),
  minSubtotal: z.coerce.number().min(0).optional(),
  maxDiscountAmount: z.coerce.number().min(0).optional(),
  usageLimit: z.coerce.number().int().min(1).optional(),
  startsAt: z.string().trim().min(1).optional(),
  endsAt: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof PromotionServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const { id } = await context.params;
    const parsed = updatePromotionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid promotion update payload." }, { status: 400 });
    }

    const result = await updatePromotion(user, id, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "Unable to update the promotion.");
  }
}
