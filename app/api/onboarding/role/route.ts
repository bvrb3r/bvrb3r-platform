import { NextRequest, NextResponse } from "next/server";
import { onboardingRoleSchema, getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { initializeUserRole, resolvePostAuthDestination } from "@/lib/onboarding/service";

export async function POST(request: NextRequest) {
  try {
    const parsed = onboardingRoleSchema.safeParse((await request.json().catch(() => ({})))?.role);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid onboarding role is required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await initializeUserRole(user, parsed.data);
    const nextPath = await resolvePostAuthDestination({
      ...user,
      role: user.role
    });

    return NextResponse.json({
      lane: result.state,
      degraded: result.degraded,
      nextPath
    }, { status: 201 });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

