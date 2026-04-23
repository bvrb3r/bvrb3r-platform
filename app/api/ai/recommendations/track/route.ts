import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackAiRecommendation } from "@/lib/ai/service";
import { getCurrentUserFromServer } from "@/lib/auth/session";

const bodySchema = z.object({
  recommendationId: z.string().min(1),
  recommendationType: z.enum(["rebooking_reminder", "available_now", "barber_gap_alert"]),
  action: z.enum(["clicked", "converted", "suppressed"]),
  surface: z.enum(["client_home", "barber_dashboard"]),
  relatedIds: z.record(z.string(), z.unknown()).optional(),
  payload: z.record(z.string(), z.unknown()).optional()
});

function resolveActorRole(role: string) {
  if (role === "commission_barber" || role === "booth_rent_barber") {
    return "barber";
  }

  return role;
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI tracking payload." }, { status: 400 });
  }

  const session = await getCurrentUserFromServer();
  if (!session.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const result = await trackAiRecommendation({
    ...parsed.data,
    actorId: session.user.id,
    actorRole: resolveActorRole(session.user.role)
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
