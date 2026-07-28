import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import { normalizeBarberSubtype } from "@/lib/auth/roles";
import { initializeSelectedUserLane, resolvePostAuthDestination } from "@/lib/onboarding/service";

const schema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("client")
  }),
  z.object({
    role: z.literal("barber"),
    barberSubtype: z.enum(["freelance", "booth_rent", "blueprint", "autobooth_rent"]).transform(normalizeBarberSubtype).optional()
  }),
  z.object({
    role: z.literal("shop_owner"),
    shopName: z.string().trim().min(2)
  })
]);

export async function POST(request: NextRequest) {
  try {
    console.info("[onboarding-route] role launch route entry");
    const body = await request.json().catch(() => ({}));
    console.info("[onboarding-route] role launch request body", {
      body
    });
    const normalizedBody = typeof body === "object" && body !== null
      ? {
          ...body,
          shopName: (body as { shopName?: unknown; shop_name?: unknown }).shopName
            ?? (body as { shopName?: unknown; shop_name?: unknown }).shop_name
        }
      : body;
    const parsed = schema.safeParse(normalizedBody);
    if (!parsed.success) {
      console.info("[onboarding-route] role launch validation failed", {
        issues: parsed.error.issues
      });
      return NextResponse.json({
        error: "A valid role selection is required.",
        issues: parsed.error.issues
      }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    console.info("[onboarding-route] role launch authenticated user", {
      userId: user.id,
      runtimeRole: user.role,
      accountStatus: user.accountStatus ?? null,
      primaryOnboardingRole: user.primaryOnboardingRole ?? null,
      onboardingState: user.onboardingState ?? null,
      selectedLane: parsed.data.role
    });
    const result = await initializeSelectedUserLane(user, parsed.data);
    const nextPath = await resolvePostAuthDestination(result.user);
    console.info("[onboarding-route] role launch response", {
      userId: user.id,
      selectedLane: parsed.data.role,
      lane: result.state,
      degraded: result.degraded,
      nextPath
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
