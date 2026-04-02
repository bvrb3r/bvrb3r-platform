import type { Route } from "next";
import { canonicalLocationUuid } from "@/lib/booking/canonical-booking";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { demoBarbers } from "@/lib/data/demo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type MarketplaceRuntimeData } from "@/lib/marketplace/provider";
import { searchMarketplace } from "@/lib/marketplace/engine";
import { buildBarberProofSignals, rankDiscoveryResults } from "@/lib/marketplace/insights";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import type { EngagementState } from "@/types/engagement";
import type { DiscoveryFilters, DiscoveryResult, MarketplaceConversionEventType, StyleTag } from "@/types/domain";
import type { TrustState } from "@/types/trust";

export interface DiscoveryFeedSection { id: string; title: string; description: string; items: DiscoveryResult[]; badge?: string; }
export interface MarketplaceLeaderboardEntry { barberId: string; username: string; barberName: string; supportingText: string; scoreLabel: string; badge?: string; bookingHref: Route; result: DiscoveryResult; }
export interface MarketplaceStyleSpotlight { styleTag: StyleTag; bookingCount: number; regionLabel?: string; trendLabel: string; barbers: MarketplaceLeaderboardEntry[]; }
export interface MarketplaceLeaderboardsPayload { topRated: MarketplaceLeaderboardEntry[]; fastestGrowing: MarketplaceLeaderboardEntry[]; mostBooked: MarketplaceLeaderboardEntry[]; styleLeaders: MarketplaceStyleSpotlight[]; }
export interface MarketplaceBarberMetrics { profileViews: number; bookingClicks: number; bookingsCreated: number; bookingsCompleted: number; conversionRate: number; shareCount: number; }
export interface MarketplaceOwnerMetrics {
  discoveryImpressions: number;
  profileViews: number;
  bookingClicks: number;
  bookingsCreated: number;
  bookingsCompleted: number;
  followsCreated: number;
  haircutNowImpressions: number;
  shareCount: number;
  referralShares: number;
  referralSignUps: number;
  referralBookings: number;
  referralCompleted: number;
  referralCredited: number;
  discoveryToBookingRate: number;
  profileToBookingRate: number;
  clickToBookingRate: number;
  referralInvites: number;
  topSources: Array<{ sourceKind: string; count: number }>;
}

function getServiceIdsByBarber(runtime: MarketplaceRuntimeData) { return runtime.state.services.reduce((map, service) => { const fallback = demoBarbers.find((barber) => barber.role === "commission_barber" && service.ownerType !== "barber")?.id; const barberId = service.barberId ?? fallback; if (!barberId) return map; map.set(barberId, [...(map.get(barberId) ?? []), service.id]); return map; }, new Map<string, string[]>()); }
function getProofMap(runtime: MarketplaceRuntimeData, engagementState: EngagementState, filters: DiscoveryFilters = {}, trustState?: TrustState) { const results = searchMarketplace(runtime.state, filters); return { results, proofSignals: buildBarberProofSignals({ discoveryResults: results, engagementState, rankingInputs: runtime.rankingInputs, servicePopularity: runtime.servicePopularity, conversionEvents: runtime.conversionEvents, serviceIdsByBarber: getServiceIdsByBarber(runtime), trustState }) }; }
const countEvents = (events: MarketplaceRuntimeData["conversionEvents"], eventType: MarketplaceConversionEventType, barberId?: string) => events.filter((event) => event.eventType === eventType && (!barberId || event.barberId === barberId)).length;
const getRankingLabel = (engagementState: EngagementState, barberId: string, dimension: string) => engagementState.rankingSnapshots.filter((snapshot) => snapshot.barberId === barberId && snapshot.dimension === dimension).sort((left, right) => left.rankPosition - right.rankPosition)[0]?.label;
const toLeaderboardEntry = (result: DiscoveryResult, supportingText: string, scoreLabel: string, badge?: string): MarketplaceLeaderboardEntry => ({ barberId: result.barberId, username: result.username, barberName: result.barberName, supportingText, scoreLabel, badge, bookingHref: buildMarketplaceBookingHref({ barberId: result.barberId, username: result.username, sourceKind: "discovery", query: badge ?? supportingText }), result });

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function hasReachedReferralStatus(current: EngagementState["referralEvents"][number]["status"], target: EngagementState["referralEvents"][number]["status"]) {
  const weights = {
    invited: 1,
    signed_up: 2,
    booked: 3,
    completed: 4,
    credited: 5
  } as const;

  return weights[current] >= weights[target];
}

function computeMarketplaceOwnerMetrics(
  runtime: MarketplaceRuntimeData,
  engagementState: EngagementState,
  locationId?: string
): MarketplaceOwnerMetrics {
  const filteredEvents = runtime.conversionEvents.filter((event) => !locationId || event.locationId === locationId);
  const discoveryImpressions = countEvents(filteredEvents, "discovery_impression");
  const profileViews = countEvents(filteredEvents, "profile_view");
  const bookingClicks = countEvents(filteredEvents, "booking_cta_clicked");
  const bookingsCreated = countEvents(filteredEvents, "booking_created");
  const bookingsCompleted = countEvents(filteredEvents, "booking_completed");
  const followsCreated = countEvents(filteredEvents, "follow_created");
  const haircutNowImpressions = countEvents(filteredEvents, "haircut_now_impression");
  const profileShares = countEvents(filteredEvents, "profile_shared");
  const referralShares = countEvents(filteredEvents, "referral_shared");
  const attributionLocationByAppointment = new Map(
    runtime.bookingAttributions.map((record) => [record.appointmentId, record.locationId])
  );
  const scopedReferralEvents = engagementState.referralEvents.filter((event) => {
    if (!locationId) {
      return true;
    }

    return event.appointmentId ? attributionLocationByAppointment.get(event.appointmentId) === locationId : false;
  });

  return {
    discoveryImpressions,
    profileViews,
    bookingClicks,
    bookingsCreated,
    bookingsCompleted,
    followsCreated,
    haircutNowImpressions,
    shareCount: profileShares + referralShares,
    referralShares,
    referralSignUps: scopedReferralEvents.filter((event) => hasReachedReferralStatus(event.status, "signed_up")).length,
    referralBookings: scopedReferralEvents.filter((event) => hasReachedReferralStatus(event.status, "booked")).length,
    referralCompleted: scopedReferralEvents.filter((event) => hasReachedReferralStatus(event.status, "completed")).length,
    referralCredited: scopedReferralEvents.filter((event) => hasReachedReferralStatus(event.status, "credited")).length,
    discoveryToBookingRate: discoveryImpressions ? Math.round((bookingsCreated / discoveryImpressions) * 100) : 0,
    profileToBookingRate: profileViews ? Math.round((bookingsCreated / profileViews) * 100) : 0,
    clickToBookingRate: bookingClicks ? Math.round((bookingsCreated / bookingClicks) * 100) : 0,
    referralInvites: scopedReferralEvents.length,
    topSources: Array.from(filteredEvents.reduce((map, event) => {
      map.set(event.sourceKind, (map.get(event.sourceKind) ?? 0) + 1);
      return map;
    }, new Map<string, number>()))
      .map(([sourceKind, count]) => ({ sourceKind, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 4)
  };
}

async function syncMarketplaceConversionSnapshots(
  runtime: MarketplaceRuntimeData,
  engagementState: EngagementState
) {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const now = new Date().toISOString();
  const locationIds = Array.from(new Set(
    runtime.conversionEvents.map((event) => event.locationId).filter((value): value is string => Boolean(value))
  ));
  const networkMetrics = computeMarketplaceOwnerMetrics(runtime, engagementState);
  const locationMetrics = locationIds.map((locationId) => ({
    locationId,
    metrics: computeMarketplaceOwnerMetrics(runtime, engagementState, locationId)
  }));
  const networkPayload = {
    scope_reference: "network",
    scope_kind: "network",
    snapshot_scope: "network",
    location_id: null,
    discovery_impressions: networkMetrics.discoveryImpressions,
    profile_views: networkMetrics.profileViews,
    booking_cta_clicks: networkMetrics.bookingClicks,
    booking_clicks: networkMetrics.bookingClicks,
    bookings_created: networkMetrics.bookingsCreated,
    bookings_completed: networkMetrics.bookingsCompleted,
    follows_created: networkMetrics.followsCreated,
    haircut_now_impressions: networkMetrics.haircutNowImpressions,
    profile_shares: Math.max(networkMetrics.shareCount - networkMetrics.referralShares, 0),
    share_count: networkMetrics.shareCount,
    referral_shares: networkMetrics.referralShares,
    referral_invites: networkMetrics.referralInvites,
    referral_sign_ups: networkMetrics.referralSignUps,
    referral_bookings: networkMetrics.referralBookings,
    referral_completed: networkMetrics.referralCompleted,
    referral_credited: networkMetrics.referralCredited,
    discovery_to_booking_rate: networkMetrics.discoveryToBookingRate,
    profile_to_booking_rate: networkMetrics.profileToBookingRate,
    click_to_booking_rate: networkMetrics.clickToBookingRate,
    top_sources: networkMetrics.topSources,
    updated_at: now
  };
  const existingNetwork = await supabase
    .from("marketplace_conversion_snapshots")
    .select("id")
    .eq("snapshot_scope", "network")
    .is("location_id", null)
    .maybeSingle();

  if (existingNetwork.error) {
    throw existingNetwork.error;
  }

  const networkWrite = existingNetwork.data
    ? await supabase
      .from("marketplace_conversion_snapshots")
      .update(networkPayload)
      .eq("id", existingNetwork.data.id)
    : await supabase
      .from("marketplace_conversion_snapshots")
      .insert(networkPayload);

  if (networkWrite.error) {
    throw networkWrite.error;
  }

  if (locationMetrics.length) {
    const locationRows = locationMetrics.map(({ locationId, metrics }) => ({
      scope_reference: `location:${canonicalLocationUuid(locationId)}`,
      scope_kind: "location",
      snapshot_scope: "location",
      location_id: canonicalLocationUuid(locationId),
      discovery_impressions: metrics.discoveryImpressions,
      profile_views: metrics.profileViews,
      booking_cta_clicks: metrics.bookingClicks,
      booking_clicks: metrics.bookingClicks,
      bookings_created: metrics.bookingsCreated,
      bookings_completed: metrics.bookingsCompleted,
      follows_created: metrics.followsCreated,
      haircut_now_impressions: metrics.haircutNowImpressions,
      profile_shares: Math.max(metrics.shareCount - metrics.referralShares, 0),
      share_count: metrics.shareCount,
      referral_shares: metrics.referralShares,
      referral_invites: metrics.referralInvites,
      referral_sign_ups: metrics.referralSignUps,
      referral_bookings: metrics.referralBookings,
      referral_completed: metrics.referralCompleted,
      referral_credited: metrics.referralCredited,
      discovery_to_booking_rate: metrics.discoveryToBookingRate,
      profile_to_booking_rate: metrics.profileToBookingRate,
      click_to_booking_rate: metrics.clickToBookingRate,
      top_sources: metrics.topSources,
      updated_at: now
    }));
    const locationUpsert = await supabase
      .from("marketplace_conversion_snapshots")
      .upsert(locationRows, { onConflict: "snapshot_scope,location_id" });

    if (locationUpsert.error) {
      throw locationUpsert.error;
    }
  }
}

export function buildMarketplaceDiscoveryFeed(runtime: MarketplaceRuntimeData, engagementState: EngagementState, filters: DiscoveryFilters, clientId?: string, trustState?: TrustState): DiscoveryFeedSection[] {
  const rankedResults = rankDiscoveryResults(getProofMap(runtime, engagementState, filters, trustState).results, getProofMap(runtime, engagementState, filters, trustState).proofSignals);
  const followedBarberIds = clientId ? engagementState.barberFollows.filter((follow) => follow.clientId === clientId).map((follow) => follow.barberId) : [];
  const favoriteUpdates = rankedResults.filter((result) => followedBarberIds.includes(result.barberId)).slice(0, 3);
  const nearby = [...rankedResults].sort((left, right) => left.distanceMiles - right.distanceMiles).slice(0, 4);
  const topRated = [...rankedResults].sort((left, right) => right.rating - left.rating || right.reviewCount - left.reviewCount).slice(0, 4);
  const trending = [...rankedResults].sort((left, right) => ((right.reputationScore ?? 0) + (right.followCount ?? 0) + (right.trustScore ?? 0)) - ((left.reputationScore ?? 0) + (left.followCount ?? 0) + (left.trustScore ?? 0))).slice(0, 4);
  const availableToday = [...rankedResults].sort((left, right) => new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime()).slice(0, 4);
  const rising = [...rankedResults].filter((result) => result.badges.includes("rising_barber") || (result.rankingLabel ?? "").toLowerCase().includes("growing")).slice(0, 4);
  const sections: DiscoveryFeedSection[] = [{ id: "nearby", title: "Nearby barbers", description: "The closest trusted chairs with strong proof and bookable openings.", items: nearby, badge: `${nearby.length} close fits` }, { id: "top-rated", title: "Top rated", description: "Highest review confidence across the visible marketplace network.", items: topRated, badge: "Client trust" }, { id: "trending", title: "Trending now", description: "Profiles building momentum through follows, reputation, conversion proof, and trust signals.", items: trending, badge: "Growth pulse" }, { id: "available-next", title: "Available today", description: "The fastest credible chairs to move from discovery into booking right now.", items: availableToday, badge: "Fast booking" }];
  if (rising.length) sections.push({ id: "rising", title: "Rising barbers", description: "Visibility is growing fast, making these profiles worth tracking early.", items: rising, badge: "Early signal" });
  if (favoriteUpdates.length) sections.unshift({ id: "favorites", title: "Favorite barber updates", description: "Availability and proof from the barbers you already follow or come back to most.", items: favoriteUpdates, badge: "For you" });
  return sections.filter((section) => section.items.length);
}

export function buildMarketplaceLeaderboards(runtime: MarketplaceRuntimeData, engagementState: EngagementState, trustState?: TrustState): MarketplaceLeaderboardsPayload {
  const { results, proofSignals } = getProofMap(runtime, engagementState, {}, trustState); const rankedResults = rankDiscoveryResults(results, proofSignals);
  const topRated = [...rankedResults].sort((left, right) => (right.rating + (right.trustScore ?? 0) / 100) - (left.rating + (left.trustScore ?? 0) / 100) || right.reviewCount - left.reviewCount).slice(0, 5).map((result) => toLeaderboardEntry(result, `${result.reviewCount} verified reviews | ${result.reviewIntegrityLabel ?? "Integrity monitored"}`, `${result.rating.toFixed(1)} stars`, getRankingLabel(engagementState, result.barberId, "highest_rated") ?? result.trustLabel ?? "Top rated"));
  const fastestGrowing = [...rankedResults].sort((left, right) => ((right.followCount ?? 0) + (right.profileViews ?? 0) + (right.trustScore ?? 0) / 4) - ((left.followCount ?? 0) + (left.profileViews ?? 0) + (left.trustScore ?? 0) / 4)).slice(0, 5).map((result) => toLeaderboardEntry(result, `${result.followCount ?? 0} followers | ${result.completionRate ?? 0}% reliability`, `${(result.reputationScore ?? 0).toFixed(0)} reputation`, getRankingLabel(engagementState, result.barberId, "fastest_growing") ?? result.trustLabel ?? "Fastest growing"));
  const mostBooked = [...rankedResults].sort((left, right) => (right.mostBookedService ? 1 : 0) - (left.mostBookedService ? 1 : 0) || (right.followCount ?? 0) - (left.followCount ?? 0) || right.reviewCount - left.reviewCount).slice(0, 5).map((result) => toLeaderboardEntry(result, `${result.mostBookedService ?? "High-demand service mix"} | ${result.completionRate ?? 0}% completion`, result.mostBookedService ?? "Most booked", getRankingLabel(engagementState, result.barberId, "most_booked") ?? result.trustLabel ?? "Most booked"));
  const styleLeaders = runtime.state.styleTags.map((styleTag) => { const styleResults = rankedResults.filter((result) => runtime.state.services.some((service) => { const ownerBarberId = service.barberId ?? demoBarbers.find((barber) => barber.role === "commission_barber" && service.ownerType !== "barber")?.id; return ownerBarberId === result.barberId && (service.styleTagIds ?? []).includes(styleTag.id); })); const bookingCount = runtime.servicePopularity.filter((row) => runtime.state.services.some((service) => service.id === row.serviceId && (service.styleTagIds ?? []).includes(styleTag.id))).reduce((sum, row) => sum + row.metrics.bookingCount, 0); const trendLabel = runtime.state.trendingStyles.find((style) => style.styleTagId === styleTag.id)?.regionLabel ?? "Tampa Bay"; return { styleTag, bookingCount, regionLabel: trendLabel, trendLabel: bookingCount ? `${bookingCount} marketplace bookings` : "Style signal building", barbers: styleResults.slice(0, 3).map((result) => toLeaderboardEntry(result, `${result.mostBookedService ?? styleTag.name} | ${result.reviewIntegrityLabel ?? "Integrity monitored"}`, result.rankingLabel ?? styleTag.name, getRankingLabel(engagementState, result.barberId, "style_leader") ?? result.trustLabel ?? `${styleTag.name} leader`)) }; }).filter((entry) => entry.barbers.length).sort((left, right) => right.bookingCount - left.bookingCount).slice(0, 4);
  return { topRated, fastestGrowing, mostBooked, styleLeaders };
}

export function buildMarketplaceBarberMetrics(runtime: MarketplaceRuntimeData, barberId: string): MarketplaceBarberMetrics { const bookingClicks = countEvents(runtime.conversionEvents, "booking_cta_clicked", barberId); const bookingsCreated = countEvents(runtime.conversionEvents, "booking_created", barberId); return { profileViews: countEvents(runtime.conversionEvents, "profile_view", barberId), bookingClicks, bookingsCreated, bookingsCompleted: countEvents(runtime.conversionEvents, "booking_completed", barberId), conversionRate: bookingClicks ? Math.round((bookingsCreated / bookingClicks) * 100) : 0, shareCount: countEvents(runtime.conversionEvents, "profile_shared", barberId) }; }
export async function buildMarketplaceOwnerMetrics(
  runtime: MarketplaceRuntimeData,
  engagementState: EngagementState,
  locationIds: string[] = []
): Promise<MarketplaceOwnerMetrics> {
  await syncMarketplaceConversionSnapshots(runtime, engagementState);

  if (!locationIds.length) {
    return computeMarketplaceOwnerMetrics(runtime, engagementState);
  }

  const scopedRuntime = {
    ...runtime,
    conversionEvents: runtime.conversionEvents.filter((event) => event.locationId && locationIds.includes(event.locationId)),
    bookingAttributions: runtime.bookingAttributions.filter((event) => event.locationId && locationIds.includes(event.locationId))
  } satisfies MarketplaceRuntimeData;

  return computeMarketplaceOwnerMetrics(scopedRuntime, engagementState);
}
