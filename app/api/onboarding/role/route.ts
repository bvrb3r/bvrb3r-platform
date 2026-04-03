import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { initializeSelectedUserLane, resolvePostAuthDestination } from "@/lib/onboarding/service";

const schema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("client")
  }),
  z.object({
    role: z.literal("barber"),
    barberSubtype: z.enum(["freelance", "blueprint", "commission"])
  }),
  z.object({
    role: z.literal("shop_owner"),
    shopName: z.string().trim().min(2)
  })
]);

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid role selection is required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await initializeSelectedUserLane(user, parsed.data);
    const nextPath = await resolvePostAuthDestination(result.user);

    return NextResponse.json({
      lane: result.state,
      degraded: result.degraded,
      nextPath
    }, { status: 201 });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}
