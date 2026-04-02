import { NextResponse } from "next/server";
import { getOwnerAutomationSummary } from "@/lib/automation/service";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { getNotificationDeliveryProvider } from "@/lib/engagement/delivery-provider";
import { getOwnerIntelligenceSummary } from "@/lib/engagement/engine";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { syncScopedEngagementIntelligence } from "@/lib/engagement/intelligence";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { buildOwnerMonetizationSummary } from "@/lib/monetization/service";
import { buildOwnerMarketplaceActivationSummary } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { buildMarketplaceOwnerMetrics } from "@/lib/marketplace/growth";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";
import { buildOwnerMoneyDashboardSummary } from "@/lib/fintech/tax";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { buildOwnerPointsAnalyticsSummary } from "@/lib/points/engine";
import { getOwnerTrustSummary } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";

export async function GET() {
  try {
    const actor = await requireEngagementActor(["owner", "manager"]);
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
    await syncScopedEngagementIntelligence(state, snapshot, actor.locationIds ?? []);
    const [automation, monetization, marketplace] = await Promise.all([
      getOwnerAutomationSummary(state, snapshot, actor.locationIds ?? []),
      buildOwnerMonetizationSummary({ state, snapshot, locationIds: actor.locationIds ?? [] }),
      buildMarketplaceOwnerMetrics(runtime, state, actor.locationIds ?? [])
    ]);
    const points = await buildOwnerPointsAnalyticsSummary({
      locationIds: actor.locationIds ?? [],
      grossRevenue: monetization.revenue.grossRevenue,
      referralCompleted: marketplace.referralCompleted,
      referralCredited: marketplace.referralCredited
    });
    const money = await buildOwnerMoneyDashboardSummary({
      locationIds: actor.locationIds ?? [],
      snapshot,
      monetization,
      points
    });
    const baseSummary = getOwnerIntelligenceSummary(state, snapshot, actor.locationIds ?? [], {
      role: actor.role,
      userEmail: actor.userEmail
    });
    return NextResponse.json({
      summary: {
        ...baseSummary,
        automation,
        monetization,
        marketplace,
        points,
        money,
        trust: getOwnerTrustSummary(trustState, actor.locationIds ?? []),
        activation: buildOwnerMarketplaceActivationSummary({ activationState, deliveries })
      }
    });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
