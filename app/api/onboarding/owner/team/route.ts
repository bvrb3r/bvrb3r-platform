import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";

const schema = z.object({
  inviteEmails: z.string().trim().optional().default("")
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Team setup could not be saved." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "shop_owner", "owner_team", parsed.data);
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: "/onboarding/owner/verification"
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}
