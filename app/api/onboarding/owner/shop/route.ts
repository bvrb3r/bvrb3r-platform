import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";

const schema = z.object({
  shopName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  address: z.string().trim().min(4),
  publicDescription: z.string().trim().min(8),
  hours: z.string().trim().min(2)
});

function createShopId(shopName: string) {
  return `shop-${shopName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 32) || "draft"}`;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Shop details are required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "shop_owner", "owner_shop", {
      ...parsed.data,
      shopId: createShopId(parsed.data.shopName)
    });
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: "/onboarding/owner/structure"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

