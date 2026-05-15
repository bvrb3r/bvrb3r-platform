import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isShopOwnerRole, normalizeAccountRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";

const patchSchema = z.object({
  citySlug: z.string().min(1),
  activationState: z.enum(["seeded", "waitlist", "launching", "live"]).optional(),
  launchVisible: z.boolean().optional(),
  densityScore: z.number().min(0).max(100).optional(),
  marketNotes: z.string().optional()
});

export async function GET() {
  const { user } = await getCurrentUserFromServer();
  const provider = await getMarketplaceActivationProvider();
  const state = await provider.readState();
  const cities = isShopOwnerRole(user.role) ? state.cityRollouts : state.cityRollouts.filter((rollout) => rollout.launchVisible);
  return NextResponse.json({ cities });
}

export async function PATCH(request: NextRequest) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid city rollout payload." }, { status: 400 });
  }

  const { user } = await getCurrentUserFromServer();
  const provider = await getMarketplaceActivationProvider();
  try {
    const result = await provider.updateCityRollout({ role: normalizeAccountRole(user.role), barberId: user.barberId, userEmail: user.email }, parsed.data);
    return NextResponse.json({ rollout: result.rollout });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status ?? 500) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update city rollout." }, { status });
  }
}

