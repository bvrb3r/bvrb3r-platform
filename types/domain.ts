export type Role =
  | "platform_admin"
  | "architect"
  | "shop_owner_user"
  | "owner"
  | "manager"
  | "front_desk"
  | "barber_user"
  | "barber"
  | "freelance_barber"
  | "commission_barber"
  | "booth_rent_barber"
  | "client_user"
  | "client";

export type CompensationModel = "freelance" | "commission" | "booth_rent";
export type IdentityLane = "client" | "barber" | "shop_owner" | "platform_admin";
export type BarberSubtype = "freelance" | "booth_rent" | "commission";
export type ApprovalStatus = "not_required" | "pending" | "under_review" | "approved" | "rejected";
export type IdentityOnboardingState =
  | "awaiting_contact_verification"
  | "awaiting_role_selection"
  | "role_selected"
  | "active";
export type AppointmentStatus = "pending" | "confirmed" | "booked" | "checked_in" | "in_service" | "completed" | "cancelled" | "no_show" | "refunded";
export type WalkInStatus =
  | "waiting"
  | "active"
  | "called"
  | "assigned"
  | "converted"
  | "cancelled"
  | "expired"
  | "no_show"
  | "in_service"
  | "completed";
export type RentStatus = "paid" | "due" | "overdue";
export type ReviewSentiment = "great" | "good" | "watch";
export type AuthRuntimeMode = "supabase" | "demo";
export type PaymentProviderKind = "stripe" | "mock";
export type ServiceOwnerType = "barber" | "shop";
export type MarketplaceBadge = "verified_license" | "verified_identity" | "verified_shop" | "top_barber" | "rising_barber";
export type MarketplaceVisibilityState = "public" | "featured" | "hidden";
export type MarketplaceSourceKind = "direct" | "discovery" | "public_profile" | "haircut_now" | "client_dashboard";
export type PromotionType = "code" | "automatic" | "featured";
export type PromotionDiscountType = "percent" | "fixed_amount";
export type PromotionAppliesToScope = "booking" | "service" | "shop";
export type PromotionRedemptionStatus = "reserved" | "applied" | "completed" | "voided";
export type MarketplaceConversionEventType =
  | "discovery_impression"
  | "profile_view"
  | "booking_cta_clicked"
  | "booking_created"
  | "booking_completed"
  | "waitlist_joined"
  | "follow_created"
  | "haircut_now_impression"
  | "profile_shared"
  | "referral_shared";

export interface UserAccount {
  id: string;
  role: Role;
  email: string;
  password: string;
  name: string;
  canonicalFullName?: string;
  firstName?: string;
  lastName?: string;
  title: string;
  locationIds: string[];
  platformAdmin?: boolean;
  phone?: string;
  accountStatus?: "active" | "deactivated" | "suspended" | "banned" | "profile_only";
  primaryOnboardingRole?: IdentityLane;
  onboardingState?: IdentityOnboardingState;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  barberId?: string;
  barberSubtype?: BarberSubtype;
  clientId?: string;
  ownedShopId?: string;
  ownedShopName?: string;
  appApprovalStatus?: ApprovalStatus;
  shopApprovalStatus?: ApprovalStatus;
}

export interface Location {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  hours: string;
  chairs: number;
  taxRate: number;
  address?: string;
  addressLine2?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface Shop {
  id: string;
  name: string;
  brandLine: string;
  phone: string;
  locationIds: string[];
  type: "shop" | "mobile";
  appApprovalStatus?: ApprovalStatus;
  profilePhotoUrl?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  address?: string;
  gallery?: ShopMediaAsset[];
}

export interface ShopMediaAsset {
  id: string;
  shopId: string;
  imageUrl: string;
  caption: string;
  featured?: boolean;
}

export interface ServicePopularityMetrics {
  bookingCount: number;
  revenueGenerated: number;
  averageRating: number;
  repeatRate: number;
  popularityRank: number;
}

export interface PersistedServicePopularityRow {
  serviceId: string;
  metrics: ServicePopularityMetrics;
}

export interface BarberRankingInput {
  barberId: string;
  distanceScore: number;
  averageRatingScore: number;
  reviewVolumeScore: number;
  completionRate?: number;
  cancellationRate?: number;
  activityRecencyScore?: number;
  retentionScore: number;
  availabilityScore: number;
  portfolioEngagementScore: number;
  followCount: number;
  reputationScore: number;
  servicePopularityScore: number;
  rebookingScore: number;
  conversionScore: number;
  visibilityScore: number;
  rankingScore: number;
  label?: string;
}

export interface Service {
  id: string;
  category: string;
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  price: number;
  deposit: number;
  fullPrepay: boolean;
  addOnIds: string[];
  ownerType?: ServiceOwnerType;
  barberId?: string;
  shopId?: string;
  styleTagIds?: string[];
  currency?: string;
  isActive?: boolean;
  isBookable?: boolean;
  displayOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Barber {
  id: string;
  userId: string;
  name: string;
  role: Extract<Role, "barber_user" | "barber" | "freelance_barber" | "commission_barber" | "booth_rent_barber">;
  barberSubtype?: BarberSubtype;
  appApprovalStatus?: ApprovalStatus;
  shopApprovalStatus?: ApprovalStatus;
  locationIds: string[];
  specialties: string[];
  rating: number;
  reviewCount: number;
  compensationModel: CompensationModel;
  commissionRate?: number;
  boothRentAmount?: number;
  boothRentFrequency?: "weekly" | "monthly";
  todayEarnings: number;
  upcomingPayout: number;
  availabilityLabel: string;
  bio: string;
  bookingLink: string;
}

export interface BarberProfile {
  id: string;
  barberId: string;
  username: string;
  photoAccent: string;
  profilePhotoUrl?: string;
  yearsExperience: number;
  shopId?: string;
  headline: string;
  specialties: string[];
  badges: MarketplaceBadge[];
  nextAvailableAt: string;
  serviceAreaLabel: string;
  visibilityState: MarketplaceVisibilityState;
}

export interface BarberPortfolioAsset {
  id: string;
  barberId: string;
  imageUrl: string;
  caption: string;
  styleTagIds: string[];
  featured: boolean;
}

export interface StyleTag {
  id: string;
  name: string;
  slug: string;
  category: "cut" | "beard" | "finish" | "kids" | "style";
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  profilePhotoUrl?: string;
  favoriteBarberId?: string;
  loyaltyPoints: number;
  retentionTag: "new" | "repeat" | "lapsed" | "vip";
  notes: string[];
}

export interface Appointment {
  id: string;
  locationId: string;
  shopId?: string;
  barberId: string;
  clientId: string;
  serviceId: string;
  status: AppointmentStatus;
  confirmationCode?: string;
  start: string;
  end: string;
  chair: string;
  addOnIds: string[];
  depositAmount: number;
  serviceTotal?: number;
  addOnTotal?: number;
  subtotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  totalAmount: number;
  grandTotal?: number;
  balanceDue: number;
  tipAmount: number;
  note: string;
  internalNotes?: string;
  bookingSource?: string;
  membershipId?: string;
  checkedInAt?: string;
  serviceStartedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  createdBy?: string;
  source: "booking" | "walk_in" | "front_desk";
}

export interface WaitlistEntry {
  id: string;
  locationId: string;
  shopId?: string;
  clientId: string;
  serviceId?: string;
  barberId?: string;
  preferredBarberId?: string;
  requestedDate?: string;
  preferredWindow?: string;
  preferredDate?: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  flexibilityMinutes?: number;
  queueSource?: "walk_in" | "cancellation_fill" | "manual" | "app" | "kiosk";
  notes?: string;
  status?: WalkInStatus;
  calledAt?: string;
  assignedAt?: string;
  convertedAppointmentId?: string;
  completedAt?: string;
  cancelledAt?: string;
  createdBy?: string;
  barberPreference?: string;
}

export interface WalkInEntry {
  id: string;
  locationId: string;
  shopId?: string;
  clientId?: string;
  clientName: string;
  serviceId?: string;
  requestedService: string;
  requestedAt: string;
  status: WalkInStatus;
  assignedBarberId?: string;
  preferredBarberId?: string;
  waitMinutes: number;
  flexibilityMinutes?: number;
  queueSource?: "walk_in" | "cancellation_fill" | "manual" | "app" | "kiosk";
  calledAt?: string;
  assignedAt?: string;
  convertedAppointmentId?: string;
  notes?: string;
}

export interface BoothRentLedgerEntry {
  id: string;
  barberId: string;
  periodLabel: string;
  dueDate: string;
  amount: number;
  status: RentStatus;
  paidDate?: string;
}

export interface Review {
  id: string;
  appointmentId?: string;
  barberId: string;
  clientId: string;
  locationId: string;
  rating: number;
  sentiment: ReviewSentiment;
  message: string;
  createdAt: string;
  reviewerName?: string;
  serviceName?: string;
}

export interface TaskItem {
  id: string;
  locationId: string;
  title: string;
  assignee: string;
  status: "open" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
}

export interface InventoryItem {
  id: string;
  locationId: string;
  name: string;
  stock: number;
  reorderAt: number;
}

export interface NotificationItem {
  id: string;
  audience: Role | "all_staff";
  title: string;
  body: string;
  channel: "in_app" | "sms" | "email";
  scheduledFor: string;
  status: "scheduled" | "sent" | "placeholder";
}

export interface AuditLogItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
  severity: "info" | "warning" | "critical";
}

export interface KpiMetric {
  label: string;
  value: string;
  delta: string;
}

export interface RevenuePoint {
  label: string;
  revenue: number;
  appointments: number;
}

export interface PermissionGroup {
  role: Role;
  allows: string[];
  restricted: string[];
}

export interface PaymentCustomerRecord {
  id: string;
  profileId: string;
  provider: PaymentProviderKind;
  providerCustomerId: string;
  defaultPaymentMethodId?: string;
}

export interface SavedPaymentMethodSummary {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface MarketplaceVisibility {
  barberId: string;
  visibilityState: MarketplaceVisibilityState;
  acceptsInstantBookings: boolean;
  featuredRank?: number;
}

export interface FeaturedProfile {
  id: string;
  barberId: string;
  label: string;
}

export interface SearchHistoryEntry {
  id: string;
  clientId: string;
  query: string;
  filters: Record<string, string | number | boolean | undefined>;
  searchedAt: string;
}

export interface ClientPreference {
  clientId: string;
  favoriteShopId?: string;
  preferredLocationId?: string;
  preferredStyleTagIds: string[];
  prefersInstantBooking: boolean;
}

export interface TrendingStyle {
  id: string;
  styleTagId: string;
  regionLabel: string;
  bookingCount: number;
  rank: number;
}

export interface LocationSearchIndexEntry {
  id: string;
  locationId: string;
  shopId?: string;
  barberId?: string;
  latitude: number;
  longitude: number;
  distanceMiles: number;
}

export interface DiscoveryFilters {
  query?: string;
  category?: string;
  locationId?: string;
  styleTagId?: string;
  minRating?: number;
  maxPrice?: number;
  availability?: "any" | "today" | "now";
  specialty?: string;
  maxDistanceMiles?: number;
}

export interface DiscoveryResult {
  barberId: string;
  username: string;
  barberName: string;
  locationId?: string;
  locationLabel?: string;
  profilePhotoUrl?: string;
  galleryPreviewUrls?: string[];
  rating: number;
  reviewCount: number;
  priceRange: [number, number];
  priceRangeLabel?: string;
  nextAvailableAt: string;
  availabilityLabel?: string;
  distanceMiles: number;
  shopName?: string;
  specialties: string[];
  mostBookedService?: string;
  mostBookedServiceId?: string;
  badges: MarketplaceBadge[];
  followCount?: number;
  reputationScore?: number;
  reputationTier?: string;
  rankingLabel?: string;
  profileViews?: number;
  retentionScore?: number;
  activityScore?: number;
  conversionRate?: number;
  trustScore?: number;
  completionRate?: number;
  trustLabel?: string;
  reviewIntegrityLabel?: string;
  featuredLabel?: string;
  boostedLabel?: string;
  cityLabel?: string;
  monetizationEligible?: boolean;
  bookingHref?: string;
}

export interface RecommendedShopView {
  id: string;
  name: string;
  brandLine?: string;
  neighborhood: string;
  city: string;
  state: string;
  address?: string;
  kind?: string;
  activeBarbersCount?: number;
  nextAvailableAt?: string;
  nextAvailableLabel?: string;
  rating?: number;
  reviewCount?: number;
  verifiedLabel?: string;
  bookHref?: string;
  viewHref?: string;
  profilePhotoUrl?: string;
  coverPhotoUrl?: string;
}

export interface MapDiscoveryMarker {
  id: string;
  kind: "barber" | "shop" | "mobile_barber";
  label: string;
  latitude: number;
  longitude: number;
  rating: number;
  priceRangeLabel: string;
  nextAvailableAt: string;
  shopName?: string;
  barberId?: string;
  username?: string;
  distanceMiles?: number;
  trustLabel?: string;
  featuredLabel?: string;
  cityLabel?: string;
  bookingHref?: string;
}

export interface HaircutNowMatch {
  barberId: string;
  username: string;
  barberName: string;
  matchedFrom: "favorite_barber" | "favorite_shop" | "nearby" | "available_now";
  matchReason: string;
  appointmentTime: string;
  locationId: string;
  shopName?: string;
  priceFrom: number;
  rating: number;
}

export interface MarketplaceBookingAttribution {
  appointmentId: string;
  barberId: string;
  username?: string;
  clientId?: string;
  clientEmail?: string;
  locationId?: string;
  sourceKind: MarketplaceSourceKind;
  matchedFrom?: HaircutNowMatch["matchedFrom"];
  discoveryQuery?: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MarketplaceConversionEvent {
  id: string;
  eventType: MarketplaceConversionEventType;
  barberId?: string;
  username?: string;
  clientId?: string;
  clientEmail?: string;
  appointmentId?: string;
  locationId?: string;
  sourceKind: MarketplaceSourceKind;
  sourceReference?: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}




