import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { previewPromotionApplication, PromotionServiceError } from "@/lib/promotions/service";

const applyPromotionSchema = z.object({
  shopId: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  addOnIds: z.array(z.string().trim()).default([]),
  barberId: z.string().trim().optional(),
  appointmentTime: z.string().trim().optional(),
  promotionId: z.string().trim().optional(),
  promotionCode: z.string().trim().optional()
});

function toErrorResponse(error: unknown) {
  if (error instanceof PromotionServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to apply the promotion.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const context = await getClientExperienceContext();
    const parsed = applyPromotionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid promotion application payload." }, { status: 400 });
    }

    const payload = await previewPromotionApplication({
      clientId: context.clientId || undefined,
      ...parsed.data
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
