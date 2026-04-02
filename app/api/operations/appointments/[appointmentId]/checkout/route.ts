import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getMonetizationAttribution } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";
import { readActiveClientMembershipSubscription } from "@/lib/monetization/service";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError } from "@/lib/operations/live-state";
import { processCompletedAppointmentPoints } from "@/lib/points/engine";

const checkoutSchema = z.object({
  expectedRevision: z.number().int().positive(),
  tipAmount: z.number().min(0),
  paymentMethod: z.enum(["card_on_file", "tap_to_pay"])
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 });
  }

  const { user } = await getCurrentUserFromServer();
  if (!(user.role === "front_desk" || user.role === "manager" || user.role === "owner")) {
    return NextResponse.json({ error: "Only front desk, manager, or owner can close checkout." }, { status: 403 });
  }

  const provider = await getLiveOperationsProvider();

  try {
    const { appointmentId } = await params;
    const result = await provider.checkoutAppointment({
      appointmentId,
      expectedRevision: parsed.data.expectedRevision,
      tipAmount: parsed.data.tipAmount,
      paymentMethod: parsed.data.paymentMethod,
      actorRole: user.role,
      actorEmail: user.email
    });

    try {
      const [engagementProvider, marketplaceProvider, activationProvider] = await Promise.all([
        getEngagementProvider(),
        getMarketplaceProvider(),
        getMarketplaceActivationProvider()
      ]);
      const completedBookingHistory = result.snapshot.appointments
        .filter((appointment) => appointment.clientId === result.appointment.clientId && appointment.status === "completed")
        .map((appointment) => ({
          appointmentId: appointment.id,
          completedAt: appointment.completedAt ?? appointment.updatedAt
        }));
      const activeMembership = await readActiveClientMembershipSubscription(result.appointment.clientId)
        .then((subscription) => Boolean(subscription && (subscription.subscriptionStatus === "active" || subscription.subscriptionStatus === "trialing") && subscription.entitlementStatus === "enabled"))
        .catch(() => false);
      await Promise.all([
        engagementProvider.rewardCompletedBooking({
          clientId: result.appointment.clientId,
          appointmentId: result.appointment.id,
          completedAt: result.appointment.completedAt ?? result.appointment.updatedAt,
          completedBookingHistory,
          activeMembership
        }),
        marketplaceProvider.recordBookingCompleted({
          appointmentId: result.appointment.id
        })
      ]);
      const attribution = getMonetizationAttribution(await activationProvider.readState(), result.appointment.barberId);
      if (attribution.campaignId) {
        await activationProvider.recordMonetizationEvent({
          eventType: "boost_booking",
          barberId: result.appointment.barberId,
          campaignId: attribution.campaignId,
          citySlug: attribution.citySlug,
          sourceKind: "client_dashboard",
          referenceId: result.appointment.id,
          metadata: { paymentMethod: parsed.data.paymentMethod }
        });
      }
      if (attribution.placementId) {
        await activationProvider.recordMonetizationEvent({
          eventType: "featured_booking",
          barberId: result.appointment.barberId,
          placementId: attribution.placementId,
          citySlug: attribution.citySlug,
          sourceKind: "client_dashboard",
          referenceId: result.appointment.id,
          metadata: { paymentMethod: parsed.data.paymentMethod }
        });
      }
      const clientRecord = result.snapshot.clients.find((client) => client.id === result.appointment.clientId);
      await processCompletedAppointmentPoints({
        appointmentId: result.appointment.id,
        clientId: result.appointment.clientId,
        barberId: result.appointment.barberId,
        locationId: result.appointment.locationId,
        completedAt: result.appointment.completedAt ?? result.appointment.updatedAt,
        orderTotal: result.appointment.grandTotal ?? result.appointment.totalAmount,
        tipAmount: parsed.data.tipAmount,
        completedBookingCount: completedBookingHistory.length,
        paymentSettled: true,
        serviceCompleted: true,
        refundState: "clean",
        clientPhoneValidated: Boolean(clientRecord?.phone)
      });
    } catch {
      // Payment closeout should stay successful even if analytics side effects fail.
    }

    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          latestAppointment: error.latestAppointment
        },
        { status: error.status }
      );
    }

    throw error;
  }
}
