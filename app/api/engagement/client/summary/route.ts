import { NextResponse } from "next/server";
import { enrichClientEngagementSummaryWithAutomation } from "@/lib/automation/service";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { EngagementValidationError, getClientEngagementSummary } from "@/lib/engagement/engine";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { buildClientIntelligenceSnapshot, syncClientIntelligenceSnapshots } from "@/lib/engagement/intelligence";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";

export async function GET() {
  try {
    const actor = await requireEngagementActor(["client"]);
    if (!actor.clientId) {
      throw new EngagementValidationError("A client profile is required for this engagement summary.");
    }

    const [engagementProvider, operationsProvider] = await Promise.all([
      getEngagementProvider(),
      getLiveOperationsProvider()
    ]);
    const [state, snapshot] = await Promise.all([
      engagementProvider.readState(),
      operationsProvider.readSnapshot({
        role: actor.role,
        clientId: actor.clientId,
        barberId: actor.barberId,
        locationIds: actor.locationIds,
        email: actor.userEmail
      })
    ]);
    const intelligenceSnapshot = buildClientIntelligenceSnapshot(state, snapshot, actor.clientId);
    if (intelligenceSnapshot) {
      await syncClientIntelligenceSnapshots([intelligenceSnapshot]);
    }

    const summary = getClientEngagementSummary(state, snapshot, actor.clientId);

    return NextResponse.json({
      summary: await enrichClientEngagementSummaryWithAutomation(summary, state, snapshot)
    });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
