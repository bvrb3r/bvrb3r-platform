import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";

const schema = z.object({
  operatingModel: z.string().trim().min(2),
  walkInsEnabled: z.boolean().optional().default(true),
  defaultServiceCategory: z.string().trim().min(2)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Shop structure details are required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "shop_owner", "owner_structure", parsed.data);
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: "/onboarding/owner/team"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

