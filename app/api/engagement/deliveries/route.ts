import { NextResponse } from "next/server";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { getNotificationDeliveryProvider } from "@/lib/engagement/delivery-provider";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { getDeliveryProviderHealth } from "@/lib/engagement/live-delivery";

const allowedRoles = ["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber", "client"] as const;

function buildSummary(statuses: string[]) {
  return {
    queued: statuses.filter((status) => status === "queued" || status === "retrying").length,
    delivered: statuses.filter((status) => status === "delivered").length,
    failed: statuses.filter((status) => status === "failed").length,
    placeholder: statuses.filter((status) => status === "placeholder").length
  };
}

export async function GET() {
  try {
    const actor = await requireEngagementActor([...allowedRoles]);
    const deliveryProvider = await getNotificationDeliveryProvider();
    const [deliveries, attempts] = await Promise.all([
      deliveryProvider.readDeliveries(),
      deliveryProvider.readAttempts()
    ]);

    const scopedDeliveries = actor.role === "owner"
      ? deliveries
      : deliveries.filter((delivery) => {
        const audience = typeof delivery.metadata.userEmail === "string" ? delivery.metadata.userEmail : undefined;
        return audience === actor.userEmail || delivery.destination === actor.userEmail;
      });
    const scopedDeliveryIds = new Set(scopedDeliveries.map((delivery) => delivery.id));
    const scopedAttempts = actor.role === "owner"
      ? attempts
      : attempts.filter((attempt) => attempt.userEmail === actor.userEmail || scopedDeliveryIds.has(attempt.deliveryId));

    return NextResponse.json({
      health: getDeliveryProviderHealth(),
      summary: {
        deliveries: buildSummary(scopedDeliveries.map((delivery) => delivery.status)),
        attempts: buildSummary(scopedAttempts.map((attempt) => attempt.status))
      },
      deliveries: scopedDeliveries.slice(0, 30),
      attempts: scopedAttempts.slice(0, 50)
    });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}

export async function POST() {
  try {
    await requireEngagementActor(["owner"]);
    const engagementProvider = await getEngagementProvider();
    const deliveryProvider = await getNotificationDeliveryProvider();
    const state = await engagementProvider.readState();
    const now = new Date().toISOString();
    const dueNotifications = state.notifications.filter((notification) =>
      (notification.status === "queued" || notification.status === "scheduled")
      && (!notification.scheduledFor || notification.scheduledFor <= now)
    );

    await deliveryProvider.syncNotifications(dueNotifications);
    const [deliveries, attempts] = await Promise.all([
      deliveryProvider.readDeliveries(),
      deliveryProvider.readAttempts()
    ]);

    return NextResponse.json({
      processed: dueNotifications.length,
      health: getDeliveryProviderHealth(),
      summary: {
        deliveries: buildSummary(deliveries.map((delivery) => delivery.status)),
        attempts: buildSummary(attempts.map((attempt) => attempt.status))
      }
    });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
