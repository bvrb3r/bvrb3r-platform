import type { MarketplaceSourceKind, Role } from "@/types/domain";
import type { BarberVerificationCategory, ShopVerificationCategory, VerificationOwnerType } from "@/types/trust";

export type VerificationUploadStatus = "uploaded" | "submitted" | "reviewed";
export type NotificationDeliveryStatus = "queued" | "retrying" | "delivered" | "placeholder" | "failed";
export type NotificationDeliveryProvider =
  | "in_app"
  | "twilio"
  | "twilio_placeholder"
  | "resend"
  | "resend_placeholder"
  | "push_placeholder"
  | "web_push"
  | "web_push_placeholder"
  | "apns"
  | "fcm"
  | "native_bridge_placeholder";
export type BoostCampaignStatus = "draft" | "active" | "paused" | "ended";
export type FeaturedPlacementScope = "discover_hero" | "discover_city" | "discover_category" | "leaderboard";
export type FeaturedPlacementStatus = "scheduled" | "active" | "expired";
export type CityActivationState = "seeded" | "waitlist" | "launching" | "live";
export type MarketplaceMonetizationEventType =
  | "boost_impression"
  | "boost_click"
  | "boost_booking"
  | "featured_impression"
  | "featured_click"
  | "featured_booking"
  | "verification_unlocked"
  | "city_rollout_view";

export interface VerificationUploadRecord {
  id: string;
  ownerType: VerificationOwnerType;
  ownerId: string;
  category: BarberVerificationCategory | ShopVerificationCategory;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  storagePath: string;
  secureReference: string;
  uploadStatus: VerificationUploadStatus;
  uploadedByRole: Role;
  uploadedAt: string;
  expiresAt?: string;
}

export interface VerificationUploadView {
  uploadId: string;
  ownerType: VerificationOwnerType;
  ownerId: string;
  category: BarberVerificationCategory | ShopVerificationCategory;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  uploadStatus: VerificationUploadStatus;
  uploadedByRole: Role;
  uploadedAt: string;
  expiresAt?: string;
  signedUploadUrl: string;
}

export interface NotificationDeliveryRecord {
  id: string;
  notificationId: string;
  channel: "in_app" | "sms" | "email" | "push";
  provider: NotificationDeliveryProvider;
  status: NotificationDeliveryStatus;
  destination: string;
  title: string;
  sentAt?: string;
  lastAttemptedAt?: string;
  updatedAt?: string;
  retryCount?: number;
  providerMessageId?: string;
  errorMessage?: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface BoostCampaignRecord {
  id: string;
  scopeType: "barber" | "shop";
  scopeId: string;
  status: BoostCampaignStatus;
  placementLabel: string;
  placementScope: FeaturedPlacementScope;
  citySlug?: string;
  categorySlug?: string;
  trustEligible: boolean;
  trustReason: string;
  spendCents: number;
  dailyBudgetCents: number;
  startsAt: string;
  endsAt: string;
  createdByRole: Role;
  createdById: string;
  createdAt: string;
}

export interface FeaturedPlacementRecord {
  id: string;
  scopeType: "barber" | "shop";
  scopeId: string;
  label: string;
  placementScope: FeaturedPlacementScope;
  citySlug?: string;
  categorySlug?: string;
  status: FeaturedPlacementStatus;
  trustEligible: boolean;
  startsAt: string;
  endsAt: string;
  priority: number;
  createdByRole: Role;
  createdById: string;
  createdAt: string;
}

export interface CityRolloutRecord {
  id: string;
  citySlug: string;
  cityLabel: string;
  stateCode: string;
  neighborhoodLabel?: string;
  activationState: CityActivationState;
  densityScore: number;
  launchVisible: boolean;
  featuredBarberIds: string[];
  featuredShopIds: string[];
  marketNotes: string;
  activatedAt?: string;
  updatedAt: string;
}

export interface MarketplaceMonetizationEvent {
  id: string;
  eventType: MarketplaceMonetizationEventType;
  barberId?: string;
  shopId?: string;
  campaignId?: string;
  placementId?: string;
  citySlug?: string;
  sourceKind: MarketplaceSourceKind;
  referenceId?: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface MonetizationEligibility {
  canBoostVisibility: boolean;
  canUseFeaturedPlacement: boolean;
  minimumTrustScoreMet: boolean;
  requiresVerification: boolean;
  reason: string;
}

export interface BarberActivationSummary {
  verificationUploads: VerificationUploadRecord[];
  monetizationEligibility: MonetizationEligibility;
  activeBoosts: BoostCampaignRecord[];
  activePlacements: FeaturedPlacementRecord[];
  deliverySummary: {
    delivered: number;
    queued: number;
    placeholder: number;
    channels: Array<{
      channel: NotificationDeliveryRecord["channel"];
      count: number;
    }>;
  };
}

export interface OwnerMarketplaceActivationSummary {
  boostCampaigns: BoostCampaignRecord[];
  featuredPlacements: FeaturedPlacementRecord[];
  cityRollouts: CityRolloutRecord[];
  monetizationTotals: {
    boostImpressions: number;
    boostClicks: number;
    boostBookings: number;
    featuredImpressions: number;
    featuredClicks: number;
    featuredBookings: number;
  };
  topMarkets: Array<{
    citySlug: string;
    cityLabel: string;
    densityScore: number;
    activationState: CityActivationState;
  }>;
  deliverySummary: {
    delivered: number;
    queued: number;
    placeholder: number;
  };
}
