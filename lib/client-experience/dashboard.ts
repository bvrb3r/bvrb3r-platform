import type { Route } from "next";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import type { ClientEngagementSummary, ClientReferralSummary, IntelligenceRebookingWindow } from "@/types/engagement";
import type { ClientMembershipValueView } from "@/types/monetization";

type ClientHomeFavoriteBarber = {
  barberId: string;
  username?: string;
  barberName: string;
  rating: number;
  nextAvailableAt: string;
  shopName?: string;
  specialties: string[];
  mostBookedService?: string;
};

type ClientHomeTrustedBarber = {
  barberId: string;
  username: string;
  barberName: string;
  rating: number;
  nextAvailableAt: string;
  shopName?: string;
  specialties: string[];
  mostBookedService?: string;
};

type ClientHomeNextAvailable = {
  barberId: string;
  username?: string;
  barberName: string;
  locationId: string;
  appointmentTime: string;
  shopName?: string;
  matchReason: string;
  matchedFrom: "favorite_barber" | "favorite_shop" | "nearby" | "available_now";
};

type ClientHomeInput = {
  locationId?: string;
  favoriteBarber?: ClientHomeFavoriteBarber | null;
  trustedBarbers?: ClientHomeTrustedBarber[];
  nextAvailableChair?: ClientHomeNextAvailable | null;
};

type ClientAppointmentView = {
  barber?: { name?: string };
  service?: { name?: string };
  location?: { name?: string };
};

type ClientHistoryAppointment = {
  id: string;
  barberId: string;
  serviceId: string;
  locationId: string;
  start: string;
  totalAmount: number;
  grandTotal?: number;
  balanceDue: number;
  view?: ClientAppointmentView;
};

type ClientFavoriteBarberProfile = {
  barber: { id: string; name: string };
  profile: { username: string; headline: string; specialties: string[] };
  nextAvailableAt: string;
  shopLocations: Array<{ id: string; name: string; neighborhood: string }>;
  mostBookedService?: { service: { id: string; name: string } };
  proof?: { reviewScore?: number };
};

type ClientRoutineInput = {
  averageCycleDays: number;
  serviceReference?: string;
  nextSuggestedAt?: string | null;
};

type ClientBookingsInput = {
  favoriteBarber?: ClientFavoriteBarberProfile | null;
  nextAppointment?: ClientHistoryAppointment | null;
  history?: ClientHistoryAppointment[];
  routine?: ClientRoutineInput | null;
  membershipValue?: ClientMembershipValueView | null;
};

export interface ClientDashboardFeedItem {
  id: string;
  kind: "rebook" | "favorite" | "availability" | "promotion" | "loyalty" | "notification" | "referral" | "membership";
  eyebrow: string;
  title: string;
  detail: string;
  ctaLabel: string;
  href: Route;
  badge?: string;
}

export interface ClientFavoriteCandidate {
  barberId: string;
  barberName: string;
  username?: string;
  rating?: number;
  shopName?: string;
  specialties: string[];
  reason: string;
  bookingHref: Route;
  profileHref: Route;
}

function formatDateLabel(iso?: string | null) {
  if (!iso) {
    return undefined;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getRebookingBadge(window: IntelligenceRebookingWindow) {
  switch (window) {
    case "due_now":
      return "You are due";
    case "overdue":
      return "Overdue";
    case "due_soon":
      return "Due soon";
    case "scheduled":
      return "Already scheduled";
    default:
      return "Stay on track";
  }
}

function resolvePreferredServiceId(bookings: ClientBookingsInput, summary: ClientEngagementSummary) {
  return bookings.history?.[0]?.serviceId
    ?? bookings.nextAppointment?.serviceId
    ?? bookings.routine?.serviceReference
    ?? bookings.favoriteBarber?.mostBookedService?.service.id
    ?? summary.intelligence.primaryServiceId;
}

function resolvePreferredBarber(
  home: ClientHomeInput,
  bookings: ClientBookingsInput,
  summary: ClientEngagementSummary
) {
  const favoriteBarberId = bookings.favoriteBarber?.barber.id
    ?? home.favoriteBarber?.barberId
    ?? summary.intelligence.favoriteBarberId;
  const favoriteUsername = bookings.favoriteBarber?.profile.username
    ?? home.favoriteBarber?.username
    ?? summary.followedBarbers[0]?.username
    ?? summary.recommendedBarbers[0]?.username;
  const favoriteName = bookings.favoriteBarber?.barber.name
    ?? home.favoriteBarber?.barberName
    ?? summary.favoriteBarberName;
  const locationId = bookings.favoriteBarber?.shopLocations[0]?.id
    ?? bookings.nextAppointment?.locationId
    ?? home.locationId;

  return {
    barberId: favoriteBarberId,
    username: favoriteUsername,
    barberName: favoriteName,
    locationId
  };
}

export function buildQuickRebookHref(input: {
  barberId?: string;
  username?: string;
  locationId?: string;
  serviceId?: string;
  appointmentTime?: string;
}) {
  return buildMarketplaceBookingHref({
    barberId: input.barberId,
    username: input.username,
    locationId: input.locationId,
    serviceId: input.serviceId,
    appointmentTime: input.appointmentTime,
    sourceKind: "client_dashboard"
  });
}

export function buildClientPrimaryBookingHref(input: {
  home: ClientHomeInput;
  bookings: ClientBookingsInput;
  summary: ClientEngagementSummary;
}) {
  const preferredBarber = resolvePreferredBarber(input.home, input.bookings, input.summary);
  const preferredServiceId = resolvePreferredServiceId(input.bookings, input.summary);

  if (preferredBarber.barberId) {
    return buildQuickRebookHref({
      barberId: preferredBarber.barberId,
      username: preferredBarber.username,
      locationId: preferredBarber.locationId,
      serviceId: preferredServiceId
    });
  }

  if (input.home.nextAvailableChair) {
    return buildQuickRebookHref({
      barberId: input.home.nextAvailableChair.barberId,
      username: input.home.nextAvailableChair.username,
      locationId: input.home.nextAvailableChair.locationId,
      appointmentTime: input.home.nextAvailableChair.appointmentTime
    });
  }

  return "/booking/new?mode=next-available" as Route;
}

export function buildClientDashboardFeed(input: {
  home: ClientHomeInput;
  bookings: ClientBookingsInput;
  summary: ClientEngagementSummary;
  referrals?: ClientReferralSummary | null;
}) {
  const items: ClientDashboardFeedItem[] = [];
  const { home, bookings, summary } = input;
  const preferredBarber = resolvePreferredBarber(home, bookings, summary);
  const preferredServiceId = resolvePreferredServiceId(bookings, summary);
  const lastVisit = bookings.history?.[0];
  const lastVisitLabel = formatDateLabel(lastVisit?.start);
  const lastServiceName = lastVisit?.view?.service?.name ?? bookings.favoriteBarber?.mostBookedService?.service.name ?? "your usual service";

  if (preferredBarber.barberId && summary.intelligence.rebookingWindow !== "building") {
    const rebookBadge = getRebookingBadge(summary.intelligence.rebookingWindow);
    items.push({
      id: "feed-rebook",
      kind: "rebook",
      eyebrow: "Rebook",
      title: rebookBadge,
      detail: lastVisitLabel
        ? `Your last visit was ${lastVisitLabel} with ${preferredBarber.barberName ?? "your barber"}. Pick up ${lastServiceName} again in one tap.`
        : `Keep your routine moving with ${preferredBarber.barberName ?? "your barber"} and ${lastServiceName}.`,
      ctaLabel: "Rebook now",
      href: buildQuickRebookHref({
        barberId: preferredBarber.barberId,
        username: preferredBarber.username,
        locationId: preferredBarber.locationId,
        serviceId: preferredServiceId
      }),
      badge: rebookBadge
    });
  }

  if (bookings.favoriteBarber ?? home.favoriteBarber) {
    const favoriteBarber = bookings.favoriteBarber;
    const favoriteShop = favoriteBarber?.shopLocations[0]?.name ?? home.favoriteBarber?.shopName ?? "your regular shop";
    items.push({
      id: "feed-favorite",
      kind: "favorite",
      eyebrow: "Favorite barber",
      title: `${preferredBarber.barberName ?? "Your barber"} is ready when you are`,
      detail: `${favoriteShop} stays first on home so repeat booking feels familiar, fast, and trusted.`,
      ctaLabel: "Book favorite",
      href: buildQuickRebookHref({
        barberId: preferredBarber.barberId,
        username: preferredBarber.username,
        locationId: preferredBarber.locationId,
        serviceId: preferredServiceId
      }),
      badge: formatDateLabel(favoriteBarber?.nextAvailableAt ?? home.favoriteBarber?.nextAvailableAt) ?? "Saved"
    });
  }

  if (home.nextAvailableChair) {
    items.push({
      id: "feed-availability",
      kind: "availability",
      eyebrow: "Nearby opening",
      title: `${home.nextAvailableChair.barberName} has an opening`,
      detail: `${home.nextAvailableChair.shopName ?? "A nearby chair"} can take you at ${formatDateLabel(home.nextAvailableChair.appointmentTime) ?? "the next open slot"}.`,
      ctaLabel: "Book this slot",
      href: buildQuickRebookHref({
        barberId: home.nextAvailableChair.barberId,
        username: home.nextAvailableChair.username,
        locationId: home.nextAvailableChair.locationId,
        appointmentTime: home.nextAvailableChair.appointmentTime
      }),
      badge: home.nextAvailableChair.matchReason
    });
  }

  const promotionNotification = summary.recentNotifications.find((notification) =>
    notification.type === "promotion_follow_up" || notification.type === "reward_follow_up" || notification.type === "referral_reward"
  );
  if (promotionNotification) {
    items.push({
      id: "feed-promotion",
      kind: "promotion",
      eyebrow: "Offer for you",
      title: promotionNotification.title,
      detail: promotionNotification.body,
      ctaLabel: "Use this offer",
      href: buildQuickRebookHref({
        barberId: preferredBarber.barberId,
        username: preferredBarber.username,
        locationId: preferredBarber.locationId,
        serviceId: preferredServiceId
      }),
      badge: promotionNotification.type.replaceAll("_", " ")
    });
  }

  if (summary.pointsBalance > 0 || summary.referralCredits > 0) {
    items.push({
      id: "feed-loyalty",
      kind: "loyalty",
      eyebrow: "Loyalty",
      title: `${summary.pointsBalance} points on deck`,
      detail: summary.referralCredits > 0
        ? `You also have ${summary.referralCredits} referral credits ready to turn into future visits.`
        : `Your ${summary.tier} tier is active and ready to support your next visit.`,
      ctaLabel: "Open activity",
      href: "/activity" as Route,
      badge: summary.tier.toUpperCase()
    });
  }

  const recentNotification = summary.recentNotifications.find((notification) => notification.type === "rebooking_reminder" || notification.type === "booking_alert");
  if (recentNotification) {
    items.push({
      id: "feed-notification",
      kind: "notification",
      eyebrow: "Latest alert",
      title: recentNotification.title,
      detail: recentNotification.body,
      ctaLabel: "View bookings",
      href: "/bookings" as Route,
      badge: recentNotification.channel.replaceAll("_", " ")
    });
  }

  if (input.referrals?.referralCode) {
    items.push({
      id: "feed-referral",
      kind: "referral",
      eyebrow: "Referral boost",
      title: `Share ${input.referrals.referralCode.code}`,
      detail: input.referrals.totals.completed
        ? `${input.referrals.totals.completed} referral${input.referrals.totals.completed === 1 ? "" : "s"} already converted. Keep the momentum going from your client home.`
        : `Invite a friend, explain the perk clearly, and turn your best visits into future marketplace growth.`,
      ctaLabel: "Open referrals",
      href: "/referrals" as Route,
      badge: `${input.referrals.referralCode.rewardPoints} pts`
    });
  }

  if (bookings.membershipValue) {
    items.push({
      id: "feed-membership",
      kind: "membership",
      eyebrow: "Membership value",
      title: bookings.membershipValue.valueHeadline,
      detail: bookings.membershipValue.savingsMessage,
      ctaLabel: "See perks",
      href: "/dashboard/client" as Route,
      badge: bookings.membershipValue.subscriptionStatus.replaceAll("_", " ")
    });
  }

  return items.slice(0, 5);
}

export function buildClientFavoriteCandidates(input: {
  home: ClientHomeInput;
  summary: ClientEngagementSummary;
  favoriteBarberId?: string;
}) {
  const candidates = new Map<string, ClientFavoriteCandidate>();

  for (const result of input.home.trustedBarbers ?? []) {
    candidates.set(result.barberId, {
      barberId: result.barberId,
      barberName: result.barberName,
      username: result.username,
      rating: result.rating,
      shopName: result.shopName,
      specialties: result.specialties,
      reason: `Great for ${result.mostBookedService ?? result.specialties[0] ?? "repeat visits"}.`,
      bookingHref: buildQuickRebookHref({
        barberId: result.barberId,
        username: result.username,
        serviceId: input.summary.intelligence.primaryServiceId,
        locationId: input.home.locationId
      }),
      profileHref: `/barber/${result.username}` as Route
    });
  }

  for (const suggestion of input.summary.followSuggestions) {
    const existing = candidates.get(suggestion.barberId);
    let profileHref: Route = "/discover";
    if (suggestion.username) {
      profileHref = `/barber/${suggestion.username}` as Route;
    }

    candidates.set(suggestion.barberId, {
      barberId: suggestion.barberId,
      barberName: suggestion.barberName,
      username: suggestion.username,
      rating: existing?.rating,
      shopName: existing?.shopName,
      specialties: existing?.specialties ?? [],
      reason: suggestion.reason,
      bookingHref: buildQuickRebookHref({
        barberId: suggestion.barberId,
        username: suggestion.username,
        serviceId: input.summary.intelligence.primaryServiceId,
        locationId: input.home.locationId
      }),
      profileHref
    });
  }

  for (const recommendation of input.summary.recommendedBarbers) {
    const existing = candidates.get(recommendation.barberId);
    let profileHref: Route = "/discover";
    if (recommendation.username) {
      profileHref = `/barber/${recommendation.username}` as Route;
    }

    candidates.set(recommendation.barberId, {
      barberId: recommendation.barberId,
      barberName: recommendation.barberName,
      username: recommendation.username,
      rating: existing?.rating,
      shopName: existing?.shopName,
      specialties: existing?.specialties ?? [],
      reason: recommendation.reason,
      bookingHref: buildQuickRebookHref({
        barberId: recommendation.barberId,
        username: recommendation.username,
        serviceId: input.summary.intelligence.recommendedServiceId ?? input.summary.intelligence.primaryServiceId,
        locationId: input.summary.intelligence.recommendedLocationId ?? input.home.locationId
      }),
      profileHref
    });
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.barberId !== input.favoriteBarberId)
    .slice(0, 4);
}
