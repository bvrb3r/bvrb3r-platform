import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { buildMonetizationAnalytics, getMonetizationAttribution } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const postSchema = z.object({
  eventType: z.enum(["booking_cta_clicked", "profile_shared", "referral_shared"]),
  barberId: z.string().optional(),
  username: z.string().optional(),
  locationId: z.string().optional(),
  sourceKind: z.enum(["direct", "discovery", "public_profile", "haircut_now", "client_dashboard"]),
  sourceReference: z.string().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

const getSchema = z.object({
  barberId: z.string().optional()
});

export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid marketplace analytics payload." }, { status: 400 });
  }

  if ((parsed.data.eventType === "booking_cta_clicked" || parsed.data.eventType === "profile_shared") && !parsed.data.barberId) {
    return NextResponse.json({ error: "A barber reference is required for this marketplace event." }, { status: 400 });
  }

  const marketplaceProvider = await getMarketplaceProvider();
  const activationProvider = await getMarketplaceActivationProvider();
  const session = await getCurrentUserFromServer();
  const clientId = session.user.role === "client" ? session.user.clientId : undefined;

  if (parsed.data.eventType === "booking_cta_clicked") {
    await marketplaceProvider.recordBookingCtaClick({
      barberId: parsed.data.barberId ?? "",
      username: parsed.data.username,
      locationId: parsed.data.locationId,
      sourceKind: parsed.data.sourceKind,
      metadata: {
        ...(parsed.data.metadata ?? {}),
        sourceReference: parsed.data.sourceReference ?? null
      },
      clientId
    });
  } else {
    await marketplaceProvider.recordShareEvent({
      eventType: parsed.data.eventType,
      barberId: parsed.data.barberId,
      username: parsed.data.username,
      locationId: parsed.data.locationId,
      sourceKind: parsed.data.sourceKind,
      sourceReference: parsed.data.sourceReference,
      metadata: parsed.data.metadata,
      clientId
    });
  }

  try {
    const activationState = await activationProvider.readState();
    const attribution = getMonetizationAttribution(activationState, parsed.data.barberId);
    if (parsed.data.eventType === "booking_cta_clicked") {
      if (attribution.campaignId) {
        await activationProvider.recordMonetizationEvent({
          eventType: "boost_click",
          barberId: parsed.data.barberId,
          campaignId: attribution.campaignId,
          citySlug: attribution.citySlug,
          sourceKind: parsed.data.sourceKind,
          referenceId: parsed.data.sourceReference,
          metadata: parsed.data.metadata ?? {}
        });
      }
      if (attribution.placementId) {
        await activationProvider.recordMonetizationEvent({
          eventType: "featured_click",
          barberId: parsed.data.barberId,
          placementId: attribution.placementId,
          citySlug: attribution.citySlug,
          sourceKind: parsed.data.sourceKind,
          referenceId: parsed.data.sourceReference,
          metadata: parsed.data.metadata ?? {}
        });
      }
    }
  } catch {}

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const session = await getCurrentUserFromServer();
  if (session.user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can view marketplace analytics rollups." }, { status: 403 });
  }

  const parsed = getSchema.safeParse({
    barberId: new URL(request.url).searchParams.get("barberId") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid marketplace analytics query." }, { status: 400 });
  }

  const [marketplaceProvider, activationProvider] = await Promise.all([
    getMarketplaceProvider(),
    getMarketplaceActivationProvider()
  ]);
  const runtime = await marketplaceProvider.readRuntime();
  const activationState = await activationProvider.readState();
  const filteredEvents = parsed.data.barberId
    ? runtime.conversionEvents.filter((event) => event.barberId === parsed.data.barberId)
    : runtime.conversionEvents;

  const totals = {
    discoveryImpressions: filteredEvents.filter((event) => event.eventType === "discovery_impression").length,
    profileViews: filteredEvents.filter((event) => event.eventType === "profile_view").length,
    bookingCtaClicks: filteredEvents.filter((event) => event.eventType === "booking_cta_clicked").length,
    bookingsCreated: filteredEvents.filter((event) => event.eventType === "booking_created").length,
    bookingsCompleted: filteredEvents.filter((event) => event.eventType === "booking_completed").length,
    followsCreated: filteredEvents.filter((event) => event.eventType === "follow_created").length,
    waitlistJoins: filteredEvents.filter((event) => event.eventType === "waitlist_joined").length,
    haircutNowImpressions: filteredEvents.filter((event) => event.eventType === "haircut_now_impression").length,
    profileShares: filteredEvents.filter((event) => event.eventType === "profile_shared").length,
    referralShares: filteredEvents.filter((event) => event.eventType === "referral_shared").length
  };

  const byBarber = Array.from(
    filteredEvents.reduce((map, event) => {
      if (!event.barberId) {
        return map;
      }

      const current = map.get(event.barberId) ?? {
        barberId: event.barberId,
        username: event.username,
        profileViews: 0,
        bookingCtaClicks: 0,
        bookingsCreated: 0,
        bookingsCompleted: 0,
        followsCreated: 0,
        shareCount: 0
      };

      if (event.eventType === "profile_view") current.profileViews += 1;
      if (event.eventType === "booking_cta_clicked") current.bookingCtaClicks += 1;
      if (event.eventType === "booking_created") current.bookingsCreated += 1;
      if (event.eventType === "booking_completed") current.bookingsCompleted += 1;
      if (event.eventType === "follow_created") current.followsCreated += 1;
      if (event.eventType === "profile_shared") current.shareCount += 1;

      map.set(event.barberId, current);
      return map;
    }, new Map<string, { barberId: string; username?: string; profileViews: number; bookingCtaClicks: number; bookingsCreated: number; bookingsCompleted: number; followsCreated: number; shareCount: number }>())
  ).map(([, row]) => ({
    ...row,
    conversionRate: row.bookingCtaClicks ? Math.round((row.bookingsCreated / row.bookingCtaClicks) * 100) : 0
  }));

  const bySource = Array.from(
    filteredEvents.reduce((map, event) => {
      map.set(event.sourceKind, (map.get(event.sourceKind) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([sourceKind, count]) => ({ sourceKind, count }));

  const monetization = buildMonetizationAnalytics(activationState);

  return NextResponse.json({
    totals,
    byBarber,
    bySource,
    monetization: {
      totals: activationState.monetizationEvents.reduce((rows, event) => {
        if (event.eventType === "boost_impression") rows.boostImpressions += 1;
        if (event.eventType === "boost_click") rows.boostClicks += 1;
        if (event.eventType === "boost_booking") rows.boostBookings += 1;
        if (event.eventType === "featured_impression") rows.featuredImpressions += 1;
        if (event.eventType === "featured_click") rows.featuredClicks += 1;
        if (event.eventType === "featured_booking") rows.featuredBookings += 1;
        return rows;
      }, {
        boostImpressions: 0,
        boostClicks: 0,
        boostBookings: 0,
        featuredImpressions: 0,
        featuredClicks: 0,
        featuredBookings: 0
      }),
      byCity: monetization.byCity,
      trustAwareRules: monetization.trustAwareRules
    }
  });
}
