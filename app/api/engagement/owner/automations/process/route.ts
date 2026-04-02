import { NextResponse } from "next/server";
import { processOwnerAutomationRuns } from "@/lib/automation/service";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";

export async function POST() {
  try {
    const actor = await requireEngagementActor(["owner", "manager"]);
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
    const result = await processOwnerAutomationRuns(state, snapshot, actor.locationIds ?? []);

    return NextResponse.json(result);
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
