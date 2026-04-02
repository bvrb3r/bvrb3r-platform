import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { dismissFinancialAnomaly } from "@/lib/fintech/anomalies";

const dismissSchema = z.object({
  note: z.string().trim().max(500).optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager")) {
    return NextResponse.json({ error: "Only owners or managers can dismiss financial anomalies." }, { status: 403 });
  }

  const parsed = dismissSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid financial anomaly dismiss payload." }, { status: 400 });
  }

  try {
    const { id } = await params;
    const anomaly = await dismissFinancialAnomaly({
      id,
      actorUserId: user.id,
      actorRole: user.role,
      note: parsed.data.note
    });
    return NextResponse.json({ anomaly });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to dismiss this financial anomaly.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
