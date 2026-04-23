import { randomUUID } from "node:crypto";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { isUpcomingAppointmentStatus } from "@/lib/appointments/domain";
import { buildPlatformEventIdempotencyKey, recordRequiredPlatformEvent } from "@/lib/core/platform-events";
import { dismissFinancialAnomaly, readFinancialAnomalyQueue, resolveFinancialAnomaly, syncFinancialAnomalies } from "@/lib/fintech/anomalies";
import { buildOwnerMoneyDashboardSummary } from "@/lib/fintech/tax";
import { buildOwnerMonetizationSummary } from "@/lib/monetization/service";
import {
  ARCHITECT_DEGRADED_WARNING,
  createEmptyPlatformAdminConsolePayload,
  normalizePlatformAdminConsolePayload
} from "@/lib/platform-admin/payload";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import type { LiveOperationsSnapshot, LiveOperationsViewer } from "@/lib/operations/live-state";
import { getOwnerAnalyticsSummary } from "@/lib/operations/metrics";
import { readCashoutReviewQueue } from "@/lib/points/cashout-review";
import { buildOwnerPointsAnalyticsSummary, readPointsStateSnapshot } from "@/lib/points/engine";
import { buildReleaseReadinessSummary, type ReleaseReadinessSummary } from "@/lib/release/readiness";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBarberTrustSummary, getOwnerTrustSummary } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import { getTrustState, setTrustState } from "@/lib/trust/state";
import type { ApprovalStatus, IdentityLane, IdentityOnboardingState, Role, UserAccount } from "@/types/domain";
import type { EngagementState, ReferralStatus } from "@/types/engagement";
import type { CashoutReviewQueueView, FinancialAnomalyQueueView, OwnerMoneyDashboardView } from "@/types/fintech";
import type { OwnerMonetizationSummary } from "@/types/monetization";
import type {
  PlatformAdminAccountStatus,
  PlatformAdminActionClass,
  PlatformAdminActionInput,
  PlatformAdminAuditLogEntry,
  PlatformAdminConsolePayload,
  PlatformAdminMoneyRiskView,
  PlatformAdminShopStatus,
  PlatformAdminShopView,
  PlatformAdminSupportItem,
  PlatformAdminTargetType,
  PlatformAdminUserView,
  PlatformAdminVerificationItem
} from "@/types/platform-admin";
import type { OwnerPointsAnalyticsSummary, PointsState } from "@/types/points";
import type {
  BarberVerificationCategory,
  BarberVerificationRecord,
  ShopVerificationCategory,
  ShopVerificationRecord,
  TrustState,
  VerificationStatus
} from "@/types/trust";

type PlatformAdminControlKey = "account_status" | "shop_status" | "kiosk_enabled" | "ai_manager_enabled";

type PlatformAdminControlRecord = {
  id: string;
  targetType: "user" | "shop";
  targetId: string;
  controlKey: PlatformAdminControlKey;
  controlValue: Record<string, unknown>;
  updatedByUserId: string | null;
  updatedByRole: string | null;
  createdAt: string;
  updatedAt: string;
};

type PlatformAdminControlRow = {
  id: string;
  target_type: "user" | "shop";
  target_id: string;
  control_key: PlatformAdminControlKey;
  control_value: Record<string, unknown> | null;
  updated_by_user_id: string | null;
  updated_by_role: string | null;
  created_at: string;
  updated_at: string;
};

type PlatformAdminAuditLogRow = {
  id: string;
  actor_user_id: string;
  actor_role: string;
  action_class: PlatformAdminActionClass;
  action_type: string;
  target_type: PlatformAdminTargetType;
  target_id: string;
  note: string | null;
  before_summary: string | null;
  after_summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type PlatformAdminControlSnapshot = {
  accountStatuses: Map<string, PlatformAdminAccountStatus>;
  shopStatuses: Map<string, PlatformAdminShopStatus>;
  kioskEnabled: Map<string, boolean>;
  aiManagerEnabled: Map<string, boolean>;
};

type ProductionProfileRow = {
  id: string;
  role: Role | "shop_owner" | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  primary_onboarding_role: IdentityLane | null;
  onboarding_state: IdentityOnboardingState | null;
  created_at?: string | null;
};

type ProductionClientRow = {
  id: string;
  reference_code?: string | null;
  profile_id: string | null;
  loyalty_points?: number | null;
  retention_tag?: string | null;
  created_at?: string | null;
};

type ProductionBarberRow = {
  id: string;
  reference_code?: string | null;
  profile_id: string;
  compensation_model: "commission" | "booth_rent" | string | null;
  barber_subtype?: string | null;
  app_approval_status?: ApprovalStatus | null;
  shop_approval_status?: ApprovalStatus | null;
  created_at?: string | null;
};

type ProductionShopRow = {
  id: string;
  name: string | null;
  owner_profile_id: string | null;
  app_approval_status?: ApprovalStatus | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string | null;
};

type ProductionLocationRow = {
  id: string;
  reference_code?: string | null;
  name: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
};

type ProductionStaffLocationRow = {
  profile_id: string;
  location_id: string;
};

type ProductionBarberShopMembershipRow = {
  barber_reference: string;
  shop_reference: string;
  active: boolean | null;
};

type ProductionReferralEventRow = {
  id: string;
  referrer_client_reference: string;
  referred_client_email: string;
  status: ReferralStatus;
  reward_points: number | string | null;
  created_at: string;
};

type ReferralSummaryCounts = {
  invited: number;
  completed: number;
  credited: number;
};

type ProductionAdminDirectory = {
  profiles: ProductionProfileRow[];
  clients: ProductionClientRow[];
  barbers: ProductionBarberRow[];
  shops: ProductionShopRow[];
  locations: ProductionLocationRow[];
  staffLocations: ProductionStaffLocationRow[];
  memberships: ProductionBarberShopMembershipRow[];
  profilesById: Map<string, ProductionProfileRow>;
  clientsByProfileId: Map<string, ProductionClientRow>;
  barbersByProfileId: Map<string, ProductionBarberRow>;
  barbersByReference: Map<string, ProductionBarberRow>;
  shopsById: Map<string, ProductionShopRow>;
  shopsByOwnerProfileId: Map<string, ProductionShopRow>;
  locationsById: Map<string, ProductionLocationRow>;
  locationIdsByProfileId: Map<string, string[]>;
};

type ProductionAdminDirectoryRows = {
  profiles?: ProductionProfileRow[] | null;
  clients?: ProductionClientRow[] | null;
  barbers?: ProductionBarberRow[] | null;
  shops?: ProductionShopRow[] | null;
  locations?: ProductionLocationRow[] | null;
  staffLocations?: ProductionStaffLocationRow[] | null;
  memberships?: ProductionBarberShopMembershipRow[] | null;
};

const DEFAULT_ACCOUNT_STATUS: PlatformAdminAccountStatus = "active";
const DEFAULT_SHOP_STATUS: PlatformAdminShopStatus = "active";

let demoPlatformAdminControls: PlatformAdminControlRecord[] = [];
let demoPlatformAdminAuditLog: PlatformAdminAuditLogEntry[] = [];
let productionAdminDirectoryRowsOverlay: ProductionAdminDirectoryRows | null = null;
let productionReferralEventRowsOverlay: ProductionReferralEventRow[] | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function logPlatformAdminServerError(context: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`[Architect Console] ${context}`, {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return;
  }

  console.error(`[Architect Console] ${context}`, error);
}

function pushArchitectWarning(warnings: string[], message: string) {
  const next = message.trim();
  if (!next || warnings.includes(next)) {
    return;
  }

  warnings.push(next);
}

function cloneFallback<T>(value: T): T {
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return clone(value);
  }

  return value;
}

async function safeArchitectRead<T>(input: {
  context: string;
  warning: string;
  warnings: string[];
  fallback: T;
  load: () => Promise<T>;
}) {
  try {
    const value = await input.load();
    if (value === null || value === undefined) {
      pushArchitectWarning(input.warnings, input.warning);
      return cloneFallback(input.fallback);
    }

    return value;
  } catch (error) {
    logPlatformAdminServerError(input.context, error);
    pushArchitectWarning(input.warnings, input.warning);
    return cloneFallback(input.fallback);
  }
}

function createEmptyLiveOperationsSnapshot(): LiveOperationsSnapshot {
  return {
    mode: isSupabaseEnabled() ? "supabase" : "demo",
    fetchedAt: new Date().toISOString(),
    appointments: [],
    clients: [],
    walkIns: [],
    workflowEvents: [],
    compensationSnapshots: [],
    ownerAnalytics: []
  };
}

function createEmptyEngagementState(): EngagementState {
  return {
    loyaltyAccounts: [],
    loyaltyTransactions: [],
    loyaltyRewardRules: [],
    referralCodes: [],
    referralEvents: [],
    barberFollows: [],
    engagementEvents: [],
    rebookingCycles: [],
    rebookingRecommendations: [],
    notificationPreferences: [],
    notifications: [],
    reputationScores: [],
    rankingSnapshots: [],
    growthRecommendations: []
  };
}

function createEmptyTrustState(): TrustState {
  return {
    barberVerifications: [],
    shopVerifications: [],
    verificationDocuments: [],
    trustBadges: [],
    reviewModeration: [],
    safetyReports: [],
    reportEvents: [],
    disputes: [],
    disputeEvents: [],
    riskFlags: [],
    moderationActions: [],
    reliabilityScores: []
  };
}

function createEmptyPointsState(): PointsState {
  return {
    balances: [],
    transactions: [],
    programRules: [],
    campaigns: [],
    eligibilitySnapshots: [],
    cashoutRequests: []
  };
}

function createEmptyCashoutQueue(): CashoutReviewQueueView {
  return {
    summary: {
      requested: 0,
      underReview: 0,
      approved: 0,
      paid: 0,
      failed: 0,
      rejected: 0,
      reversed: 0
    },
    requests: []
  };
}

function createEmptyAnomalyQueue(): FinancialAnomalyQueueView {
  return {
    summary: {
      open: 0,
      investigating: 0,
      resolved: 0,
      dismissed: 0,
      critical: 0
    },
    items: []
  };
}

function createEmptyMonetizationSummary(): OwnerMonetizationSummary {
  return {
    revenue: {
      grossRevenue: 0,
      platformFeeRevenue: 0,
      processorFeeVisibility: 0,
      subscriptionRevenue: 0,
      repeatClientRevenue: 0,
      retainedRevenueShare: 0,
      revenueAtRisk: 0
    },
    subscriptions: {
      totalTracked: 0,
      active: 0,
      billingAttention: 0,
      entitlementReady: 0,
      subscriptionRevenue: 0,
      rows: []
    },
    promotions: {
      totalRedemptions: 0,
      totalDiscountImpact: 0,
      attributedRevenue: 0,
      topOffers: []
    },
    growth: {
      referralConversions: 0,
      referralConversionRevenue: 0,
      loyaltyParticipants: 0,
      loyaltyRedemptions: 0,
      loyaltyRevenue: 0,
      rebookingInfluencedRevenue: 0
    },
    barberContribution: []
  };
}

function createEmptyPointsAnalyticsSummary(): OwnerPointsAnalyticsSummary {
  return {
    issuedPoints: 0,
    pendingPoints: 0,
    unlockedPoints: 0,
    redeemedPoints: 0,
    cashedOutPoints: 0,
    pointLiabilityPoints: 0,
    pointLiabilityValue: 0,
    reversedPoints: 0,
    issuedInAppValue: 0,
    redeemedInAppValue: 0,
    cashedOutValue: 0,
    rewardSpendRate: 0,
    redemptionRate: 0,
    cashoutRate: 0,
    reversalRate: 0,
    fraudReviewRate: 0,
    referralRewardTransactions: 0,
    referralConversionRate: 0,
    ltvUplift: 0,
    issuanceByEventType: [],
    topCampaigns: []
  };
}

function createEmptyOwnerMoneyDashboardSummary(): OwnerMoneyDashboardView {
  return {
    revenueBreakdown: {
      grossRevenue: 0,
      netRevenue: 0,
      platformFeeRevenue: 0,
      processorFeeVisibility: 0,
      subscriptionRevenue: 0
    },
    payoutFlow: {
      pendingAmount: 0,
      queuedAmount: 0,
      inTransitAmount: 0,
      paidAmount: 0,
      failedAmount: 0,
      reversedAmount: 0,
      avgPayoutDelayHours: 0
    },
    boothRent: {
      paid: 0,
      due: 0,
      overdue: 0,
      overdueAmount: 0
    },
    pointsCostVsRevenue: 0,
    refundRate: 0,
    revenuePerUser: 0,
    barberEarningsGrowth: 0,
    cashoutQueue: createEmptyCashoutQueue(),
    anomalies: createEmptyAnomalyQueue(),
    scheduledJobs: {
      summary: {
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        skipped: 0
      },
      recentRuns: [],
      latestByJob: {}
    },
    exports: {
      taxSummaryPath: "/exports/tax-summary.csv",
      payoutsPath: "/exports/payouts.csv",
      revenuePath: "/exports/revenue.csv",
      incentivesPath: "/exports/incentives.csv"
    },
    recentCashouts: []
  };
}

function createEmptyReleaseReadinessSummary(): ReleaseReadinessSummary {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      readyCount: 0,
      attentionCount: 0
    },
    runtime: {
      appUrl: "",
      authMode: "unknown",
      mobileRuntime: "unknown",
      androidPackageName: "",
      iosBundleId: "",
      capacitorServerUrl: null
    },
    bootstrap: {
      appName: "BVRB3R",
      scheme: "bvrb3r",
      runtimeMode: "browser",
      universalLinkHost: "",
      iosBundleId: undefined,
      androidPackageName: undefined,
      appStoreId: undefined,
      startLinks: [],
      pushBridge: {
        webPushConfigured: false,
        apnsBridgeReady: false,
        fcmBridgeReady: false,
        supportedProviders: []
      },
      tokenBridge: {
        registrationApi: "/api/mobile/native/tokens",
        revokeApi: "/api/mobile/native/tokens",
        storageMode: "server_hashed",
        supportsApnsRegistration: false,
        supportsFcmRegistration: false,
        refreshFlowReady: false
      },
      deliveryProviders: {
        emailConfigured: false,
        smsConfigured: false,
        webPushConfigured: false
      },
      releaseCandidate: {
        qaDocs: [],
        storeDocs: [],
        certificationDocs: []
      },
      launchAssets: []
    },
    checks: [],
    docs: {
      mobileQa: "/MOBILE_DEVICE_QA.md",
      releaseCertification: "/RELEASE_CANDIDATE_CERTIFICATION.md",
      storeLaunch: "/STORE_LAUNCH_CHECKLIST.md"
    }
  };
}

function createEmptyOwnerTrustSummary(): ReturnType<typeof getOwnerTrustSummary> {
  return {
    shopStatuses: [],
    staffVerification: {
      verified: 0,
      pending: 0,
      expired: 0,
      rejected: 0,
      unverified: 0
    },
    openReports: 0,
    openDisputes: 0,
    highRiskFlags: 0,
    reviewIntegrityAlerts: 0,
    pendingBarbers: [],
    recentQueue: [],
    shopTrustBadges: []
  };
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function createEmptyProductionAdminDirectory(): ProductionAdminDirectory {
  return {
    profiles: [],
    clients: [],
    barbers: [],
    shops: [],
    locations: [],
    staffLocations: [],
    memberships: [],
    profilesById: new Map(),
    clientsByProfileId: new Map(),
    barbersByProfileId: new Map(),
    barbersByReference: new Map(),
    shopsById: new Map(),
    shopsByOwnerProfileId: new Map(),
    locationsById: new Map(),
    locationIdsByProfileId: new Map()
  };
}

function productionBarberReference(row?: ProductionBarberRow | null) {
  return row?.reference_code ?? row?.id ?? "";
}

function buildProductionAdminDirectory(input: ProductionAdminDirectoryRows): ProductionAdminDirectory {
  const directory = createEmptyProductionAdminDirectory();

  directory.profiles = input.profiles ?? [];
  directory.clients = input.clients ?? [];
  directory.barbers = input.barbers ?? [];
  directory.shops = input.shops ?? [];
  directory.locations = input.locations ?? [];
  directory.staffLocations = input.staffLocations ?? [];
  directory.memberships = input.memberships ?? [];

  for (const profile of directory.profiles) {
    directory.profilesById.set(profile.id, profile);
  }

  for (const client of directory.clients) {
    if (client.profile_id) {
      directory.clientsByProfileId.set(client.profile_id, client);
    }
  }

  for (const barber of directory.barbers) {
    directory.barbersByProfileId.set(barber.profile_id, barber);
    const reference = productionBarberReference(barber);
    if (reference) {
      directory.barbersByReference.set(reference, barber);
    }
  }

  for (const shop of directory.shops) {
    directory.shopsById.set(shop.id, shop);
    if (shop.owner_profile_id) {
      directory.shopsByOwnerProfileId.set(shop.owner_profile_id, shop);
    }
  }

  for (const location of directory.locations) {
    directory.locationsById.set(location.id, location);
  }

  for (const staffLocation of directory.staffLocations) {
    const current = directory.locationIdsByProfileId.get(staffLocation.profile_id) ?? [];
    if (!current.includes(staffLocation.location_id)) {
      current.push(staffLocation.location_id);
    }
    directory.locationIdsByProfileId.set(staffLocation.profile_id, current);
  }

  return directory;
}

async function readProductionAdminDirectory(warnings: string[]): Promise<ProductionAdminDirectory> {
  if (productionAdminDirectoryRowsOverlay) {
    return buildProductionAdminDirectory(clone(productionAdminDirectoryRowsOverlay));
  }

  const supabase = getSupabase();
  if (!supabase) {
    return createEmptyProductionAdminDirectory();
  }

  try {
    const [profilesResult, clientsResult, barbersResult, shopsResult, locationsResult, staffLocationsResult, membershipsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, role, full_name, email, phone, primary_onboarding_role, onboarding_state, created_at"),
      supabase
        .from("clients")
        .select("id, reference_code, profile_id, loyalty_points, retention_tag, created_at"),
      supabase
        .from("barbers")
        .select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, created_at"),
      supabase
        .from("shops")
        .select("id, name, owner_profile_id, app_approval_status, neighborhood, city, state, phone, address, created_at"),
      supabase
        .from("locations")
        .select("id, reference_code, name, neighborhood, city, state"),
      supabase
        .from("staff_locations")
        .select("profile_id, location_id"),
      supabase
        .from("barber_shop_memberships")
        .select("barber_reference, shop_reference, active")
    ]);

    const requiredResults = [profilesResult, clientsResult, barbersResult, shopsResult, locationsResult, staffLocationsResult];
    for (const result of requiredResults) {
      if (result.error) {
        throw result.error;
      }
    }

    if (membershipsResult.error && !isMissingTableError(membershipsResult.error)) {
      throw membershipsResult.error;
    }

    if (membershipsResult.error && isMissingTableError(membershipsResult.error)) {
      pushArchitectWarning(warnings, "Shop membership rows are unavailable; active barber counts may be incomplete.");
    }

    return buildProductionAdminDirectory({
      profiles: profilesResult.data as ProductionProfileRow[] | null,
      clients: clientsResult.data as ProductionClientRow[] | null,
      barbers: barbersResult.data as ProductionBarberRow[] | null,
      shops: shopsResult.data as ProductionShopRow[] | null,
      locations: locationsResult.data as ProductionLocationRow[] | null,
      staffLocations: staffLocationsResult.data as ProductionStaffLocationRow[] | null,
      memberships: membershipsResult.error ? [] : membershipsResult.data as ProductionBarberShopMembershipRow[] | null
    });
  } catch (error) {
    logPlatformAdminServerError("reading production architect directory", error);
    pushArchitectWarning(warnings, "Production account directory is unavailable; Architect account and shop lists are showing true empty states.");
    return createEmptyProductionAdminDirectory();
  }
}

function isMissingTableError(error: { code?: string | null; message?: string | null }) {
  return error.code === "42P01" || `${error.message ?? ""}`.toLowerCase().includes("does not exist");
}

function createEmptyReferralSummaryCounts(): ReferralSummaryCounts {
  return {
    invited: 0,
    completed: 0,
    credited: 0
  };
}

async function readProductionReferralEvents(warnings: string[]): Promise<ProductionReferralEventRow[]> {
  if (productionReferralEventRowsOverlay) {
    return clone(productionReferralEventRowsOverlay);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const result = await supabase
    .from("referral_events")
    .select("id, referrer_client_reference, referred_client_email, status, reward_points, created_at")
    .order("created_at", { ascending: false });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      pushArchitectWarning(warnings, "Referral event storage is unavailable; referral support context may be incomplete.");
      return [];
    }

    throw result.error;
  }

  return (result.data ?? []) as ProductionReferralEventRow[];
}

function buildReferralSummaryByClientId(referralEvents: ProductionReferralEventRow[]) {
  const summaryByClientId = new Map<string, ReferralSummaryCounts>();

  for (const event of referralEvents) {
    const current = summaryByClientId.get(event.referrer_client_reference) ?? createEmptyReferralSummaryCounts();
    current.invited += 1;
    if (event.status === "completed" || event.status === "credited") {
      current.completed += 1;
    }
    if (event.status === "credited") {
      current.credited += 1;
    }
    summaryByClientId.set(event.referrer_client_reference, current);
  }

  return summaryByClientId;
}

function normalizeVerificationLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function mapControlRow(row: PlatformAdminControlRow): PlatformAdminControlRecord {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    controlKey: row.control_key,
    controlValue: clone(row.control_value ?? {}),
    updatedByUserId: row.updated_by_user_id,
    updatedByRole: row.updated_by_role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAuditLogRow(row: PlatformAdminAuditLogRow): PlatformAdminAuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    actionClass: row.action_class,
    actionType: row.action_type,
    targetType: row.target_type,
    targetId: row.target_id,
    note: row.note,
    beforeSummary: row.before_summary,
    afterSummary: row.after_summary,
    metadata: clone(row.metadata ?? {}),
    createdAt: row.created_at
  };
}

function toControlUpsert(record: PlatformAdminControlRecord) {
  return {
    id: record.id,
    target_type: record.targetType,
    target_id: record.targetId,
    control_key: record.controlKey,
    control_value: record.controlValue,
    updated_by_user_id: record.updatedByUserId,
    updated_by_role: record.updatedByRole,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

function toAuditInsert(entry: PlatformAdminAuditLogEntry) {
  return {
    id: entry.id,
    actor_user_id: entry.actorUserId,
    actor_role: entry.actorRole,
    action_class: entry.actionClass,
    action_type: entry.actionType,
    target_type: entry.targetType,
    target_id: entry.targetId,
    note: entry.note ?? null,
    before_summary: entry.beforeSummary ?? null,
    after_summary: entry.afterSummary ?? null,
    metadata: entry.metadata,
    created_at: entry.createdAt
  };
}

async function readAllControls(warnings?: string[]) {
  const supabase = getSupabase();
  if (!supabase) {
    return clone(demoPlatformAdminControls);
  }

  const result = await supabase
    .from("platform_admin_controls")
    .select("id, target_type, target_id, control_key, control_value, updated_by_user_id, updated_by_role, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      if (warnings) {
        pushArchitectWarning(warnings, "Architect control storage is unavailable; using fallback founder-safe memory mode.");
      }
      return clone(demoPlatformAdminControls);
    }

    throw result.error;
  }

  return ((result.data ?? []) as PlatformAdminControlRow[]).map(mapControlRow);
}

async function readAuditLog(warnings?: string[]) {
  const supabase = getSupabase();
  if (!supabase) {
    return clone(demoPlatformAdminAuditLog).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const result = await supabase
    .from("platform_admin_audit_logs")
    .select("id, actor_user_id, actor_role, action_class, action_type, target_type, target_id, note, before_summary, after_summary, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (result.error) {
    if (isMissingTableError(result.error)) {
      if (warnings) {
        pushArchitectWarning(warnings, "Architect audit storage is unavailable; recent audit history may be incomplete.");
      }
      return clone(demoPlatformAdminAuditLog).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }

    throw result.error;
  }

  return ((result.data ?? []) as PlatformAdminAuditLogRow[]).map(mapAuditLogRow);
}

async function persistControl(record: PlatformAdminControlRecord) {
  const supabase = getSupabase();
  if (!supabase) {
    const index = demoPlatformAdminControls.findIndex((entry) =>
      entry.targetType === record.targetType
      && entry.targetId === record.targetId
      && entry.controlKey === record.controlKey
    );

    if (index >= 0) {
      demoPlatformAdminControls[index] = clone(record);
    } else {
      demoPlatformAdminControls.unshift(clone(record));
    }
    return;
  }

  const result = await supabase
    .from("platform_admin_controls")
    .upsert(toControlUpsert(record), { onConflict: "target_type,target_id,control_key" });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      const index = demoPlatformAdminControls.findIndex((entry) =>
        entry.targetType === record.targetType
        && entry.targetId === record.targetId
        && entry.controlKey === record.controlKey
      );
      if (index >= 0) {
        demoPlatformAdminControls[index] = clone(record);
      } else {
        demoPlatformAdminControls.unshift(clone(record));
      }
      return;
    }

    throw result.error;
  }
}

async function appendAuditLog(entry: PlatformAdminAuditLogEntry) {
  const supabase = getSupabase();
  if (!supabase) {
    demoPlatformAdminAuditLog.unshift(clone(entry));
    demoPlatformAdminAuditLog = demoPlatformAdminAuditLog.slice(0, 200);
    return;
  }

  const result = await supabase.from("platform_admin_audit_logs").insert(toAuditInsert(entry));
  if (result.error) {
    if (isMissingTableError(result.error)) {
      demoPlatformAdminAuditLog.unshift(clone(entry));
      demoPlatformAdminAuditLog = demoPlatformAdminAuditLog.slice(0, 200);
      return;
    }

    throw result.error;
  }
}

export function assertPlatformAdminAccess(user: UserAccount) {
  assertPlatformAdmin(user);
}

export async function recordPlatformAdminAuditLog(
  entry: Omit<PlatformAdminAuditLogEntry, "id" | "createdAt"> & { id?: string; createdAt?: string }
) {
  await appendAuditLog({
    ...entry,
    id: entry.id ?? `platform-audit-${randomUUID().slice(0, 8)}`,
    createdAt: entry.createdAt ?? new Date().toISOString()
  });
}

export async function readPlatformAdminAuditLogEntries() {
  return readAuditLog();
}

function buildControlSnapshot(records: PlatformAdminControlRecord[]): PlatformAdminControlSnapshot {
  const accountStatuses = new Map<string, PlatformAdminAccountStatus>();
  const shopStatuses = new Map<string, PlatformAdminShopStatus>();
  const kioskEnabled = new Map<string, boolean>();
  const aiManagerEnabled = new Map<string, boolean>();

  for (const record of records) {
    if (record.targetType === "user" && record.controlKey === "account_status") {
      accountStatuses.set(record.targetId, (record.controlValue.status as PlatformAdminAccountStatus | undefined) ?? DEFAULT_ACCOUNT_STATUS);
      continue;
    }

    if (record.targetType === "shop" && record.controlKey === "shop_status") {
      shopStatuses.set(record.targetId, (record.controlValue.status as PlatformAdminShopStatus | undefined) ?? DEFAULT_SHOP_STATUS);
      continue;
    }

    if (record.targetType === "shop" && record.controlKey === "kiosk_enabled") {
      kioskEnabled.set(record.targetId, Boolean(record.controlValue.enabled ?? true));
      continue;
    }

    if (record.targetType === "shop" && record.controlKey === "ai_manager_enabled") {
      aiManagerEnabled.set(record.targetId, Boolean(record.controlValue.enabled ?? true));
    }
  }

  return {
    accountStatuses,
    shopStatuses,
    kioskEnabled,
    aiManagerEnabled
  };
}

function getAccountStatus(snapshot: PlatformAdminControlSnapshot, userId: string): PlatformAdminAccountStatus {
  return snapshot.accountStatuses.get(userId) ?? DEFAULT_ACCOUNT_STATUS;
}

function getShopStatus(snapshot: PlatformAdminControlSnapshot, shopId: string): PlatformAdminShopStatus {
  return snapshot.shopStatuses.get(shopId) ?? DEFAULT_SHOP_STATUS;
}

function isShopControlEnabled(snapshot: PlatformAdminControlSnapshot, shopId: string, key: "kiosk" | "ai_manager") {
  const map = key === "kiosk" ? snapshot.kioskEnabled : snapshot.aiManagerEnabled;
  return map.get(shopId) ?? true;
}

function getPointsRoleForUser(user: UserAccount): "client" | "barber" | "owner" | null {
  if (user.role === "client") {
    return "client";
  }

  if (user.role === "commission_barber" || user.role === "booth_rent_barber" || (user.role === "manager" && user.barberId)) {
    return "barber";
  }

  if (user.role === "owner") {
    return "owner";
  }

  return null;
}

function getRuntimeRoleForProductionProfile(profile: ProductionProfileRow, barber?: ProductionBarberRow): Role {
  if (profile.primary_onboarding_role === "platform_admin" || profile.role === "platform_admin") {
    return "platform_admin";
  }

  if (profile.primary_onboarding_role === "shop_owner" || profile.role === "shop_owner") {
    return "owner";
  }

  if (profile.primary_onboarding_role === "barber" || barber) {
    return barber?.compensation_model === "booth_rent" ? "booth_rent_barber" : "commission_barber";
  }

  return (profile.role ?? "client") as Role;
}

function getProfileTitle(role: Role, primaryRole?: IdentityLane | null) {
  if (primaryRole === "shop_owner") return "Shop owner";
  if (primaryRole === "barber") return "Barber";
  if (primaryRole === "platform_admin") return "Platform admin";
  return role.replaceAll("_", " ");
}

function buildProductionUserAccount(profile: ProductionProfileRow, directory: ProductionAdminDirectory): UserAccount {
  const barber = directory.barbersByProfileId.get(profile.id);
  const client = directory.clientsByProfileId.get(profile.id);
  const ownedShop = directory.shopsByOwnerProfileId.get(profile.id);
  const role = getRuntimeRoleForProductionProfile(profile, barber);

  return {
    id: profile.id,
    role,
    email: profile.email ?? "",
    password: "",
    name: profile.full_name ?? profile.email ?? profile.id,
    title: getProfileTitle(role, profile.primary_onboarding_role),
    locationIds: directory.locationIdsByProfileId.get(profile.id) ?? [],
    phone: profile.phone ?? undefined,
    primaryOnboardingRole: profile.primary_onboarding_role ?? undefined,
    onboardingState: profile.onboarding_state ?? undefined,
    barberId: productionBarberReference(barber) || undefined,
    barberSubtype: barber?.barber_subtype as UserAccount["barberSubtype"],
    clientId: client?.reference_code ?? client?.id,
    ownedShopId: ownedShop?.id,
    ownedShopName: ownedShop?.name ?? undefined,
    appApprovalStatus: barber?.app_approval_status ?? ownedShop?.app_approval_status ?? undefined,
    shopApprovalStatus: barber?.shop_approval_status ?? undefined
  };
}

function getRelatedShopIds(user: UserAccount, directory: ProductionAdminDirectory) {
  const shopIds = new Set<string>();
  if (user.ownedShopId) {
    shopIds.add(user.ownedShopId);
  }

  if (user.barberId) {
    for (const membership of directory.memberships) {
      if (membership.barber_reference === user.barberId && membership.active !== false) {
        shopIds.add(membership.shop_reference);
      }
    }
  }

  for (const locationId of user.locationIds) {
    const location = directory.locationsById.get(locationId);
    if (location?.reference_code && directory.shopsById.has(location.reference_code)) {
      shopIds.add(location.reference_code);
    }
  }

  return Array.from(shopIds);
}

function getRoleLabel(user: UserAccount) {
  if (isPlatformAdminUser(user)) {
    return "Platform admin";
  }

  if (user.primaryOnboardingRole === "shop_owner") {
    return "Shop owner";
  }

  if (user.primaryOnboardingRole === "barber") {
    return user.role === "booth_rent_barber" ? "Booth-rent barber" : "Commission barber";
  }

  return user.role.replaceAll("_", " ");
}

function getBarberVerificationItems(state: TrustState, barberId?: string): PlatformAdminVerificationItem[] {
  if (!barberId) {
    return [];
  }

  return getBarberTrustSummary(state, barberId).verificationItems.map((item) => ({
    category: item.category,
    label: item.label,
    status: item.status
  }));
}

function getShopVerificationItems(state: TrustState, shopId: string): PlatformAdminVerificationItem[] {
  return state.shopVerifications
    .filter((record) => record.shopId === shopId)
    .map((record) => ({
      category: record.category,
      label: normalizeVerificationLabel(record.category),
      status: record.verificationStatus
    }));
}

function getVerificationStatusForUser(user: UserAccount, trustState: TrustState, directory: ProductionAdminDirectory) {
  if (user.barberId) {
    return getBarberTrustSummary(trustState, user.barberId).overallStatus;
  }

  const relatedShopId = getRelatedShopIds(user, directory)[0];
  if (relatedShopId) {
    const records = trustState.shopVerifications.filter((record) => record.shopId === relatedShopId);
    if (!records.length) {
      return "unverified";
    }

    if (records.every((record) => record.verificationStatus === "verified")) {
      return "verified";
    }

    if (records.some((record) => record.verificationStatus === "pending")) {
      return "pending";
    }

    if (records.some((record) => record.verificationStatus === "rejected")) {
      return "rejected";
    }

    if (records.some((record) => record.verificationStatus === "expired")) {
      return "expired";
    }
  }

  return "profile_only";
}

function getShopVerificationStatus(state: TrustState, shopId: string) {
  const records = state.shopVerifications.filter((record) => record.shopId === shopId);
  if (!records.length) {
    return "unverified";
  }

  if (records.every((record) => record.verificationStatus === "verified")) {
    return "verified";
  }

  if (records.some((record) => record.verificationStatus === "pending")) {
    return "pending";
  }

  if (records.some((record) => record.verificationStatus === "rejected")) {
    return "rejected";
  }

  if (records.some((record) => record.verificationStatus === "expired")) {
    return "expired";
  }

  return "unverified";
}

function getUserPhone(user: UserAccount) {
  return user.phone;
}

function getShopLabel(shopId: string, directory: ProductionAdminDirectory) {
  return directory.shopsById.get(shopId)?.name ?? shopId;
}

function getLocationLabel(locationId: string, directory?: ProductionAdminDirectory) {
  const location = directory?.locationsById.get(locationId);
  return location ? `${location.name ?? location.id} - ${location.city ?? "Location"}` : locationId;
}

function getBookingSummaryForUser(user: UserAccount, appointments: LiveOperationsSnapshot["appointments"] = []) {
  const relevantAppointments = appointments.filter((appointment) => {
    if (user.clientId) {
      return appointment.clientId === user.clientId;
    }

    if (user.barberId) {
      return appointment.barberId === user.barberId;
    }

    return appointment.locationId && user.locationIds.includes(appointment.locationId);
  });

  return {
    completed: relevantAppointments.filter((appointment) => appointment.status === "completed").length,
    active: relevantAppointments.filter((appointment) => isUpcomingAppointmentStatus(appointment.status)).length,
    cancelled: relevantAppointments.filter((appointment) => appointment.status === "cancelled" || appointment.status === "no_show").length,
    lifetimeValue: roundCurrency(
      relevantAppointments
        .filter((appointment) => appointment.status === "completed")
        .reduce((sum, appointment) => sum + (appointment.grandTotal ?? appointment.totalAmount), 0)
    )
  };
}

function getReferralSummaryForUser(user: UserAccount, referralSummaryByClientId: Map<string, ReferralSummaryCounts>) {
  if (!user.clientId) {
    return createEmptyReferralSummaryCounts();
  }

  return referralSummaryByClientId.get(user.clientId) ?? createEmptyReferralSummaryCounts();
}

function getPointsSummaryForUser(
  user: UserAccount,
  pointsState: Awaited<ReturnType<typeof readPointsStateSnapshot>>
) {
  const role = getPointsRoleForUser(user);
  if (!role) {
    return {
      totalPoints: 0,
      unlockedPoints: 0,
      pendingPoints: 0
    };
  }

  const balance = pointsState.balances.find((entry) => entry.userId === user.id && entry.role === role);
  return {
    totalPoints: balance?.totalPoints ?? 0,
    unlockedPoints: balance?.unlockedPoints ?? 0,
    pendingPoints: balance?.pendingPoints ?? 0
  };
}

function buildAccountHealth(input: {
  user: UserAccount;
  accountStatus: PlatformAdminAccountStatus;
  trustState: TrustState;
  cashoutQueue: Awaited<ReturnType<typeof readCashoutReviewQueue>>;
  anomalyQueue: FinancialAnomalyQueueView;
}) {
  const health: string[] = [];

  if (input.accountStatus !== "active") {
    health.push(`Account ${input.accountStatus.replaceAll("_", " ")}`);
  }

  if (input.user.barberId) {
    const trust = getBarberTrustSummary(input.trustState, input.user.barberId);
    if (trust.overallStatus !== "verified") {
      health.push(`Trust ${trust.overallStatus}`);
    }

    const cashoutAttention = input.cashoutQueue.requests.find((request) =>
      request.userId === input.user.id
      && ["requested", "under_review", "failed"].includes(request.status)
    );
    if (cashoutAttention) {
      health.push(`Cash-out ${cashoutAttention.status.replaceAll("_", " ")}`);
    }

  }

  if (input.user.clientId) {
    const riskFlag = input.trustState.riskFlags.find((flag) =>
      flag.entityType === "client"
      && flag.entityId === input.user.clientId
      && flag.open
    );
    if (riskFlag) {
      health.push(`Risk ${riskFlag.severity}`);
    }
  }

  if (input.user.role === "owner" || input.user.role === "manager" || input.user.role === "front_desk") {
    const unresolved = input.anomalyQueue.items.find((item) =>
      item.status !== "resolved"
      && item.status !== "dismissed"
      && item.locationId
      && input.user.locationIds.includes(item.locationId)
    );
    if (unresolved) {
      health.push("Financial anomaly open");
    }
  }

  if (!health.length) {
    health.push("Healthy");
  }

  return health;
}

function buildSupportFlags(input: {
  user: UserAccount;
  trustState: TrustState;
  anomalyQueue: FinancialAnomalyQueueView;
}) {
  const flags: string[] = [];

  if (input.user.barberId) {
    const trust = getBarberTrustSummary(input.trustState, input.user.barberId);
    if (trust.openDisputes) {
      flags.push(`${trust.openDisputes} open disputes`);
    }

    if (trust.openReports) {
      flags.push(`${trust.openReports} open reports`);
    }
  }

  if (input.user.clientId) {
    const clientRisk = input.trustState.riskFlags.find((flag) =>
      flag.entityType === "client"
      && flag.entityId === input.user.clientId
      && flag.open
    );
    if (clientRisk) {
      flags.push(clientRisk.signalType.replaceAll("_", " "));
    }
  }

  const relatedAnomaly = input.anomalyQueue.items.find((item) =>
    item.userId === input.user.id
    || (input.user.barberId && item.barberId === input.user.barberId)
  );
  if (relatedAnomaly) {
    flags.push(relatedAnomaly.summary);
  }

  return flags;
}

function buildUsersView(input: {
  directory: ProductionAdminDirectory;
  trustState: TrustState;
  referralSummaryByClientId: Map<string, ReferralSummaryCounts>;
  pointsState: Awaited<ReturnType<typeof readPointsStateSnapshot>>;
  accountControls: PlatformAdminControlSnapshot;
  anomalyQueue: FinancialAnomalyQueueView;
  cashoutQueue: Awaited<ReturnType<typeof readCashoutReviewQueue>>;
  appointments: LiveOperationsSnapshot["appointments"];
}): PlatformAdminUserView[] {
  return input.directory.profiles.map((profile) => {
    const user = buildProductionUserAccount(profile, input.directory);
    const accountStatus = isPlatformAdminUser(user) ? "active" : getAccountStatus(input.accountControls, user.id);
    const verificationItems = user.barberId
      ? getBarberVerificationItems(input.trustState, user.barberId)
      : getRelatedShopIds(user, input.directory).flatMap((shopId) => getShopVerificationItems(input.trustState, shopId));

    return {
      id: user.id,
      authUserId: user.id,
      barberId: user.barberId,
      clientId: user.clientId,
      name: user.name,
      email: user.email,
      phone: getUserPhone(user),
      primaryRole: getRoleLabel(user),
      title: user.title,
      accountStatus,
      verificationStatus: getVerificationStatusForUser(user, input.trustState, input.directory),
      shopRelationships: getRelatedShopIds(user, input.directory).map((shopId) => getShopLabel(shopId, input.directory)),
      accountHealth: buildAccountHealth({
        user,
        accountStatus,
        trustState: input.trustState,
        cashoutQueue: input.cashoutQueue,
        anomalyQueue: input.anomalyQueue
      }),
      bookingSummary: getBookingSummaryForUser(user, input.appointments),
      pointsSummary: getPointsSummaryForUser(user, input.pointsState),
      referralSummary: getReferralSummaryForUser(user, input.referralSummaryByClientId),
      verificationItems,
      supportFlags: buildSupportFlags({
        user,
        trustState: input.trustState,
        anomalyQueue: input.anomalyQueue
      }),
      canManageAccess: !isPlatformAdminUser(user),
      isPlatformAdmin: isPlatformAdminUser(user)
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function buildTodayRevenueByLocation(appointments: LiveOperationsSnapshot["appointments"] = []) {
  return appointments
    .filter((appointment) => appointment.status === "completed")
    .reduce((map, appointment) => {
      map.set(
        appointment.locationId,
        roundCurrency((map.get(appointment.locationId) ?? 0) + (appointment.grandTotal ?? appointment.totalAmount))
      );
      return map;
    }, new Map<string, number>());
}

function buildShopsView(input: {
  directory: ProductionAdminDirectory;
  trustState: TrustState;
  controlSnapshot: PlatformAdminControlSnapshot;
  todayRevenueByLocation: Map<string, number>;
  monetization: Awaited<ReturnType<typeof buildOwnerMonetizationSummary>>;
  ownerTrust: ReturnType<typeof getOwnerTrustSummary>;
}): PlatformAdminShopView[] {
  return input.directory.shops.map((shop) => {
    const locationIds = input.directory.locations
      .filter((location) => location.reference_code === shop.id || location.id === shop.id)
      .map((location) => location.id);
    const locationLabels = locationIds.map((locationId) => getLocationLabel(locationId, input.directory));
    const activeBarbers = input.directory.memberships.filter((membership) => {
      const barber = input.directory.barbersByReference.get(membership.barber_reference);
      if (!barber) {
        return false;
      }
      return membership.shop_reference === shop.id
        && membership.active !== false
        && getAccountStatus(input.controlSnapshot, barber.profile_id) === "active";
    }).length;
    const revenueToday = roundCurrency(
      locationIds.reduce((sum, locationId) => sum + (input.todayRevenueByLocation.get(locationId) ?? 0), 0)
    );
    const billingHealth = input.monetization.subscriptions.billingAttention
      ? `${input.monetization.subscriptions.billingAttention} billing row${input.monetization.subscriptions.billingAttention === 1 ? "" : "s"} need attention`
      : "Healthy";
    const rebookingOpportunity = input.monetization.growth.rebookingInfluencedRevenue > 0
      ? `${roundCurrency(input.monetization.growth.rebookingInfluencedRevenue)} in rebooking-influenced revenue`
      : "Retention pressure stable";

    return {
      id: shop.id,
      name: shop.name ?? shop.id,
      ownerLabel: shop.owner_profile_id ? input.directory.profilesById.get(shop.owner_profile_id)?.full_name ?? "Unassigned owner" : "Unassigned owner",
      status: getShopStatus(input.controlSnapshot, shop.id),
      locationLabels,
      activeBarbers,
      kioskEnabled: isShopControlEnabled(input.controlSnapshot, shop.id, "kiosk"),
      aiManagerEnabled: isShopControlEnabled(input.controlSnapshot, shop.id, "ai_manager"),
      billingHealth,
      verificationStatus: getShopVerificationStatus(input.trustState, shop.id),
      verificationItems: getShopVerificationItems(input.trustState, shop.id),
      revenueToday,
      growthSummary: rebookingOpportunity,
      accountHealth: [
        getShopStatus(input.controlSnapshot, shop.id) === "active" ? "Live" : "Shop inactive",
        billingHealth,
        input.ownerTrust.openDisputes ? `${input.ownerTrust.openDisputes} open disputes` : "No open disputes"
      ]
    };
  });
}

function buildMoneyRiskView(input: {
  anomalyQueue: FinancialAnomalyQueueView;
  cashoutQueue: Awaited<ReturnType<typeof readCashoutReviewQueue>>;
  trustState: TrustState;
  pointsSummary: Awaited<ReturnType<typeof buildOwnerPointsAnalyticsSummary>>;
  moneySummary: Awaited<ReturnType<typeof buildOwnerMoneyDashboardSummary>>;
}): PlatformAdminMoneyRiskView {
  const openDisputes = input.trustState.disputes.filter((dispute) =>
    dispute.disputeStatus === "open" || dispute.disputeStatus === "under_review" || dispute.disputeStatus === "escalated"
  );

  return {
    openAnomalies: input.anomalyQueue.summary.open + input.anomalyQueue.summary.investigating,
    criticalAnomalies: input.anomalyQueue.summary.critical,
    billingFailures: input.moneySummary.cashoutQueue.summary.failed,
    disputesOpen: openDisputes.length,
    pointsLiabilityValue: input.pointsSummary.pointLiabilityValue,
    fraudReviewRate: input.pointsSummary.fraudReviewRate,
    reversalRate: input.pointsSummary.reversalRate,
    overdueBoothRent: input.moneySummary.boothRent.overdue,
    recentAnomalies: input.anomalyQueue.items.slice(0, 6).map((item) => ({
      id: item.id,
      summary: item.summary,
      status: item.status,
      severity: item.severity,
      description: item.description ?? null
    })),
    recentCashouts: input.cashoutQueue.requests.slice(0, 6).map((request) => ({
      requestId: request.requestId,
      userLabel: request.userLabel,
      role: request.role,
      status: request.status,
      cashValue: request.cashValue
    })),
    recentDisputes: openDisputes.slice(0, 6).map((dispute) => ({
      id: dispute.id,
      summary: dispute.summary,
      status: dispute.disputeStatus,
      locationId: dispute.locationId
    }))
  };
}

function buildSupportItems(input: {
  directory: ProductionAdminDirectory;
  appointments: LiveOperationsSnapshot["appointments"];
  clients: LiveOperationsSnapshot["clients"];
  cashoutQueue: Awaited<ReturnType<typeof readCashoutReviewQueue>>;
  pointsState: Awaited<ReturnType<typeof readPointsStateSnapshot>>;
  referralEvents: ProductionReferralEventRow[];
  anomalyQueue: FinancialAnomalyQueueView;
}): PlatformAdminSupportItem[] {
  const bookingItems = input.appointments.slice(0, 4).map((appointment) => {
    const clientName = input.clients.find((client) => client.id === appointment.clientId)?.name ?? appointment.clientId;
    return {
      id: `support-booking-${appointment.id}`,
      kind: "booking" as const,
      title: `Booking ${appointment.id}`,
      detail: `${clientName} - ${appointment.status.replaceAll("_", " ")} - ${getLocationLabel(appointment.locationId, input.directory)}`,
      statusLabel: appointment.status.replaceAll("_", " "),
      relatedUserLabel: clientName,
      relatedShopLabel: getLocationLabel(appointment.locationId, input.directory),
      href: "/appointments"
    };
  });

  const payoutItems = input.cashoutQueue.requests.slice(0, 3).map((request) => ({
    id: `support-payout-${request.requestId}`,
    kind: "payout" as const,
    title: `Cash-out ${request.requestId}`,
    detail: `${request.userLabel} • ${request.role} • ${request.status.replaceAll("_", " ")} • $${request.cashValue.toFixed(2)}`,
    statusLabel: request.status.replaceAll("_", " "),
    relatedUserLabel: request.userLabel,
    href: "/reports?view=money"
  }));

  const pointsItems = input.pointsState.transactions
    .filter((transaction) => transaction.pointsDelta !== 0)
    .slice(0, 3)
    .map((transaction) => ({
      id: `support-points-${transaction.id}`,
      kind: "points" as const,
      title: `${normalizeVerificationLabel(transaction.eventType)} points`,
      detail: `${transaction.role} • ${transaction.status.replaceAll("_", " ")} • ${transaction.pointsDelta > 0 ? "+" : ""}${transaction.pointsDelta} pts`,
      statusLabel: transaction.status.replaceAll("_", " "),
      href: "/activity"
    }));

  const referralItems = input.referralEvents.slice(0, 3).map((event) => ({
    id: `support-referral-${event.id}`,
    kind: "referral" as const,
    title: `Referral ${event.id}`,
    detail: `${event.referred_client_email} • ${event.status.replaceAll("_", " ")} • ${Number(event.reward_points ?? 0)} pts`,
    statusLabel: event.status.replaceAll("_", " "),
    href: "/referrals"
  }));

  const anomalyItems = input.anomalyQueue.items.slice(0, 3).map((item) => ({
    id: `support-queue-${item.id}`,
    kind: "queue" as const,
    title: item.summary,
    detail: item.description ?? item.anomalyType.replaceAll("_", " "),
    statusLabel: item.status.replaceAll("_", " "),
    relatedShopLabel: item.locationId ? getLocationLabel(item.locationId, input.directory) : undefined,
    href: "/reports?view=money"
  }));

  const kioskItems = input.appointments
    .filter((appointment) => appointment.bookingSource === "kiosk")
    .slice(0, 3)
    .map((appointment) => ({
      id: `support-kiosk-${appointment.id}`,
      kind: "kiosk" as const,
      title: `Kiosk intake ${appointment.id}`,
      detail: `${getLocationLabel(appointment.locationId, input.directory)} - ${appointment.status.replaceAll("_", " ")}`,
      statusLabel: appointment.status.replaceAll("_", " "),
      relatedShopLabel: getLocationLabel(appointment.locationId, input.directory),
      href: "/settings"
    }));

  return [
    ...bookingItems,
    ...payoutItems,
    ...pointsItems,
    ...referralItems,
    ...anomalyItems,
    ...kioskItems
  ].slice(0, 20);
}

function buildActionClass(action: PlatformAdminActionInput): PlatformAdminActionClass {
  switch (action.type) {
    case "set_user_status":
      return action.nextStatus === "suspended" || action.nextStatus === "banned" ? "critical" : "sensitive";
    case "set_shop_status":
      return "critical";
    case "set_shop_control":
      return "sensitive";
    case "update_barber_verification":
    case "update_shop_verification":
      return "sensitive";
    case "resolve_dispute":
    case "resolve_financial_anomaly":
    case "dismiss_financial_anomaly":
      return "critical";
    default:
      return "safe";
  }
}

function requireActionNote(actionClass: PlatformAdminActionClass, note?: string) {
  if ((actionClass === "critical" || actionClass === "sensitive") && !note?.trim()) {
    throw new Error("A reason is required for sensitive or critical admin actions.");
  }
}

function assertPlatformAdmin(user: UserAccount) {
  if (!isPlatformAdminUser(user)) {
    throw new Error("Only the platform admin can use the Architect Console.");
  }
}

async function readTrustState() {
  const provider = await getTrustProvider();
  return provider.readState();
}

async function writeBarberVerification(input: {
  barberId: string;
  category: BarberVerificationCategory;
  status: VerificationStatus;
  note?: string;
}) {
  const now = new Date().toISOString();
  const supabase = getSupabase();
  const trustState = await readTrustState();
  const directory = await readProductionAdminDirectory([]);
  const barber = directory.barbersByReference.get(input.barberId);
  const barberProfile = barber ? directory.profilesById.get(barber.profile_id) : undefined;
  const existing = trustState.barberVerifications.find((record) => record.barberId === input.barberId && record.category === input.category);
  const nextRecord: BarberVerificationRecord = {
    id: existing?.id ?? `barber-verification-${randomUUID().slice(0, 8)}`,
    barberId: input.barberId,
    category: input.category,
    legalName: existing?.legalName ?? barberProfile?.full_name ?? input.barberId,
    licenseType: existing?.licenseType,
    licenseNumber: existing?.licenseNumber,
    issuingState: existing?.issuingState,
    expirationDate: existing?.expirationDate,
    verificationStatus: input.status,
    verificationSubmittedAt: existing?.verificationSubmittedAt ?? now,
    verificationReviewedAt: input.status === "pending" ? existing?.verificationReviewedAt : now,
    verificationNotes: input.note?.trim() || existing?.verificationNotes,
    documentPath: existing?.documentPath,
    updatedAt: now
  };

  if (!supabase) {
    const nextState = clone(getTrustState());
    nextState.barberVerifications = [
      nextRecord,
      ...nextState.barberVerifications.filter((record) => !(record.barberId === input.barberId && record.category === input.category))
    ];
    setTrustState(nextState);
    return nextRecord;
  }

  const result = await supabase
    .from("barber_verifications")
    .upsert({
      id: nextRecord.id,
      barber_reference: nextRecord.barberId,
      category: nextRecord.category,
      legal_name: nextRecord.legalName,
      license_type: nextRecord.licenseType ?? null,
      license_number: nextRecord.licenseNumber ?? null,
      issuing_state: nextRecord.issuingState ?? null,
      expiration_date: nextRecord.expirationDate ?? null,
      verification_status: nextRecord.verificationStatus,
      verification_submitted_at: nextRecord.verificationSubmittedAt ?? null,
      verification_reviewed_at: nextRecord.verificationReviewedAt ?? null,
      verification_notes: nextRecord.verificationNotes ?? null,
      document_path: nextRecord.documentPath ?? null,
      updated_at: nextRecord.updatedAt
    }, { onConflict: "id" });

  if (result.error && !isMissingTableError(result.error)) {
    throw result.error;
  }

  if (result.error && isMissingTableError(result.error)) {
    const nextState = clone(getTrustState());
    nextState.barberVerifications = [
      nextRecord,
      ...nextState.barberVerifications.filter((record) => !(record.barberId === input.barberId && record.category === input.category))
    ];
    setTrustState(nextState);
  }

  return nextRecord;
}

async function writeShopVerification(input: {
  shopId: string;
  category: ShopVerificationCategory;
  status: VerificationStatus;
  note?: string;
}) {
  const now = new Date().toISOString();
  const supabase = getSupabase();
  const trustState = await readTrustState();
  const directory = await readProductionAdminDirectory([]);
  const shop = directory.shopsById.get(input.shopId);
  const existing = trustState.shopVerifications.find((record) => record.shopId === input.shopId && record.category === input.category);
  const nextRecord: ShopVerificationRecord = {
    id: existing?.id ?? `shop-verification-${randomUUID().slice(0, 8)}`,
    shopId: input.shopId,
    category: input.category,
    businessName: existing?.businessName ?? shop?.name ?? input.shopId,
    verificationStatus: input.status,
    verificationSubmittedAt: existing?.verificationSubmittedAt ?? now,
    verificationReviewedAt: input.status === "pending" ? existing?.verificationReviewedAt : now,
    verificationNotes: input.note?.trim() || existing?.verificationNotes,
    documentPath: existing?.documentPath,
    updatedAt: now
  };

  if (!supabase) {
    const nextState = clone(getTrustState());
    nextState.shopVerifications = [
      nextRecord,
      ...nextState.shopVerifications.filter((record) => !(record.shopId === input.shopId && record.category === input.category))
    ];
    setTrustState(nextState);
    return nextRecord;
  }

  const result = await supabase
    .from("shop_verifications")
    .upsert({
      id: nextRecord.id,
      shop_reference: nextRecord.shopId,
      category: nextRecord.category,
      business_name: nextRecord.businessName,
      verification_status: nextRecord.verificationStatus,
      verification_submitted_at: nextRecord.verificationSubmittedAt ?? null,
      verification_reviewed_at: nextRecord.verificationReviewedAt ?? null,
      verification_notes: nextRecord.verificationNotes ?? null,
      document_path: nextRecord.documentPath ?? null,
      updated_at: nextRecord.updatedAt
    }, { onConflict: "id" });

  if (result.error && !isMissingTableError(result.error)) {
    throw result.error;
  }

  if (result.error && isMissingTableError(result.error)) {
    const nextState = clone(getTrustState());
    nextState.shopVerifications = [
      nextRecord,
      ...nextState.shopVerifications.filter((record) => !(record.shopId === input.shopId && record.category === input.category))
    ];
    setTrustState(nextState);
  }

  return nextRecord;
}

async function resolveDisputeRecord(input: {
  actor: UserAccount;
  disputeId: string;
  note?: string;
}) {
  const trustState = await readTrustState();
  const existing = trustState.disputes.find((record) => record.id === input.disputeId);
  if (!existing) {
    throw new Error("Dispute not found.");
  }

  const now = new Date().toISOString();
  const resolutionNotes = input.note?.trim() || existing.resolutionNotes || "Resolved by Architect.";
  const nextRecord = {
    ...existing,
    disputeStatus: "resolved" as const,
    resolutionNotes,
    updatedAt: now
  };
  const nextEvent = {
    id: `dispute-event-${randomUUID().slice(0, 8)}`,
    disputeId: existing.id,
    actorRole: input.actor.role,
    actorId: input.actor.id,
    actionLabel: "Dispute resolved",
    notes: resolutionNotes,
    createdAt: now
  };

  const applyFallbackState = () => {
    const nextState = clone(getTrustState());
    nextState.disputes = [
      nextRecord,
      ...nextState.disputes.filter((record) => record.id !== existing.id)
    ];
    nextState.disputeEvents = [nextEvent, ...nextState.disputeEvents];
    setTrustState(nextState);
  };

  const supabase = getSupabase();
  if (!supabase) {
    applyFallbackState();
    return { previous: existing, next: nextRecord };
  }

  const disputeResult = await supabase
    .from("disputes")
    .update({
      dispute_status: "resolved",
      resolution_notes: resolutionNotes,
      updated_at: now
    })
    .eq("id", existing.id);

  if (disputeResult.error && !isMissingTableError(disputeResult.error)) {
    throw disputeResult.error;
  }

  const disputeEventResult = await supabase
    .from("dispute_events")
    .insert({
      id: nextEvent.id,
      dispute_reference: nextEvent.disputeId,
      actor_role: nextEvent.actorRole,
      actor_reference: nextEvent.actorId,
      action_label: nextEvent.actionLabel,
      notes: nextEvent.notes ?? null,
      created_at: nextEvent.createdAt
    });

  if (disputeEventResult.error && !isMissingTableError(disputeEventResult.error)) {
    throw disputeEventResult.error;
  }

  if (disputeResult.error || disputeEventResult.error) {
    applyFallbackState();
  }

  await recordRequiredPlatformEvent(supabase, {
    eventType: "dispute_resolved",
    entityType: "dispute",
    entityId: existing.id,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    source: "api",
    relatedIds: {
      disputeId: existing.id,
      appointmentId: existing.appointmentId,
      locationId: existing.locationId,
      involvedPartyType: existing.involvedPartyType,
      involvedPartyId: existing.involvedPartyId
    },
    payload: {
      disputeType: existing.disputeType,
      disputeStatus: "resolved",
      summary: existing.summary,
      resolutionNotes
    },
    idempotencyKey: buildPlatformEventIdempotencyKey(["dispute", existing.id, "resolved"]),
    occurredAt: now
  });

  return { previous: existing, next: nextRecord };
}

async function writeControlValue(input: {
  actor: UserAccount;
  targetType: "user" | "shop";
  targetId: string;
  controlKey: PlatformAdminControlKey;
  controlValue: Record<string, unknown>;
}) {
  const controls = await readAllControls();
  const existing = controls.find((record) =>
    record.targetType === input.targetType
    && record.targetId === input.targetId
    && record.controlKey === input.controlKey
  );
  const now = new Date().toISOString();
  const nextRecord: PlatformAdminControlRecord = {
    id: existing?.id ?? `platform-control-${randomUUID().slice(0, 8)}`,
    targetType: input.targetType,
    targetId: input.targetId,
    controlKey: input.controlKey,
    controlValue: input.controlValue,
    updatedByUserId: input.actor.id,
    updatedByRole: input.actor.role,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  await persistControl(nextRecord);
  return nextRecord;
}

export async function getPlatformAccountStatus(userId: string) {
  try {
    const controls = await readAllControls();
    return getAccountStatus(buildControlSnapshot(controls), userId);
  } catch (error) {
    logPlatformAdminServerError("reading platform account status overlay", error);
    return DEFAULT_ACCOUNT_STATUS;
  }
}

export async function applyPlatformAdminOverlay(user: UserAccount): Promise<UserAccount> {
  if (isPlatformAdminUser(user)) {
    return {
      ...user,
      accountStatus: "active"
    };
  }

  return {
    ...user,
    accountStatus: await getPlatformAccountStatus(user.id)
  };
}

export async function readPlatformShopControlState(shopId: string) {
  try {
    const controls = await readAllControls();
    const snapshot = buildControlSnapshot(controls);
    return {
      shopStatus: getShopStatus(snapshot, shopId),
      kioskEnabled: isShopControlEnabled(snapshot, shopId, "kiosk"),
      aiManagerEnabled: isShopControlEnabled(snapshot, shopId, "ai_manager")
    };
  } catch (error) {
    logPlatformAdminServerError("reading platform shop control overlay", error);
    return {
      shopStatus: DEFAULT_SHOP_STATUS,
      kioskEnabled: true,
      aiManagerEnabled: true
    };
  }
}

export async function getPlatformAdminConsolePayload(actor: UserAccount): Promise<PlatformAdminConsolePayload> {
  assertPlatformAdmin(actor);

  const warnings: string[] = [];
  const directory = await readProductionAdminDirectory(warnings);
  const locationIds = directory.locations.map((location) => location.id);
  const viewer: LiveOperationsViewer = {
    role: "owner",
    email: actor.email,
    locationIds,
    barberId: actor.barberId,
    clientId: actor.clientId
  };

  const [controls, auditLog, liveProvider, trustState, pointsState, cashoutQueue, referralEvents] = await Promise.all([
    safeArchitectRead({
      context: "loading architect control state",
      warning: "Architect control state is unavailable; founder actions are running in fallback mode.",
      warnings,
      fallback: [] as PlatformAdminControlRecord[],
      load: () => readAllControls(warnings)
    }) as Promise<PlatformAdminControlRecord[]>,
    safeArchitectRead({
      context: "loading architect audit log",
      warning: "Architect audit history is temporarily unavailable; new founder actions will still be logged when storage returns.",
      warnings,
      fallback: [] as PlatformAdminAuditLogEntry[],
      load: () => readAuditLog(warnings)
    }),
    safeArchitectRead({
      context: "loading live operations provider",
      warning: "Live operations data is unavailable right now; overview and support sections are showing safe fallback values.",
      warnings,
      fallback: null as Awaited<ReturnType<typeof getLiveOperationsProvider>> | null,
      load: async () => getLiveOperationsProvider()
    }),
    safeArchitectRead({
      context: "loading trust state",
      warning: "Trust and verification data is temporarily unavailable; account health is showing safe fallback values.",
      warnings,
      fallback: createEmptyTrustState(),
      load: () => readTrustState()
    }),
    safeArchitectRead({
      context: "loading points state",
      warning: "Points and rewards data is temporarily unavailable; architect reward views are showing safe fallback values.",
      warnings,
      fallback: createEmptyPointsState(),
      load: () => readPointsStateSnapshot()
    }),
    safeArchitectRead({
      context: "loading cash-out review queue",
      warning: "Cash-out review data is temporarily unavailable; money-risk cash-out visibility is showing safe fallback values.",
      warnings,
      fallback: createEmptyCashoutQueue(),
      load: () => readCashoutReviewQueue()
    }),
    safeArchitectRead({
      context: "loading canonical referral activity",
      warning: "Referral activity is temporarily unavailable; referral support context is showing safe fallback values.",
      warnings,
      fallback: [] as ProductionReferralEventRow[],
      load: () => readProductionReferralEvents(warnings)
    })
  ]);

  const controlSnapshot = buildControlSnapshot(controls);
  const referralSummaryByClientId = buildReferralSummaryByClientId(referralEvents);
  const [snapshot, anomalyQueue] = await Promise.all([
    liveProvider && locationIds.length
      ? safeArchitectRead({
          context: "reading live operations snapshot",
          warning: "Live operations snapshot is temporarily unavailable; appointments and booking visibility are showing safe fallback values.",
          warnings,
          fallback: createEmptyLiveOperationsSnapshot(),
          load: () => liveProvider.readSnapshot(viewer)
        })
      : Promise.resolve(createEmptyLiveOperationsSnapshot()),
    safeArchitectRead({
      context: "reading financial anomaly queue",
      warning: "Money and anomaly monitoring is temporarily unavailable; money-risk review is showing safe fallback values.",
      warnings,
      fallback: createEmptyAnomalyQueue(),
      load: async () => {
        if (!locationIds.length) {
          return createEmptyAnomalyQueue();
        }

        try {
          return await syncFinancialAnomalies({ locationIds });
        } catch (error) {
          logPlatformAdminServerError("syncing financial anomalies", error);
          return readFinancialAnomalyQueue({ locationIds });
        }
      }
    })
  ]);

  const [monetization, pointsSummary] = await Promise.all([
    safeArchitectRead({
      context: "building owner monetization summary",
      warning: "Monetization data is temporarily unavailable; billing and revenue posture is showing safe fallback values.",
      warnings,
      fallback: createEmptyMonetizationSummary(),
      load: () => locationIds.length
        ? buildOwnerMonetizationSummary({
            state: createEmptyEngagementState(),
            snapshot,
            locationIds
          })
        : Promise.resolve(createEmptyMonetizationSummary())
    }),
    safeArchitectRead({
      context: "building owner points analytics",
      warning: "Points analytics are temporarily unavailable; reward liability and ROI are showing safe fallback values.",
      warnings,
      fallback: createEmptyPointsAnalyticsSummary(),
      load: () => locationIds.length ? buildOwnerPointsAnalyticsSummary({ locationIds }) : Promise.resolve(createEmptyPointsAnalyticsSummary())
    })
  ]);

  const [moneySummary, readiness] = await Promise.all([
    safeArchitectRead({
      context: "building owner money dashboard summary",
      warning: "Money dashboard analytics are temporarily unavailable; money-risk visibility is showing safe fallback values.",
      warnings,
      fallback: createEmptyOwnerMoneyDashboardSummary(),
      load: () => locationIds.length
        ? buildOwnerMoneyDashboardSummary({
            locationIds,
            snapshot,
            monetization,
            points: pointsSummary
          })
        : Promise.resolve(createEmptyOwnerMoneyDashboardSummary())
    }),
    safeArchitectRead({
      context: "building release readiness summary",
      warning: "Release-readiness checks are temporarily unavailable; control overview is showing safe fallback values.",
      warnings,
      fallback: createEmptyReleaseReadinessSummary(),
      load: async () => buildReleaseReadinessSummary()
    })
  ]);

  const ownerTrust = safeArchitectRead({
    context: "building owner trust summary",
    warning: "Trust analytics are temporarily unavailable; verification and fraud visibility are showing safe fallback values.",
    warnings,
    fallback: createEmptyOwnerTrustSummary(),
    load: async () => locationIds.length ? getOwnerTrustSummary(trustState, locationIds) : createEmptyOwnerTrustSummary()
  });
  const ownerSummary = safeArchitectRead({
    context: "building owner analytics summary",
    warning: "Owner analytics are temporarily unavailable; overview metrics are showing safe fallback values.",
    warnings,
    fallback: {
      businessDate: new Date().toISOString().slice(0, 10),
      revenueToday: 0,
      tipsToday: 0,
      outstandingBalance: 0,
      completedServicesToday: 0,
      bookedToday: 0,
      paidAppointmentsToday: 0
    },
    load: async () => getOwnerAnalyticsSummary(snapshot.ownerAnalytics)
  });
  const [resolvedOwnerTrust, resolvedOwnerSummary] = await Promise.all([ownerTrust, ownerSummary]);
  const users = await safeArchitectRead({
    context: "building architect users view",
    warning: "User account summaries are temporarily unavailable; the users section is showing safe fallback values.",
    warnings,
    fallback: [] as PlatformAdminUserView[],
    load: async () => buildUsersView({
      directory,
      trustState,
      referralSummaryByClientId,
      pointsState,
      accountControls: controlSnapshot,
      anomalyQueue,
      cashoutQueue,
      appointments: snapshot.appointments
    })
  });
  const shops = await safeArchitectRead({
    context: "building architect shops view",
    warning: "Shop summaries are temporarily unavailable; the shops section is showing safe fallback values.",
    warnings,
    fallback: [] as PlatformAdminShopView[],
    load: async () => buildShopsView({
      directory,
      trustState,
      controlSnapshot,
      todayRevenueByLocation: buildTodayRevenueByLocation(snapshot.appointments),
      monetization,
      ownerTrust: resolvedOwnerTrust
    })
  });
  const moneyRisk = await safeArchitectRead({
    context: "building architect money-risk view",
    warning: "Money-risk summaries are temporarily unavailable; the risk lane is showing safe fallback values.",
    warnings,
    fallback: createEmptyPlatformAdminConsolePayload(actor.name).moneyRisk,
    load: async () => buildMoneyRiskView({
      anomalyQueue,
      cashoutQueue,
      trustState,
      pointsSummary,
      moneySummary
    })
  });
  const support = await safeArchitectRead({
    context: "building architect support view",
    warning: "Support lookup summaries are temporarily unavailable; the support lane is showing safe fallback values.",
    warnings,
    fallback: [] as PlatformAdminSupportItem[],
    load: async () => buildSupportItems({
      directory,
      appointments: snapshot.appointments,
      clients: snapshot.clients,
      cashoutQueue,
      pointsState,
      referralEvents,
      anomalyQueue
    })
  });

  const payload = normalizePlatformAdminConsolePayload({
    actorName: actor.name,
    overview: {
      totalUsers: users.length,
      activeClients: users.filter((user) => user.primaryRole === "Client" && user.accountStatus === "active").length,
      activeBarbers: users.filter((user) => user.barberId && user.accountStatus === "active").length,
      activeShops: shops.filter((shop) => shop.status === "active").length,
      bookingsToday: snapshot.appointments.filter((appointment) => appointment.start.slice(0, 10) === resolvedOwnerSummary.businessDate).length,
      revenueToday: resolvedOwnerSummary.revenueToday,
      payoutIssues: anomalyQueue.items.filter((item) => item.anomalyType === "payout_stuck" || item.anomalyType === "payout_failure").length,
      billingIssues: monetization.subscriptions.billingAttention,
      fraudFlags: resolvedOwnerTrust.highRiskFlags,
      kioskActiveCount: shops.filter((shop) => shop.kioskEnabled).length,
      aiManagerActiveCount: shops.filter((shop) => shop.aiManagerEnabled).length,
      releaseReadyCount: readiness.summary.readyCount,
      releaseAttentionCount: readiness.summary.attentionCount
    },
    users,
    shops,
    moneyRisk,
    support,
    controls: {
      shops: shops.map((shop) => ({
        shopId: shop.id,
        shopName: shop.name,
        shopStatus: shop.status,
        kioskEnabled: shop.kioskEnabled,
        aiManagerEnabled: shop.aiManagerEnabled,
        billingHealth: shop.billingHealth,
        verificationStatus: shop.verificationStatus
      })),
      release: {
        readyCount: readiness.summary.readyCount,
        attentionCount: readiness.summary.attentionCount
      }
    },
    auditLog,
    warnings
  }, {
    actorName: actor.name,
    warnings: warnings.length ? [ARCHITECT_DEGRADED_WARNING, ...warnings] : []
  });

  return payload;
}

export async function applyPlatformAdminAction(actor: UserAccount, action: PlatformAdminActionInput) {
  assertPlatformAdmin(actor);

  const actionClass = buildActionClass(action);
  requireActionNote(actionClass, "note" in action ? action.note : undefined);
  const createdAt = new Date().toISOString();
  const actionDirectory = await readProductionAdminDirectory([]);
  let targetType: PlatformAdminTargetType = "control";
  let targetId = "";
  let beforeSummary = "";
  let afterSummary = "";

  switch (action.type) {
    case "set_user_status": {
      const targetProfile = actionDirectory.profilesById.get(action.userId);
      const targetUser = targetProfile ? buildProductionUserAccount(targetProfile, actionDirectory) : null;
      if (!targetUser) {
        throw new Error("User account not found.");
      }

      if (isPlatformAdminUser(targetUser)) {
        throw new Error("Platform admin access cannot be changed from the Architect Console.");
      }

      const previousStatus = await getPlatformAccountStatus(action.userId);
      await writeControlValue({
        actor,
        targetType: "user",
        targetId: action.userId,
        controlKey: "account_status",
        controlValue: {
          status: action.nextStatus
        }
      });
      targetType = "user";
      targetId = action.userId;
      beforeSummary = `${targetUser.name} was ${previousStatus.replaceAll("_", " ")}.`;
      afterSummary = `${targetUser.name} is now ${action.nextStatus.replaceAll("_", " ")}.`;
      break;
    }
    case "set_shop_status": {
      const shop = actionDirectory.shopsById.get(action.shopId);
      if (!shop) {
        throw new Error("Shop not found.");
      }

      const currentState = await readPlatformShopControlState(action.shopId);
      await writeControlValue({
        actor,
        targetType: "shop",
        targetId: action.shopId,
        controlKey: "shop_status",
        controlValue: {
          status: action.nextStatus
        }
      });
      targetType = "shop";
      targetId = action.shopId;
      beforeSummary = `${shop.name ?? shop.id} was ${currentState.shopStatus}.`;
      afterSummary = `${shop.name ?? shop.id} is now ${action.nextStatus}.`;
      break;
    }
    case "set_shop_control": {
      const shop = actionDirectory.shopsById.get(action.shopId);
      if (!shop) {
        throw new Error("Shop not found.");
      }

      const currentState = await readPlatformShopControlState(action.shopId);
      await writeControlValue({
        actor,
        targetType: "shop",
        targetId: action.shopId,
        controlKey: action.controlKey,
        controlValue: {
          enabled: action.enabled
        }
      });
      targetType = "control";
      targetId = `${action.shopId}:${action.controlKey}`;
      const previous = action.controlKey === "kiosk_enabled" ? currentState.kioskEnabled : currentState.aiManagerEnabled;
      beforeSummary = `${shop.name ?? shop.id} ${action.controlKey.replaceAll("_", " ")} was ${previous ? "enabled" : "disabled"}.`;
      afterSummary = `${shop.name ?? shop.id} ${action.controlKey.replaceAll("_", " ")} is now ${action.enabled ? "enabled" : "disabled"}.`;
      break;
    }
    case "update_barber_verification": {
      const barber = actionDirectory.barbersByReference.get(action.barberId);
      if (!barber) {
        throw new Error("Barber not found.");
      }
      const barberProfile = actionDirectory.profilesById.get(barber.profile_id);

      const trustState = await readTrustState();
      const existing = trustState.barberVerifications.find((record) => record.barberId === action.barberId && record.category === action.category);
      await writeBarberVerification({
        barberId: action.barberId,
        category: action.category,
        status: action.status,
        note: action.note
      });
      targetType = "barber_verification";
      targetId = `${action.barberId}:${action.category}`;
      beforeSummary = `${barberProfile?.full_name ?? action.barberId} ${normalizeVerificationLabel(action.category).toLowerCase()} was ${existing?.verificationStatus ?? "unverified"}.`;
      afterSummary = `${barberProfile?.full_name ?? action.barberId} ${normalizeVerificationLabel(action.category).toLowerCase()} is now ${action.status}.`;
      break;
    }
    case "update_shop_verification": {
      const shop = actionDirectory.shopsById.get(action.shopId);
      if (!shop) {
        throw new Error("Shop not found.");
      }

      const trustState = await readTrustState();
      const existing = trustState.shopVerifications.find((record) => record.shopId === action.shopId && record.category === action.category);
      await writeShopVerification({
        shopId: action.shopId,
        category: action.category,
        status: action.status,
        note: action.note
      });
      targetType = "shop_verification";
      targetId = `${action.shopId}:${action.category}`;
      beforeSummary = `${shop.name ?? shop.id} ${normalizeVerificationLabel(action.category).toLowerCase()} was ${existing?.verificationStatus ?? "unverified"}.`;
      afterSummary = `${shop.name ?? shop.id} ${normalizeVerificationLabel(action.category).toLowerCase()} is now ${action.status}.`;
      break;
    }
    case "resolve_dispute": {
      const result = await resolveDisputeRecord({
        actor,
        disputeId: action.disputeId,
        note: action.note
      });
      targetType = "dispute";
      targetId = action.disputeId;
      beforeSummary = `${result.previous.summary} was ${result.previous.disputeStatus}.`;
      afterSummary = `${result.next.summary} is now resolved.`;
      break;
    }
    case "resolve_financial_anomaly": {
      const queue = await readFinancialAnomalyQueue();
      const anomaly = queue.items.find((item) => item.id === action.anomalyId);
      if (!anomaly) {
        throw new Error("Financial anomaly not found.");
      }

      await resolveFinancialAnomaly({
        id: action.anomalyId,
        actorUserId: actor.id,
        actorRole: actor.role,
        note: action.note
      });
      targetType = "financial_anomaly";
      targetId = action.anomalyId;
      beforeSummary = `${anomaly.summary} was ${anomaly.status}.`;
      afterSummary = `${anomaly.summary} is now resolved.`;
      break;
    }
    case "dismiss_financial_anomaly": {
      const queue = await readFinancialAnomalyQueue();
      const anomaly = queue.items.find((item) => item.id === action.anomalyId);
      if (!anomaly) {
        throw new Error("Financial anomaly not found.");
      }

      await dismissFinancialAnomaly({
        id: action.anomalyId,
        actorUserId: actor.id,
        actorRole: actor.role,
        note: action.note
      });
      targetType = "financial_anomaly";
      targetId = action.anomalyId;
      beforeSummary = `${anomaly.summary} was ${anomaly.status}.`;
      afterSummary = `${anomaly.summary} is now dismissed.`;
      break;
    }
  }

  await appendAuditLog({
    id: `platform-audit-${randomUUID().slice(0, 8)}`,
    actorUserId: actor.id,
    actorRole: actor.role,
    actionClass,
    actionType: action.type,
    targetType,
    targetId,
    note: "note" in action ? action.note?.trim() || null : null,
    beforeSummary,
    afterSummary,
    metadata: {
      action
    },
    createdAt
  });

  return {
    ok: true
  };
}

export function resetPlatformAdminStateForTests() {
  demoPlatformAdminControls = [];
  demoPlatformAdminAuditLog = [];
  productionAdminDirectoryRowsOverlay = null;
  productionReferralEventRowsOverlay = null;
}

export function stagePlatformAdminDirectoryRowsForTests(input: ProductionAdminDirectoryRows) {
  productionAdminDirectoryRowsOverlay = clone(input);
}

export function stagePlatformAdminReferralRowsForTests(rows: ProductionReferralEventRow[]) {
  productionReferralEventRowsOverlay = clone(rows);
}
