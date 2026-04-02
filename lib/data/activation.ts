import type {
  BoostCampaignRecord,
  CityRolloutRecord,
  FeaturedPlacementRecord,
  MarketplaceMonetizationEvent,
  NotificationDeliveryRecord,
  VerificationUploadRecord
} from "@/types/activation";

export const demoVerificationUploads: VerificationUploadRecord[] = [
  {
    id: "upload-wave-license-2026",
    ownerType: "barber",
    ownerId: "barber-wave",
    category: "license_verification",
    fileName: "wave-license-renewal.pdf",
    contentType: "application/pdf",
    fileSizeBytes: 348221,
    storagePath: "verification/barbers/barber-wave/license/wave-license-renewal.pdf",
    secureReference: "secure://verification/barber-wave/license-2026",
    uploadStatus: "submitted",
    uploadedByRole: "commission_barber",
    uploadedAt: "2026-03-08T10:18:00-05:00",
    expiresAt: "2027-06-30T00:00:00-04:00"
  },
  {
    id: "upload-blaze-payout-2026",
    ownerType: "barber",
    ownerId: "barber-blaze",
    category: "payout_verification",
    fileName: "blaze-payout-onboarding.pdf",
    contentType: "application/pdf",
    fileSizeBytes: 281900,
    storagePath: "verification/barbers/barber-blaze/payout/blaze-payout-onboarding.pdf",
    secureReference: "secure://verification/barber-blaze/payout-2026",
    uploadStatus: "uploaded",
    uploadedByRole: "booth_rent_barber",
    uploadedAt: "2026-03-09T09:12:00-05:00"
  },
  {
    id: "upload-shop-business-2026",
    ownerType: "shop",
    ownerId: "shop-bvrb3r",
    category: "business_verification",
    fileName: "bvrb3r-business-registration.pdf",
    contentType: "application/pdf",
    fileSizeBytes: 422118,
    storagePath: "verification/shops/shop-bvrb3r/business/bvrb3r-business-registration.pdf",
    secureReference: "secure://verification/shop-bvrb3r/business-2026",
    uploadStatus: "submitted",
    uploadedByRole: "owner",
    uploadedAt: "2026-03-08T08:02:00-05:00"
  }
];

export const demoBoostCampaigns: BoostCampaignRecord[] = [
  {
    id: "boost-wave-ybor-launch",
    scopeType: "barber",
    scopeId: "barber-wave",
    status: "active",
    placementLabel: "Boosted in Tampa discovery",
    placementScope: "discover_city",
    citySlug: "tampa-bay",
    trustEligible: true,
    trustReason: "Verified license, strong trust score, and no open safety penalties.",
    spendCents: 18600,
    dailyBudgetCents: 4800,
    startsAt: "2026-03-08T00:00:00-05:00",
    endsAt: "2026-03-15T23:59:00-04:00",
    createdByRole: "commission_barber",
    createdById: "barber-wave",
    createdAt: "2026-03-07T19:10:00-05:00"
  },
  {
    id: "boost-blaze-executive-week",
    scopeType: "barber",
    scopeId: "barber-blaze",
    status: "active",
    placementLabel: "Executive grooming category boost",
    placementScope: "discover_category",
    citySlug: "tampa-bay",
    categorySlug: "executive-grooming",
    trustEligible: true,
    trustReason: "Verified independent barber with clean trust status and strong completion reliability.",
    spendCents: 22400,
    dailyBudgetCents: 5200,
    startsAt: "2026-03-09T00:00:00-05:00",
    endsAt: "2026-03-16T23:59:00-04:00",
    createdByRole: "booth_rent_barber",
    createdById: "barber-blaze",
    createdAt: "2026-03-08T18:45:00-05:00"
  }
];

export const demoFeaturedPlacements: FeaturedPlacementRecord[] = [
  {
    id: "featured-wave-home-hero",
    scopeType: "barber",
    scopeId: "barber-wave",
    label: "Featured barber in Ybor City",
    placementScope: "discover_hero",
    citySlug: "tampa-bay",
    status: "active",
    trustEligible: true,
    startsAt: "2026-03-08T00:00:00-05:00",
    endsAt: "2026-03-14T23:59:00-04:00",
    priority: 1,
    createdByRole: "owner",
    createdById: "user-owner",
    createdAt: "2026-03-07T22:10:00-05:00"
  },
  {
    id: "featured-shop-tampa-launch",
    scopeType: "shop",
    scopeId: "shop-bvrb3r",
    label: "Flagship shop spotlight",
    placementScope: "discover_city",
    citySlug: "tampa-bay",
    status: "active",
    trustEligible: true,
    startsAt: "2026-03-08T00:00:00-05:00",
    endsAt: "2026-03-21T23:59:00-04:00",
    priority: 2,
    createdByRole: "owner",
    createdById: "user-owner",
    createdAt: "2026-03-07T21:30:00-05:00"
  },
  {
    id: "featured-blaze-leaderboard",
    scopeType: "barber",
    scopeId: "barber-blaze",
    label: "Featured executive groomer",
    placementScope: "leaderboard",
    citySlug: "tampa-bay",
    status: "scheduled",
    trustEligible: true,
    startsAt: "2026-03-11T00:00:00-04:00",
    endsAt: "2026-03-18T23:59:00-04:00",
    priority: 3,
    createdByRole: "owner",
    createdById: "user-owner",
    createdAt: "2026-03-09T08:10:00-05:00"
  }
];

export const demoCityRollouts: CityRolloutRecord[] = [
  {
    id: "city-tampa-bay",
    citySlug: "tampa-bay",
    cityLabel: "Tampa Bay",
    stateCode: "FL",
    neighborhoodLabel: "Ybor City + Hyde Park",
    activationState: "live",
    densityScore: 92,
    launchVisible: true,
    featuredBarberIds: ["barber-wave", "barber-blaze"],
    featuredShopIds: ["shop-bvrb3r"],
    marketNotes: "Flagship launch market with enough density to support featured placement and haircut-now demand.",
    activatedAt: "2026-03-01T09:00:00-05:00",
    updatedAt: "2026-03-10T08:00:00-04:00"
  },
  {
    id: "city-st-pete",
    citySlug: "st-petersburg",
    cityLabel: "St. Petersburg",
    stateCode: "FL",
    neighborhoodLabel: "Central Arts District",
    activationState: "launching",
    densityScore: 61,
    launchVisible: true,
    featuredBarberIds: [],
    featuredShopIds: [],
    marketNotes: "Recruiting density through referrals and marketplace waitlist demand before full activation.",
    activatedAt: "2026-03-15T09:00:00-04:00",
    updatedAt: "2026-03-10T08:00:00-04:00"
  },
  {
    id: "city-orlando",
    citySlug: "orlando",
    cityLabel: "Orlando",
    stateCode: "FL",
    neighborhoodLabel: "Winter Park",
    activationState: "waitlist",
    densityScore: 34,
    launchVisible: false,
    featuredBarberIds: [],
    featuredShopIds: [],
    marketNotes: "Waitlist market; referral and creator partnerships are building early supply.",
    updatedAt: "2026-03-10T08:00:00-04:00"
  }
];

export const demoMarketplaceMonetizationEvents: MarketplaceMonetizationEvent[] = [
  {
    id: "monetize-boost-wave-impression-1",
    eventType: "boost_impression",
    barberId: "barber-wave",
    campaignId: "boost-wave-ybor-launch",
    citySlug: "tampa-bay",
    sourceKind: "discovery",
    referenceId: "market-event-1",
    metadata: { placementLabel: "Boosted in Tampa discovery" },
    createdAt: "2026-03-08T09:45:00-05:00"
  },
  {
    id: "monetize-featured-wave-click-1",
    eventType: "featured_click",
    barberId: "barber-wave",
    placementId: "featured-wave-home-hero",
    citySlug: "tampa-bay",
    sourceKind: "public_profile",
    referenceId: "market-event-3",
    metadata: { label: "Featured barber in Ybor City" },
    createdAt: "2026-03-08T09:55:00-05:00"
  },
  {
    id: "monetize-featured-wave-booking-1",
    eventType: "featured_booking",
    barberId: "barber-wave",
    placementId: "featured-wave-home-hero",
    citySlug: "tampa-bay",
    sourceKind: "public_profile",
    referenceId: "appt-1",
    metadata: { appointmentId: "appt-1" },
    createdAt: "2026-03-08T10:00:00-05:00"
  },
  {
    id: "monetize-boost-blaze-booking-1",
    eventType: "boost_booking",
    barberId: "barber-blaze",
    campaignId: "boost-blaze-executive-week",
    citySlug: "tampa-bay",
    sourceKind: "haircut_now",
    referenceId: "appt-4",
    metadata: { matchedFrom: "favorite_shop" },
    createdAt: "2026-03-08T09:40:00-05:00"
  },
  {
    id: "monetize-city-rollout-view-1",
    eventType: "city_rollout_view",
    citySlug: "tampa-bay",
    sourceKind: "discovery",
    metadata: { densityScore: 92 },
    createdAt: "2026-03-09T11:20:00-05:00"
  }
];

export const demoNotificationDeliveries: NotificationDeliveryRecord[] = [
  {
    id: "delivery-follow-wave-1",
    notificationId: "engage-note-follow-wave-1",
    channel: "in_app",
    provider: "in_app",
    status: "delivered",
    destination: "wave@bvrb3r.demo",
    title: "New client follow",
    sentAt: "2026-03-08T09:46:00-05:00",
    metadata: { type: "new_follower" }
  },
  {
    id: "delivery-rebook-jordan-1",
    notificationId: "engage-note-rebook-jordan-1",
    channel: "sms",
    provider: "twilio_placeholder",
    status: "placeholder",
    destination: "+18135550199",
    title: "Time for a refresh",
    metadata: { type: "rebooking_reminder" }
  },
  {
    id: "delivery-verify-blaze-1",
    notificationId: "engage-note-verify-blaze-1",
    channel: "email",
    provider: "resend_placeholder",
    status: "queued",
    destination: "blaze@bvrb3r.demo",
    title: "Verification update ready",
    metadata: { type: "verification_update" }
  }
];
