import { NextResponse } from "next/server";
import { getClientAiSummary } from "@/lib/ai/service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export async function GET() {
  try {
    const context = await getClientExperienceContext();
    const payload = await getClientAiSummary({
      clientId: context.clientId || undefined,
      actorId: context.viewer.id,
      actorRole: context.viewer.role
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load client AI summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
