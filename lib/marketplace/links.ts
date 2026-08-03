import type { AiRecommendationType } from "@/types/ai";
import type { HaircutNowMatch, MarketplaceSourceKind } from "@/types/domain";
import { buildDeepLinkPayload } from "@/lib/mobile/links";

interface BookingHrefOptions {
  barberId?: string;
  username?: string;
  locationId?: string;
  serviceId?: string;
  sourceKind?: MarketplaceSourceKind;
  matchedFrom?: HaircutNowMatch["matchedFrom"];
  query?: string;
  appointmentTime?: string;
  aiRecommendationId?: string;
  aiRecommendationType?: AiRecommendationType;
}

export type MarketplaceBookingHref = "/booking/new" | `/booking/new?${string}`;

export function buildMarketplaceBookingHref(options: BookingHrefOptions): MarketplaceBookingHref {
  const params = new URLSearchParams();

  if (options.barberId) {
    params.set("barberId", options.barberId);
  }

  if (options.username) {
    params.set("barber", options.username);
  }

  if (options.locationId) {
    params.set("locationId", options.locationId);
  }

  if (options.serviceId) {
    params.set("serviceId", options.serviceId);
  }

  if (options.sourceKind) {
    params.set("source", options.sourceKind);
  }

  if (options.matchedFrom) {
    params.set("matchedFrom", options.matchedFrom);
  }

  if (options.query) {
    params.set("query", options.query);
  }

  if (options.appointmentTime) {
    params.set("appointmentTime", options.appointmentTime);
  }

  if (options.aiRecommendationId) {
    params.set("aiRecommendationId", options.aiRecommendationId);
  }

  if (options.aiRecommendationType) {
    params.set("aiRecommendationType", options.aiRecommendationType);
  }

  const queryString = params.toString();
  return `/booking/new${queryString ? `?${queryString}` : ""}` as MarketplaceBookingHref;
}

export function buildMarketplaceBookingLinks(options: BookingHrefOptions) {
  const route = buildMarketplaceBookingHref(options);
  return buildDeepLinkPayload(route, "Book on BVRB3R");
}
