import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBarberAccountRole, normalizeAccountRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";

const boostSchema = z.object({
  scopeType: z.enum(["barber", "shop"]),
  scopeId: z.string().optional(),
  placementLabel: z.string().min(3),
  placementScope: z.enum(["discover_hero", "discover_city", "discover_category", "leaderboard"]),
  citySlug: z.string().optional(),
  categorySlug: z.string().optional(),
  dailyBudgetCents: z.number().int().positive(),
  spendCents: z.number().int().positive(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional()
});

export async function GET() {
  const { user } = await getCurrentUserFromServer();
  const provider = await getMarketplaceActivationProvider();
  const state = await provider.readState();

  if (user.role === "owner") {
    return NextResponse.json({ campaigns: state.boostCampaigns });
  }

  if (isBarberAccountRole(user.role)) {
    return NextResponse.json({ campaigns: state.boostCampaigns.filter((campaign) => campaign.scopeType === "barber" && campaign.scopeId === user.barberId) });
  }

  return NextResponse.json({ error: "You do not have access to marketplace boost controls." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const parsed = boostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid boost campaign payload." }, { status: 400 });
  }

  const { user } = await getCurrentUserFromServer();
  const provider = await getMarketplaceActivationProvider();
  try {
    const result = await provider.createBoostCampaign({ role: normalizeAccountRole(user.role), barberId: user.barberId, userEmail: user.email }, parsed.data);
    return NextResponse.json({ campaign: result.campaign });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status ?? 500) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create boost campaign." }, { status });
  }
}
