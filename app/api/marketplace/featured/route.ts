import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isShopOwnerRole, normalizeAccountRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";

const featuredSchema = z.object({
  scopeType: z.enum(["barber", "shop"]),
  scopeId: z.string().min(1),
  label: z.string().min(3),
  placementScope: z.enum(["discover_hero", "discover_city", "discover_category", "leaderboard"]),
  citySlug: z.string().optional(),
  categorySlug: z.string().optional(),
  priority: z.number().int().min(1).max(10),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1)
});

export async function GET() {
  const { user } = await getCurrentUserFromServer();
  const provider = await getMarketplaceActivationProvider();
  const state = await provider.readState();
  if (isShopOwnerRole(user.role)) {
    return NextResponse.json({ placements: state.featuredPlacements });
  }

  return NextResponse.json({ placements: state.featuredPlacements.filter((placement) => placement.status === "active") });
}

export async function POST(request: NextRequest) {
  const parsed = featuredSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid featured placement payload." }, { status: 400 });
  }

  const { user } = await getCurrentUserFromServer();
  const provider = await getMarketplaceActivationProvider();
  try {
    const result = await provider.createFeaturedPlacement({ role: normalizeAccountRole(user.role), barberId: user.barberId, userEmail: user.email }, parsed.data);
    return NextResponse.json({ placement: result.placement });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status ?? 500) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create featured placement." }, { status });
  }
}
