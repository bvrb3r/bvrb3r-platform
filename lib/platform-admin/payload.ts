import type {
  PlatformAdminAuditLogEntry,
  PlatformAdminConsolePayload,
  PlatformAdminControlsView,
  PlatformAdminMoneyRiskView,
  PlatformAdminOverview,
  PlatformAdminShopView,
  PlatformAdminSupportItem,
  PlatformAdminUserView,
  PlatformAdminVerificationItem
} from "@/types/platform-admin";

export const ARCHITECT_DEGRADED_WARNING = "Architect data is partially unavailable. Core access is still active.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function uniqueWarnings(value: string[]) {
  return Array.from(new Set(value.filter((entry) => entry.trim().length > 0)));
}

function createEmptyOverview(): PlatformAdminOverview {
  return {
    totalUsers: 0,
    activeClients: 0,
    activeBarbers: 0,
    activeShops: 0,
    bookingsToday: 0,
    revenueToday: 0,
    payoutIssues: 0,
    billingIssues: 0,
    fraudFlags: 0,
    kioskActiveCount: 0,
    aiManagerActiveCount: 0,
    releaseReadyCount: 0,
    releaseAttentionCount: 0
  };
}

function createEmptyMoneyRisk(): PlatformAdminMoneyRiskView {
  return {
    openAnomalies: 0,
    criticalAnomalies: 0,
    billingFailures: 0,
    disputesOpen: 0,
    pointsLiabilityValue: 0,
    fraudReviewRate: 0,
    reversalRate: 0,
    overdueBoothRent: 0,
    recentAnomalies: [],
    recentCashouts: [],
    recentDisputes: []
  };
}

function createEmptyControls(): PlatformAdminControlsView {
  return {
    shops: [],
    release: {
      readyCount: 0,
      attentionCount: 0
    }
  };
}

function normalizeVerificationItem(input: unknown): PlatformAdminVerificationItem | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    category: readString(input.category),
    label: readString(input.label, "Verification"),
    status: readString(input.status, "unverified")
  };
}

function normalizeAuditLogEntry(input: unknown): PlatformAdminAuditLogEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    id: readString(input.id, "audit-entry"),
    actorUserId: readString(input.actorUserId, "system"),
    actorRole: readString(input.actorRole, "platform_admin"),
    actionClass: readString(input.actionClass, "safe") as PlatformAdminAuditLogEntry["actionClass"],
    actionType: readString(input.actionType, "inspect"),
    targetType: readString(input.targetType, "control") as PlatformAdminAuditLogEntry["targetType"],
    targetId: readString(input.targetId, "unknown"),
    note: readString(input.note, "") || null,
    beforeSummary: readString(input.beforeSummary, "") || null,
    afterSummary: readString(input.afterSummary, "") || null,
    metadata: isRecord(input.metadata) ? input.metadata : {},
    createdAt: readString(input.createdAt, new Date(0).toISOString())
  };
}

function normalizeUserView(input: unknown): PlatformAdminUserView | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    id: readString(input.id, "user"),
    authUserId: readString(input.authUserId) || undefined,
    barberId: readString(input.barberId) || undefined,
    clientId: readString(input.clientId) || undefined,
    name: readString(input.name, "Unknown user"),
    email: readString(input.email, "unknown@bvrb3r.local"),
    phone: readString(input.phone) || undefined,
    primaryRole: readString(input.primaryRole, "Unknown"),
    title: readString(input.title, "Account"),
    accountStatus: readString(input.accountStatus, "active") as PlatformAdminUserView["accountStatus"],
    verificationStatus: readString(input.verificationStatus, "unverified"),
    shopRelationships: readStringArray(input.shopRelationships),
    accountHealth: readStringArray(input.accountHealth),
    bookingSummary: isRecord(input.bookingSummary)
      ? {
          completed: readNumber(input.bookingSummary.completed),
          active: readNumber(input.bookingSummary.active),
          cancelled: readNumber(input.bookingSummary.cancelled),
          lifetimeValue: readNumber(input.bookingSummary.lifetimeValue)
        }
      : { completed: 0, active: 0, cancelled: 0, lifetimeValue: 0 },
    pointsSummary: isRecord(input.pointsSummary)
      ? {
          totalPoints: readNumber(input.pointsSummary.totalPoints),
          unlockedPoints: readNumber(input.pointsSummary.unlockedPoints),
          pendingPoints: readNumber(input.pointsSummary.pendingPoints)
        }
      : { totalPoints: 0, unlockedPoints: 0, pendingPoints: 0 },
    referralSummary: isRecord(input.referralSummary)
      ? {
          invited: readNumber(input.referralSummary.invited),
          completed: readNumber(input.referralSummary.completed),
          credited: readNumber(input.referralSummary.credited)
        }
      : { invited: 0, completed: 0, credited: 0 },
    verificationItems: readObjectArray(input.verificationItems)
      .map(normalizeVerificationItem)
      .filter((entry): entry is PlatformAdminVerificationItem => Boolean(entry)),
    supportFlags: readStringArray(input.supportFlags),
    canManageAccess: readBoolean(input.canManageAccess),
    isPlatformAdmin: readBoolean(input.isPlatformAdmin)
  };
}

function normalizeShopView(input: unknown): PlatformAdminShopView | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    id: readString(input.id, "shop"),
    name: readString(input.name, "Unknown shop"),
    ownerLabel: readString(input.ownerLabel, "Unknown owner"),
    status: readString(input.status, "inactive") as PlatformAdminShopView["status"],
    locationLabels: readStringArray(input.locationLabels),
    activeBarbers: readNumber(input.activeBarbers),
    kioskEnabled: readBoolean(input.kioskEnabled),
    aiManagerEnabled: readBoolean(input.aiManagerEnabled),
    billingHealth: readString(input.billingHealth, "Unavailable"),
    verificationStatus: readString(input.verificationStatus, "unverified"),
    verificationItems: readObjectArray(input.verificationItems)
      .map(normalizeVerificationItem)
      .filter((entry): entry is PlatformAdminVerificationItem => Boolean(entry)),
    revenueToday: readNumber(input.revenueToday),
    growthSummary: readString(input.growthSummary, "Growth data unavailable"),
    accountHealth: readStringArray(input.accountHealth)
  };
}

function normalizeSupportItem(input: unknown): PlatformAdminSupportItem | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    id: readString(input.id, "support-item"),
    kind: readString(input.kind, "booking") as PlatformAdminSupportItem["kind"],
    title: readString(input.title, "Support item"),
    detail: readString(input.detail, "No detail recorded."),
    statusLabel: readString(input.statusLabel, "unavailable"),
    relatedUserLabel: readString(input.relatedUserLabel) || undefined,
    relatedShopLabel: readString(input.relatedShopLabel) || undefined,
    href: readString(input.href) || undefined
  };
}

export function createEmptyPlatformAdminConsolePayload(
  actorName = "Architect",
  warnings: string[] = []
): PlatformAdminConsolePayload {
  return {
    actorName,
    overview: createEmptyOverview(),
    users: [],
    shops: [],
    moneyRisk: createEmptyMoneyRisk(),
    support: [],
    controls: createEmptyControls(),
    auditLog: [],
    warnings: uniqueWarnings(warnings)
  };
}

export function normalizePlatformAdminConsolePayload(
  input: unknown,
  options?: {
    actorName?: string;
    warnings?: string[];
  }
): PlatformAdminConsolePayload {
  const record = isRecord(input) ? input : null;
  const base = createEmptyPlatformAdminConsolePayload(options?.actorName ?? readString(record?.actorName, "Architect"));
  let degraded = !record;

  const overview = isRecord(record?.overview)
    ? {
        totalUsers: readNumber(record.overview.totalUsers),
        activeClients: readNumber(record.overview.activeClients),
        activeBarbers: readNumber(record.overview.activeBarbers),
        activeShops: readNumber(record.overview.activeShops),
        bookingsToday: readNumber(record.overview.bookingsToday),
        revenueToday: readNumber(record.overview.revenueToday),
        payoutIssues: readNumber(record.overview.payoutIssues),
        billingIssues: readNumber(record.overview.billingIssues),
        fraudFlags: readNumber(record.overview.fraudFlags),
        kioskActiveCount: readNumber(record.overview.kioskActiveCount),
        aiManagerActiveCount: readNumber(record.overview.aiManagerActiveCount),
        releaseReadyCount: readNumber(record.overview.releaseReadyCount),
        releaseAttentionCount: readNumber(record.overview.releaseAttentionCount)
      }
    : (degraded = true, base.overview);

  const users = Array.isArray(record?.users)
    ? readObjectArray(record.users)
      .map(normalizeUserView)
      .filter((entry): entry is PlatformAdminUserView => Boolean(entry))
    : (degraded = true, base.users);

  const shops = Array.isArray(record?.shops)
    ? readObjectArray(record.shops)
      .map(normalizeShopView)
      .filter((entry): entry is PlatformAdminShopView => Boolean(entry))
    : (degraded = true, base.shops);

  const moneyRisk = isRecord(record?.moneyRisk)
    ? {
        openAnomalies: readNumber(record.moneyRisk.openAnomalies),
        criticalAnomalies: readNumber(record.moneyRisk.criticalAnomalies),
        billingFailures: readNumber(record.moneyRisk.billingFailures),
        disputesOpen: readNumber(record.moneyRisk.disputesOpen),
        pointsLiabilityValue: readNumber(record.moneyRisk.pointsLiabilityValue),
        fraudReviewRate: readNumber(record.moneyRisk.fraudReviewRate),
        reversalRate: readNumber(record.moneyRisk.reversalRate),
        overdueBoothRent: readNumber(record.moneyRisk.overdueBoothRent),
        recentAnomalies: readObjectArray(record.moneyRisk.recentAnomalies).map((item) => ({
          id: readString(item.id, "anomaly"),
          summary: readString(item.summary, "Financial anomaly"),
          status: readString(item.status, "open"),
          severity: readString(item.severity, "medium"),
          description: readString(item.description, "") || null
        })),
        recentCashouts: readObjectArray(record.moneyRisk.recentCashouts).map((item) => ({
          requestId: readString(item.requestId, "cashout"),
          userLabel: readString(item.userLabel, "Unknown user"),
          role: readString(item.role, "owner"),
          status: readString(item.status, "requested"),
          cashValue: readNumber(item.cashValue)
        })),
        recentDisputes: readObjectArray(record.moneyRisk.recentDisputes).map((item) => ({
          id: readString(item.id, "dispute"),
          summary: readString(item.summary, "Dispute"),
          status: readString(item.status, "open"),
          locationId: readString(item.locationId) || undefined
        }))
      }
    : (degraded = true, base.moneyRisk);

  const support = Array.isArray(record?.support)
    ? readObjectArray(record.support)
      .map(normalizeSupportItem)
      .filter((entry): entry is PlatformAdminSupportItem => Boolean(entry))
    : (degraded = true, base.support);

  const controls = isRecord(record?.controls)
    ? {
        shops: Array.isArray(record.controls.shops)
          ? readObjectArray(record.controls.shops).map((item) => ({
              shopId: readString(item.shopId, "shop"),
              shopName: readString(item.shopName, "Unknown shop"),
              shopStatus: readString(item.shopStatus, "inactive") as PlatformAdminControlsView["shops"][number]["shopStatus"],
              kioskEnabled: readBoolean(item.kioskEnabled),
              aiManagerEnabled: readBoolean(item.aiManagerEnabled),
              billingHealth: readString(item.billingHealth, "Unavailable"),
              verificationStatus: readString(item.verificationStatus, "unverified")
            }))
          : [],
        release: isRecord(record.controls.release)
          ? {
              readyCount: readNumber(record.controls.release.readyCount),
              attentionCount: readNumber(record.controls.release.attentionCount)
            }
          : base.controls.release
      }
    : (degraded = true, base.controls);

  const auditLog = Array.isArray(record?.auditLog)
    ? readObjectArray(record.auditLog)
      .map(normalizeAuditLogEntry)
      .filter((entry): entry is PlatformAdminAuditLogEntry => Boolean(entry))
    : (degraded = true, base.auditLog);

  const warnings = uniqueWarnings([
    ...readStringArray(record?.warnings),
    ...(options?.warnings ?? []),
    ...(degraded ? [ARCHITECT_DEGRADED_WARNING] : [])
  ]);

  return {
    actorName: readString(record?.actorName, base.actorName),
    overview,
    users,
    shops,
    moneyRisk,
    support,
    controls,
    auditLog,
    warnings
  };
}
