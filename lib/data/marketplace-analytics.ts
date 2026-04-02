import type { MarketplaceBookingAttribution, MarketplaceConversionEvent } from "@/types/domain";

export const demoMarketplaceBookingAttributions: MarketplaceBookingAttribution[] = [
  {
    appointmentId: "appt-1",
    barberId: "barber-wave",
    username: "wave",
    clientId: "client-jordan",
    clientEmail: "client@bvrb3r.demo",
    locationId: "loc-ybor",
    sourceKind: "public_profile",
    discoveryQuery: "low taper fade ybor",
    createdAt: "2026-03-08T09:58:00-05:00",
    metadata: { campaign: "wave-profile" }
  },
  {
    appointmentId: "appt-4",
    barberId: "barber-blaze",
    username: "blaze",
    clientId: "client-omar",
    clientEmail: "omar@example.com",
    locationId: "loc-ybor",
    sourceKind: "haircut_now",
    matchedFrom: "favorite_shop",
    createdAt: "2026-03-08T08:20:00-05:00",
    metadata: { matchedFrom: "favorite_shop" }
  }
];

export const demoMarketplaceConversionEvents: MarketplaceConversionEvent[] = [
  {
    id: "market-event-1",
    eventType: "discovery_impression",
    barberId: "barber-wave",
    username: "wave",
    clientId: "client-jordan",
    clientEmail: "client@bvrb3r.demo",
    locationId: "loc-ybor",
    sourceKind: "discovery",
    sourceReference: "search-low-taper",
    metadata: { query: "low taper fade ybor", resultsCount: 4 },
    createdAt: "2026-03-08T09:45:00-05:00"
  },
  {
    id: "market-event-2",
    eventType: "profile_view",
    barberId: "barber-wave",
    username: "wave",
    clientId: "client-jordan",
    clientEmail: "client@bvrb3r.demo",
    sourceKind: "public_profile",
    sourceReference: "wave",
    metadata: { referrer: "discover" },
    createdAt: "2026-03-08T09:52:00-05:00"
  },
  {
    id: "market-event-3",
    eventType: "booking_cta_clicked",
    barberId: "barber-wave",
    username: "wave",
    clientId: "client-jordan",
    clientEmail: "client@bvrb3r.demo",
    sourceKind: "public_profile",
    sourceReference: "wave",
    metadata: { referrer: "barber_profile" },
    createdAt: "2026-03-08T09:55:00-05:00"
  },
  {
    id: "market-event-4",
    eventType: "booking_created",
    barberId: "barber-wave",
    username: "wave",
    clientId: "client-jordan",
    clientEmail: "client@bvrb3r.demo",
    appointmentId: "appt-1",
    locationId: "loc-ybor",
    sourceKind: "public_profile",
    sourceReference: "wave",
    metadata: { appointmentId: "appt-1", serviceId: "srv-signature" },
    createdAt: "2026-03-08T10:00:00-05:00"
  },
  {
    id: "market-event-5",
    eventType: "booking_completed",
    barberId: "barber-blaze",
    username: "blaze",
    clientId: "client-omar",
    clientEmail: "omar@example.com",
    appointmentId: "appt-4",
    locationId: "loc-ybor",
    sourceKind: "haircut_now",
    sourceReference: "appt-4",
    metadata: { appointmentId: "appt-4", matchedFrom: "favorite_shop" },
    createdAt: "2026-03-08T09:40:00-05:00"
  },
  {
    id: "market-event-6",
    eventType: "follow_created",
    barberId: "barber-blaze",
    username: "blaze",
    clientId: "client-jordan",
    clientEmail: "client@bvrb3r.demo",
    sourceKind: "public_profile",
    sourceReference: "blaze",
    metadata: { notifyOnAvailability: true },
    createdAt: "2026-03-06T17:00:00-05:00"
  },
  {
    id: "market-event-7",
    eventType: "haircut_now_impression",
    barberId: "barber-blaze",
    username: "blaze",
    clientId: "client-jordan",
    clientEmail: "client@bvrb3r.demo",
    locationId: "loc-ybor",
    sourceKind: "haircut_now",
    sourceReference: "favorite-shop-match",
    metadata: { matchedFrom: "favorite_shop" },
    createdAt: "2026-03-08T08:18:00-05:00"
  }
];