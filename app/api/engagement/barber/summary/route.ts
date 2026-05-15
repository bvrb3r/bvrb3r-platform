import { NextResponse } from "next/server";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { getNotificationDeliveryProvider } from "@/lib/engagement/delivery-provider";
import { EngagementValidationError, getBarberEngagementSummary } from "@/lib/engagement/engine";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { buildBarberActivationSummary } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { buildMarketplaceBarberMetrics } from "@/lib/marketplace/growth";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { getBarberTrustSummary } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";

export async function GET() {
  try {
    const actor = await requireEngagementActor(["barber_user"]);
    if (!actor.barberId) throw new EngagementValidationError("A barber profile is required for this engagement summary.");
    const [engagementProvider, operationsProvider, marketplaceProvider, trustProvider, activationProvider, deliveryProvider] = await Promise.all([
      getEngagementProvider(),
      getLiveOperationsProvider(),
      getMarketplaceProvider(),
      getTrustProvider(),
      getMarketplaceActivationProvider(),
      getNotificationDeliveryProvider()
    ]);
    const [state, snapshot, runtime, trustState, activationState, deliveries] = await Promise.all([
      engagementProvider.readState(),
      operationsProvider.readSnapshot({ role: actor.role, clientId: actor.clientId, barberId: actor.barberId, locationIds: actor.locationIds, email: actor.userEmail }),
      marketplaceProvider.readRuntime(),
      trustProvider.readState(),
      activationProvider.readState(),
      deliveryProvider.readDeliveries()
    ]);
    return NextResponse.json({
      summary: {
        ...getBarberEngagementSummary(state, snapshot, actor.barberId),
        marketplace: buildMarketplaceBarberMetrics(runtime, actor.barberId),
        trust: getBarberTrustSummary(trustState, actor.barberId),
        activation: buildBarberActivationSummary({ activationState, deliveries, trustState, barberId: actor.barberId })
      }
    });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
