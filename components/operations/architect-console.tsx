"use client";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  History,
  LifeBuoy,
  LockKeyhole,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Users,
  WalletCards
} from "lucide-react";
import { ARCHITECT_PRIMARY_NAV_ITEMS } from "@/components/architect-experience/architect-tab-config";
import { ArchitectFreelancePayoutQueue } from "@/components/architect/payouts/architect-freelance-payout-queue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataStatCard, GlassCard } from "@/design/components";
import { usePlatformAdminActionMutation, usePlatformAdminConsoleQuery } from "@/lib/platform-admin/client";
import { ARCHITECT_DEGRADED_WARNING, normalizePlatformAdminConsolePayload } from "@/lib/platform-admin/payload";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type {
  PlatformAdminActionClass,
  PlatformAdminActionInput,
  PlatformAdminAuditLogEntry,
  PlatformAdminConsolePayload
} from "@/types/platform-admin";
import type { BarberVerificationCategory, ShopVerificationCategory, VerificationStatus } from "@/types/trust";

type ArchitectSectionId = "overview" | "users" | "shops" | "money-risk" | "support" | "controls" | "audit-log";
type ArchitectConsoleMode = "legacy" | "home" | "money" | "settings";

type PendingActionState = {
  action: PlatformAdminActionInput;
  actionClass: PlatformAdminActionClass;
  title: string;
  detail: string;
  confirmLabel: string;
};

const sections: Array<{ id: ArchitectSectionId; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "users", label: "Users", icon: Users },
  { id: "shops", label: "Shops", icon: Store },
  { id: "money-risk", label: "Transactions", icon: WalletCards },
  { id: "support", label: "Support Tools", icon: LifeBuoy },
  { id: "controls", label: "Controls", icon: SlidersHorizontal },
  { id: "audit-log", label: "Audit Log", icon: History }
];

function getArchitectFocusTargetId(mode: ArchitectConsoleMode, focusSection?: string | null) {
  const normalized = focusSection?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (mode === "money") {
    switch (normalized) {
      case "transactions":
      case "revenue":
        return "architect-money-overview";
      case "payouts":
        return "architect-money-payouts";
      case "disputes":
        return "architect-money-payouts";
      case "refunds":
        return "architect-money-refunds";
      default:
        return null;
    }
  }

  if (mode === "settings") {
    switch (normalized) {
      case "platform":
      case "platform-settings":
        return "architect-settings-platform";
      case "roles":
        return "architect-settings-roles";
      case "integrations":
        return "architect-settings-integrations";
      case "logs":
        return "architect-settings-logs";
      case "audit":
        return "architect-settings-audit";
      case "support":
        return "architect-settings-support";
      default:
        return null;
    }
  }

  return null;
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function matchesSearch(values: Array<string | number | undefined | null>, query: string) {
  if (!query.trim()) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  return values.some((value) => `${value ?? ""}`.toLowerCase().includes(normalized));
}

function getActionClass(action: PlatformAdminActionInput): PlatformAdminActionClass {
  switch (action.type) {
    case "set_user_status":
      return action.nextStatus === "suspended" || action.nextStatus === "banned" ? "critical" : "sensitive";
    case "set_shop_status":
      return "critical";
    case "set_shop_control":
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

function isVerificationQueueStatus(value?: string | null) {
  const normalized = `${value ?? ""}`.toLowerCase();
  return normalized.includes("pending") || normalized.includes("submitted") || normalized.includes("review") || normalized.includes("needs");
}

function badgeClasses(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("verified") || normalized.includes("active") || normalized.includes("resolved") || normalized.includes("healthy")) {
    return "border-[#C4F24E]/16 bg-[#C4F24E]/10 text-[#e4f9b8]";
  }

  if (normalized.includes("pending") || normalized.includes("review") || normalized.includes("investigating")) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  if (
    normalized.includes("inactive")
    || normalized.includes("disabled")
    || normalized.includes("suspended")
    || normalized.includes("failed")
    || normalized.includes("rejected")
    || normalized.includes("critical")
    || normalized.includes("open")
  ) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }

  return "border-white/10 bg-black/20 text-white/72";
}

function actionToneClasses(actionClass: PlatformAdminActionClass) {
  switch (actionClass) {
    case "critical":
      return "border-rose-400/20 bg-rose-400/10 text-rose-100";
    case "sensitive":
      return "border-amber-300/20 bg-amber-300/10 text-amber-100";
    default:
      return "border-[#C4F24E]/16 bg-[#C4F24E]/10 text-[#e4f9b8]";
  }
}

function MetricCard({
  label,
  value,
  detail,
  accent = false
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <DataStatCard
      label={label}
      value={value}
      detail={detail}
      className={accent ? "border-[#C4F24E]/28 bg-[#C4F24E]/8" : undefined}
    />
  );
}

function QueueShortcutCard({
  title,
  count,
  detail,
  action
}: {
  title: string;
  count: string;
  detail: string;
  action: ReactNode;
}) {
  return (
    <GlassCard className="p-5">
      <p className="surface-label">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-white" data-display="true">{count}</p>
      <p className="mt-2 text-sm leading-7 text-white/58">{detail}</p>
      <div className="mt-4">{action}</div>
    </GlassCard>
  );
}

function AuditRow({ entry }: { entry: PlatformAdminAuditLogEntry }) {
  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-white">{formatLabel(entry.actionType)}</p>
            <span className={cn("status-pill", actionToneClasses(entry.actionClass))}>{formatLabel(entry.actionClass)}</span>
            <span className="status-pill text-white/72">{formatLabel(entry.targetType)}</span>
          </div>
          <p className="mt-3 text-sm text-white/58">Target {entry.targetId}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3 text-sm text-white/72">
          <p>{formatLabel(entry.actorRole)}</p>
          <p className="mt-1 text-white/52">{formatDateTime(entry.createdAt)}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="surface-label">Reason</p>
          <p className="mt-3 text-sm leading-7 text-white/62">{entry.note ?? "No note provided."}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="surface-label">Before</p>
          <p className="mt-3 text-sm leading-7 text-white/62">{entry.beforeSummary ?? "No before summary recorded."}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="surface-label">After</p>
          <p className="mt-3 text-sm leading-7 text-white/62">{entry.afterSummary ?? "No after summary recorded."}</p>
        </div>
      </div>
    </GlassCard>
  );
}

export function ArchitectConsole({
  initialData,
  mode = "legacy",
  focusSection
}: {
  initialData: PlatformAdminConsolePayload;
  mode?: ArchitectConsoleMode;
  focusSection?: string;
}) {
  const [activeSection, setActiveSection] = useState<ArchitectSectionId>("overview");
  const [userSearch, setUserSearch] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [supportSearch, setSupportSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [supportKindFilter, setSupportKindFilter] = useState("all");
  const [pendingAction, setPendingAction] = useState<PendingActionState | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const deferredUserSearch = useDeferredValue(userSearch);
  const deferredShopSearch = useDeferredValue(shopSearch);
  const deferredSupportSearch = useDeferredValue(supportSearch);
  const deferredAuditSearch = useDeferredValue(auditSearch);
  const consoleQuery = usePlatformAdminConsoleQuery(initialData);
  const actionMutation = usePlatformAdminActionMutation();
  const data = useMemo(() => normalizePlatformAdminConsolePayload(consoleQuery.data ?? initialData, {
    actorName: initialData.actorName
  }), [consoleQuery.data, initialData]);
  const isLegacyMode = mode === "legacy";
  const architectWarnings = useMemo(
    () => data.warnings.filter((warning) => warning !== ARCHITECT_DEGRADED_WARNING),
    [data.warnings]
  );

  useEffect(() => {
    const targetId = getArchitectFocusTargetId(mode, focusSection);
    if (!targetId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [focusSection, mode]);

  const filteredUsers = useMemo(() => data.users.filter((user) => {
    const roleMatch = userRoleFilter === "all" || user.primaryRole.toLowerCase() === userRoleFilter;
    const statusMatch = userStatusFilter === "all" || user.accountStatus === userStatusFilter;
    const searchMatch = matchesSearch(
      [user.name, user.email, user.phone, user.primaryRole, user.title, user.accountStatus, ...user.shopRelationships, ...user.accountHealth, ...user.supportFlags],
      deferredUserSearch
    );

    return roleMatch && statusMatch && searchMatch;
  }), [data.users, deferredUserSearch, userRoleFilter, userStatusFilter]);

  const filteredShops = useMemo(() => data.shops.filter((shop) => matchesSearch(
    [shop.name, shop.ownerLabel, shop.status, shop.billingHealth, shop.verificationStatus, shop.growthSummary, ...shop.locationLabels, ...shop.accountHealth],
    deferredShopSearch
  )), [data.shops, deferredShopSearch]);

  const filteredSupport = useMemo(() => data.support.filter((item) => {
    const kindMatch = supportKindFilter === "all" || item.kind === supportKindFilter;
    const searchMatch = matchesSearch([item.title, item.detail, item.statusLabel, item.relatedUserLabel, item.relatedShopLabel], deferredSupportSearch);
    return kindMatch && searchMatch;
  }), [data.support, deferredSupportSearch, supportKindFilter]);

  const filteredAudit = useMemo(() => data.auditLog.filter((entry) => matchesSearch(
    [entry.actionType, entry.actionClass, entry.targetType, entry.targetId, entry.actorRole, entry.note, entry.beforeSummary, entry.afterSummary],
    deferredAuditSearch
  )), [data.auditLog, deferredAuditSearch]);

  const uniqueRoles = useMemo(() => Array.from(new Set(data.users.map((user) => user.primaryRole.toLowerCase()))).sort(), [data.users]);
  const verificationBacklogCount = useMemo(() => {
    const barberBacklog = data.users.filter((user) => user.barberId && (
      isVerificationQueueStatus(user.verificationStatus)
      || user.verificationItems.some((item) => isVerificationQueueStatus(item.status))
    )).length;
    const shopBacklog = data.shops.filter((shop) => (
      isVerificationQueueStatus(shop.verificationStatus)
      || shop.verificationItems.some((item) => isVerificationQueueStatus(item.status))
    )).length;

    return barberBacklog + shopBacklog;
  }, [data.shops, data.users]);
  const accountControlBlockers = useMemo(
    () => data.users.filter((user) => user.accountStatus !== "active").length,
    [data.users]
  );
  const moneyAttentionCount = useMemo(
    () => data.moneyRisk.openAnomalies + data.moneyRisk.disputesOpen + data.overview.payoutIssues + data.overview.billingIssues,
    [data.moneyRisk.disputesOpen, data.moneyRisk.openAnomalies, data.overview.billingIssues, data.overview.payoutIssues]
  );
  const totalAttentionCount = verificationBacklogCount + moneyAttentionCount + accountControlBlockers;
  const hasQuietPlatformState = totalAttentionCount === 0 && data.overview.totalUsers === 0 && data.overview.bookingsToday === 0;

  const queueAction = (config: PendingActionState) => {
    setActionNote("");
    setPendingAction(config);
  };

  const confirmAction = async () => {
    if (!pendingAction) {
      return;
    }

    const note = actionNote.trim();
    if (pendingAction.actionClass !== "safe" && !note) {
      setFeedback({ tone: "error", message: "A reason is required for sensitive and critical Architect Console actions." });
      return;
    }

    try {
      await actionMutation.mutateAsync({
        ...pendingAction.action,
        note: note || undefined
      });
      setPendingAction(null);
      setActionNote("");
      setFeedback({ tone: "success", message: `${pendingAction.confirmLabel} applied and recorded in the audit log.` });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  };

  const usersSection = (
    <div className="space-y-4">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="surface-label">Users</p>
            <p className="mt-2 text-sm text-white/58">Search by identity, role, status, phone, or shop relationship.</p>
          </div>
          <span className="status-pill text-[#e4f9b8]">{filteredUsers.length} accounts in view</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
          <div>
            <label className="mb-2 block surface-label">Lookup</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" />
              <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} className="pl-11" placeholder="Name, email, phone, role, shop" />
            </div>
          </div>
          <div>
            <label className="mb-2 block surface-label">Role filter</label>
            <Select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value)}>
              <option value="all">All roles</option>
              {uniqueRoles.map((role) => <option key={role} value={role}>{formatLabel(role)}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-2 block surface-label">Status filter</label>
            <Select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
              <option value="profile_only">Profile only</option>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        {filteredUsers.map((user) => (
          <Card key={user.id} className="rounded-[30px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold text-white">{user.name}</p>
                  {user.isPlatformAdmin ? <span className="status-pill border-[#C4F24E]/20 bg-[#C4F24E]/10 text-[#e4f9b8]">Founder</span> : null}
                  <span className={cn("status-pill", badgeClasses(user.accountStatus))}>{formatLabel(user.accountStatus)}</span>
                  <span className={cn("status-pill", badgeClasses(user.verificationStatus))}>{formatLabel(user.verificationStatus)}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{user.primaryRole} - {user.title}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/46">
                  <span className="status-pill text-white/72">{user.email}</span>
                  {user.phone ? <span className="status-pill text-white/72">{user.phone}</span> : null}
                  {user.shopRelationships.map((relationship) => <span key={`${user.id}-${relationship}`} className="status-pill text-white/72">{relationship}</span>)}
                </div>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-3 text-sm text-white/72">
                <p className="surface-label">Account health</p>
                <p className="mt-2">{user.accountHealth.join(" - ")}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <MetricCard label="Completed" value={String(user.bookingSummary.completed)} detail="Completed bookings" />
              <MetricCard label="Active" value={String(user.bookingSummary.active)} detail="Bookings still moving" />
              <MetricCard label="Cancelled" value={String(user.bookingSummary.cancelled)} detail="Cancelled or no-show" />
              <MetricCard label="Lifetime value" value={currency(user.bookingSummary.lifetimeValue)} detail="Completed booking value" />
              <MetricCard label="Unlocked points" value={String(user.pointsSummary.unlockedPoints)} detail={`${user.pointsSummary.pendingPoints} pending`} />
              <MetricCard label="Referral credits" value={String(user.referralSummary.credited)} detail={`${user.referralSummary.completed} completed`} />
            </div>

            {user.canManageAccess ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/architect/users/${user.id}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#c4f24e]/20 hover:text-[#e4f9b8] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
                  Inspect account
                </Link>
                {user.accountStatus !== "active" ? (
                  <Button type="button" className="min-w-[10rem]" onClick={() => queueAction({
                    action: { type: "set_user_status", userId: user.id, nextStatus: "active" },
                    actionClass: getActionClass({ type: "set_user_status", userId: user.id, nextStatus: "active" }),
                    title: `Restore ${user.name}`,
                    detail: "This re-enables account access without rewriting canonical booking, wallet, payout, referral, or reward history.",
                    confirmLabel: "Reactivate account"
                  })}>Reactivate</Button>
                ) : (
                  <Button type="button" variant="secondary" className="min-w-[10rem]" onClick={() => queueAction({
                    action: { type: "set_user_status", userId: user.id, nextStatus: "deactivated" },
                    actionClass: getActionClass({ type: "set_user_status", userId: user.id, nextStatus: "deactivated" }),
                    title: `Deactivate ${user.name}`,
                    detail: "This removes access while preserving canonical history.",
                    confirmLabel: "Deactivate account"
                  })}>Deactivate</Button>
                )}
                {user.accountStatus !== "suspended" ? (
                  <Button type="button" variant="secondary" className="min-w-[10rem]" onClick={() => queueAction({
                    action: { type: "set_user_status", userId: user.id, nextStatus: "suspended" },
                    actionClass: getActionClass({ type: "set_user_status", userId: user.id, nextStatus: "suspended" }),
                    title: `Suspend ${user.name}`,
                    detail: "Use suspension only for abuse, fraud, or platform safety intervention.",
                    confirmLabel: "Suspend account"
                  })}>Suspend</Button>
                ) : null}
              </div>
            ) : null}

            {user.barberId && user.verificationItems.length ? (
              <div className="mt-4 space-y-3">
                <p className="surface-label">Verification controls</p>
                {user.verificationItems.map((item) => (
                  <div key={`${user.id}-${item.category}`} className="rounded-[20px] border border-white/8 bg-black/18 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{item.label}</p>
                        <p className="mt-1 text-sm text-white/55">{formatLabel(item.status)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(["pending", "verified", "rejected"] as VerificationStatus[]).map((status) => (
                          <Button
                            key={`${item.category}-${status}`}
                            type="button"
                            variant={status === "verified" ? "primary" : "secondary"}
                            className="min-w-[8.5rem]"
                            onClick={() => queueAction({
                              action: { type: "update_barber_verification", barberId: user.barberId!, category: item.category as BarberVerificationCategory, status },
                              actionClass: getActionClass({ type: "update_barber_verification", barberId: user.barberId!, category: item.category as BarberVerificationCategory, status }),
                              title: `Update ${user.name}'s ${item.label.toLowerCase()}`,
                              detail: `This changes the canonical barber verification record to ${formatLabel(status).toLowerCase()}.`,
                              confirmLabel: status === "verified" ? "Mark verified" : `Set ${formatLabel(status).toLowerCase()}`
                            })}
                          >
                            {formatLabel(status)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
        {!filteredUsers.length ? (
          <Card className="rounded-[30px] p-6">
            <p className="surface-label">No real accounts in this view</p>
            <p className="mt-3 text-sm leading-7 text-white/58">Architect account rows come only from production profiles. Adjust filters or wait for a real account to enter the platform.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
  const shopsSection = (
    <div className="space-y-4">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="surface-label">Shops</p>
            <p className="mt-2 text-sm text-white/58">Platform-level shop visibility, verification, billing posture, kiosk presence, and AI manager status.</p>
          </div>
          <span className="status-pill text-[#e4f9b8]">{filteredShops.length} shops in view</span>
        </div>
        <div className="mt-4">
          <label className="mb-2 block surface-label">Lookup</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" />
            <Input value={shopSearch} onChange={(event) => setShopSearch(event.target.value)} className="pl-11" placeholder="Shop, owner, location, billing, status" />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredShops.map((shop) => (
          <Card key={shop.id} className="rounded-[30px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold text-white">{shop.name}</p>
                  <span className={cn("status-pill", badgeClasses(shop.status))}>{formatLabel(shop.status)}</span>
                  <span className={cn("status-pill", badgeClasses(shop.verificationStatus))}>{formatLabel(shop.verificationStatus)}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">Owner {shop.ownerLabel}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/46">
                  {shop.locationLabels.map((locationLabel) => <span key={`${shop.id}-${locationLabel}`} className="status-pill text-white/72">{locationLabel}</span>)}
                </div>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-3 text-sm text-white/72">
                <p className="surface-label">Account health</p>
                <p className="mt-2">{shop.accountHealth.join(" - ")}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Active barbers" value={String(shop.activeBarbers)} detail="Barbers still active." />
              <MetricCard label="Floor service volume today" value={currency(shop.revenueToday)} detail="Operational barber service volume · not shop revenue." />
              <MetricCard label="Kiosk" value={shop.kioskEnabled ? "Enabled" : "Disabled"} detail="Front-desk kiosk posture." />
              <MetricCard label="AI manager" value={shop.aiManagerEnabled ? "Enabled" : "Disabled"} detail="Assistive AI posture." />
            </div>

            <div className="mt-4 rounded-[24px] border border-white/8 bg-black/18 p-4">
              <p className="surface-label">Growth and billing posture</p>
              <p className="mt-3 text-sm leading-7 text-white/62">{shop.growthSummary} - {shop.billingHealth}.</p>
            </div>

            {shop.verificationItems.length ? (
              <div className="mt-4 space-y-3">
                <p className="surface-label">Verification controls</p>
                {shop.verificationItems.map((item) => (
                  <div key={`${shop.id}-${item.category}`} className="rounded-[20px] border border-white/8 bg-black/18 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{item.label}</p>
                        <p className="mt-1 text-sm text-white/55">{formatLabel(item.status)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(["pending", "verified", "rejected"] as VerificationStatus[]).map((status) => (
                          <Button
                            key={`${item.category}-${status}`}
                            type="button"
                            variant={status === "verified" ? "primary" : "secondary"}
                            className="min-w-[8.5rem]"
                            onClick={() => queueAction({
                              action: { type: "update_shop_verification", shopId: shop.id, category: item.category as ShopVerificationCategory, status },
                              actionClass: getActionClass({ type: "update_shop_verification", shopId: shop.id, category: item.category as ShopVerificationCategory, status }),
                              title: `Update ${shop.name}'s ${item.label.toLowerCase()}`,
                              detail: `This changes the canonical shop verification record to ${formatLabel(status).toLowerCase()}.`,
                              confirmLabel: status === "verified" ? "Mark verified" : `Set ${formatLabel(status).toLowerCase()}`
                            })}
                          >
                            {formatLabel(status)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
        {!filteredShops.length ? (
          <Card className="rounded-[30px] p-6">
            <p className="surface-label">No real shops in this view</p>
            <p className="mt-3 text-sm leading-7 text-white/58">Shop rows come only from production shop records. When a real shop owner completes setup, it will appear here.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
  const moneyRiskSection = (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open anomalies" value={String(data.moneyRisk.openAnomalies)} detail="Open or investigating anomaly rows." accent />
        <MetricCard label="Critical anomalies" value={String(data.moneyRisk.criticalAnomalies)} detail="Highest-severity issues." />
        <MetricCard label="Disputes open" value={String(data.moneyRisk.disputesOpen)} detail="Open dispute records." />
        <MetricCard label="Overdue booth rent" value={String(data.moneyRisk.overdueBoothRent)} detail="Booth-rent rows currently overdue." />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Billing failures" value={String(data.moneyRisk.billingFailures)} detail="Billing or cash-out failures." />
        <MetricCard label="Points liability" value={currency(data.moneyRisk.pointsLiabilityValue)} detail="Outstanding reward liability." />
        <MetricCard label="Fraud review rate" value={`${data.moneyRisk.fraudReviewRate}%`} detail="Rewards landing in fraud review." />
        <MetricCard label="Reversal rate" value={`${data.moneyRisk.reversalRate}%`} detail="Reversed reward rate." />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Payout anomalies and holds</p>
              <p className="mt-2 text-sm text-white/58">Inspect or resolve financial anomalies without rewriting canonical balances.</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {data.moneyRisk.recentAnomalies.length ? data.moneyRisk.recentAnomalies.map((item) => (
              <div key={item.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.summary}</p>
                  <span className={cn("status-pill", badgeClasses(item.status))}>{formatLabel(item.status)}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{item.description ?? "No additional anomaly detail recorded."}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" className="min-w-[9rem]" onClick={() => queueAction({
                    action: { type: "resolve_financial_anomaly", anomalyId: item.id },
                    actionClass: getActionClass({ type: "resolve_financial_anomaly", anomalyId: item.id }),
                    title: `Resolve ${item.summary}`,
                    detail: "Use this only when the canonical anomaly is fully reviewed and ready to close.",
                    confirmLabel: "Resolve anomaly"
                  })}>Resolve</Button>
                  <Button type="button" variant="secondary" className="min-w-[9rem]" onClick={() => queueAction({
                    action: { type: "dismiss_financial_anomaly", anomalyId: item.id },
                    actionClass: getActionClass({ type: "dismiss_financial_anomaly", anomalyId: item.id }),
                    title: `Dismiss ${item.summary}`,
                    detail: "Dismiss only when the anomaly is confirmed as non-actionable or false positive.",
                    confirmLabel: "Dismiss anomaly"
                  })}>Dismiss</Button>
                </div>
              </div>
            )) : <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">No live financial anomalies are currently open.</div>}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Recent cash-out review</p>
              <WalletCards className="h-5 w-5 text-[#d9f985]" />
            </div>
            <div className="mt-4 space-y-3">
              {data.moneyRisk.recentCashouts.length ? data.moneyRisk.recentCashouts.map((item) => (
                <div key={item.requestId} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-white">{item.userLabel}</p>
                    <span className={cn("status-pill", badgeClasses(item.status))}>{formatLabel(item.status)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{formatLabel(item.role)} - {currency(item.cashValue)}</p>
                </div>
              )) : <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">No recent cash-out reviews available.</div>}
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Recent disputes</p>
              <ShieldAlert className="h-5 w-5 text-[#d9f985]" />
            </div>
            <div className="mt-4 space-y-3">
              {data.moneyRisk.recentDisputes.length ? data.moneyRisk.recentDisputes.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-white">{item.summary}</p>
                    <span className={cn("status-pill", badgeClasses(item.status))}>{formatLabel(item.status)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{item.locationId ? `Location ${item.locationId}` : "No location scope recorded."}</p>
                  {item.status.toLowerCase() !== "resolved" && item.status.toLowerCase() !== "closed" ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" className="min-w-[10rem]" onClick={() => queueAction({
                        action: { type: "resolve_dispute", disputeId: item.id },
                        actionClass: getActionClass({ type: "resolve_dispute", disputeId: item.id }),
                        title: `Resolve ${item.summary}`,
                        detail: "Use this only when the canonical dispute record has been reviewed and is ready to close. This action is audit-logged.",
                        confirmLabel: "Resolve dispute"
                      })}>
                        Resolve dispute
                      </Button>
                    </div>
                  ) : null}
                </div>
              )) : <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">No open disputes in platform scope.</div>}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
  const supportSection = (
    <div className="space-y-4">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="surface-label">Support tools</p>
            <p className="mt-2 text-sm text-white/58">Inspect booking, payout, points, referral, queue, and kiosk issues without silently rewriting history.</p>
          </div>
          <span className="status-pill text-[#e4f9b8]">{filteredSupport.length} items in view</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_240px]">
          <div>
            <label className="mb-2 block surface-label">Lookup</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" />
              <Input value={supportSearch} onChange={(event) => setSupportSearch(event.target.value)} className="pl-11" placeholder="Booking id, payout, points, referral, queue, kiosk" />
            </div>
          </div>
          <div>
            <label className="mb-2 block surface-label">Support lane</label>
            <Select value={supportKindFilter} onChange={(event) => setSupportKindFilter(event.target.value)}>
              <option value="all">All lanes</option>
              <option value="booking">Booking</option>
              <option value="payout">Payout</option>
              <option value="points">Points</option>
              <option value="referral">Referral</option>
              <option value="queue">Queue</option>
              <option value="kiosk">Kiosk</option>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredSupport.map((item) => (
          <Card key={item.id} className="rounded-[30px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-white">{item.title}</p>
                  <span className={cn("status-pill", badgeClasses(item.statusLabel))}>{formatLabel(item.statusLabel)}</span>
                  <span className="status-pill text-white/72">{formatLabel(item.kind)}</span>
                </div>
                <p className="mt-3 text-sm leading-7 text-white/62">{item.detail}</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-3 text-sm text-white/72">
                <p>{item.relatedUserLabel ?? "No related user"}</p>
                <p className="mt-1 text-white/52">{item.relatedShopLabel ?? "No related shop"}</p>
              </div>
            </div>
            {item.href ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={item.href} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#c4f24e]/20 hover:text-[#e4f9b8] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
                  Open lane
                </a>
              </div>
            ) : null}
          </Card>
        ))}
        {!filteredSupport.length ? (
          <Card className="rounded-[30px] p-6">
            <p className="surface-label">No real support items in this view</p>
            <p className="mt-3 text-sm leading-7 text-white/58">Support rows are generated from live production operations only. Nothing is fabricated when there is no activity.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
  const controlsSection = (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Platform controls</p>
              <p className="mt-2 text-sm text-white/58">Only founder-safe toggles that already map to canonical control state are exposed here.</p>
            </div>
            <LockKeyhole className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Release-ready" value={String(data.controls.release.readyCount)} detail="Checks currently clear." accent />
            <MetricCard label="Needs attention" value={String(data.controls.release.attentionCount)} detail="Readiness issues still open." />
            <MetricCard label="Kiosk-enabled shops" value={String(data.controls.shops.filter((shop) => shop.kioskEnabled).length)} detail="Shops live on kiosk mode." />
            <MetricCard label="AI-enabled shops" value={String(data.controls.shops.filter((shop) => shop.aiManagerEnabled).length)} detail="Shops live on AI manager assist mode." />
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Action safety model</p>
              <p className="mt-2 text-sm text-white/58">Keep the founder console powerful without turning it into an unsafe back door.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-[22px] border border-[#C4F24E]/16 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Safe</p><p className="mt-2 text-sm leading-7 text-white/62">Visibility and routing that do not change canonical truth.</p></div>
            <div className="rounded-[22px] border border-amber-300/20 bg-amber-300/10 p-4"><p className="surface-label text-amber-100">Sensitive</p><p className="mt-2 text-sm leading-7 text-white/62">Access, verification, and feature-control changes. Confirmation and reason required.</p></div>
            <div className="rounded-[22px] border border-rose-400/20 bg-rose-400/10 p-4"><p className="surface-label text-rose-100">Critical</p><p className="mt-2 text-sm leading-7 text-white/62">Suspensions and anomaly resolutions. Confirmation, reason, and audit trail required.</p></div>
          </div>
        </Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.controls.shops.map((shop) => (
          <Card key={`control-${shop.shopId}`} className="rounded-[30px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold text-white">{shop.shopName}</p>
                  <span className={cn("status-pill", badgeClasses(shop.shopStatus))}>{formatLabel(shop.shopStatus)}</span>
                  <span className={cn("status-pill", badgeClasses(shop.verificationStatus))}>{formatLabel(shop.verificationStatus)}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{shop.billingHealth}</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-3 text-sm text-white/72">
                <p>Kiosk {shop.kioskEnabled ? "enabled" : "disabled"}</p>
                <p className="mt-1">AI manager {shop.aiManagerEnabled ? "enabled" : "disabled"}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" className="min-w-[10rem]" onClick={() => queueAction({
                action: { type: "set_shop_status", shopId: shop.shopId, nextStatus: shop.shopStatus === "active" ? "inactive" : "active" },
                actionClass: getActionClass({ type: "set_shop_status", shopId: shop.shopId, nextStatus: shop.shopStatus === "active" ? "inactive" : "active" }),
                title: `${shop.shopStatus === "active" ? "Deactivate" : "Activate"} ${shop.shopName}`,
                detail: "This changes the shop's platform status without rewriting bookings, wallets, payouts, referrals, or rewards.",
                confirmLabel: shop.shopStatus === "active" ? "Deactivate shop" : "Activate shop"
              })}>{shop.shopStatus === "active" ? "Deactivate shop" : "Activate shop"}</Button>
              <Button type="button" variant={shop.kioskEnabled ? "secondary" : "primary"} className="min-w-[10rem]" onClick={() => queueAction({
                action: { type: "set_shop_control", shopId: shop.shopId, controlKey: "kiosk_enabled", enabled: !shop.kioskEnabled },
                actionClass: getActionClass({ type: "set_shop_control", shopId: shop.shopId, controlKey: "kiosk_enabled", enabled: !shop.kioskEnabled }),
                title: `${shop.kioskEnabled ? "Disable" : "Enable"} kiosk for ${shop.shopName}`,
                detail: "This changes the live kiosk availability gate without introducing a second kiosk system.",
                confirmLabel: shop.kioskEnabled ? "Disable kiosk" : "Enable kiosk"
              })}>{shop.kioskEnabled ? "Disable kiosk" : "Enable kiosk"}</Button>
              <Button type="button" variant={shop.aiManagerEnabled ? "secondary" : "primary"} className="min-w-[10rem]" onClick={() => queueAction({
                action: { type: "set_shop_control", shopId: shop.shopId, controlKey: "ai_manager_enabled", enabled: !shop.aiManagerEnabled },
                actionClass: getActionClass({ type: "set_shop_control", shopId: shop.shopId, controlKey: "ai_manager_enabled", enabled: !shop.aiManagerEnabled }),
                title: `${shop.aiManagerEnabled ? "Disable" : "Enable"} AI manager for ${shop.shopName}`,
                detail: "This changes the live AI manager availability gate without introducing a second automation layer.",
                confirmLabel: shop.aiManagerEnabled ? "Disable AI manager" : "Enable AI manager"
              })}>{shop.aiManagerEnabled ? "Disable" : "Enable"} AI manager</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
  const auditSection = (
    <div className="space-y-4">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="surface-label">Admin audit log</p>
            <p className="mt-2 text-sm text-white/58">Every sensitive founder action is traceable by actor, target, reason, before, and after.</p>
          </div>
          <span className="status-pill text-[#e4f9b8]">{filteredAudit.length} entries in view</span>
        </div>
        <div className="mt-4">
          <label className="mb-2 block surface-label">Search audit trail</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" />
            <Input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} className="pl-11" placeholder="Action, target, reason, actor" />
          </div>
        </div>
        </Card>
        <div className="grid gap-4">
          {filteredAudit.length ? (
            filteredAudit.map((entry) => <AuditRow key={entry.id} entry={entry} />)
          ) : (
            <Card className="rounded-[30px] p-6">
              <p className="surface-label">No audit entries yet</p>
              <p className="mt-3 text-sm leading-7 text-white/58">
                Sensitive founder actions will appear here once the Architect Console begins recording live interventions.
              </p>
            </Card>
          )}
        </div>
      </div>
    );
  const homeSection = (
    <div className="space-y-4">
      <Card className="rounded-[34px] border-[#C4F24E]/12 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.08),rgba(10,10,10,0.86)_46%,rgba(0,0,0,0.92))] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="surface-label text-[#e4f9b8]">Mission control</p>
            <h2 className="mt-3 max-w-3xl text-2xl font-semibold text-white sm:text-4xl" data-display="true">
              Platform signals first. Deep tools one tap away.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
              Money, verification, access, and diagnostics stay visible here without duplicating the underlying operator flows.
            </p>
          </div>
          <Link href="/architect/debug" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#C4F24E]/24 bg-[#C4F24E]/10 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#C4F24E]/35 hover:text-[#e4f9b8]">
            Open debug console
          </Link>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
            <p className="surface-label">Money health</p>
            <p className="mt-3 text-2xl font-semibold text-white">{moneyAttentionCount}</p>
            <p className="mt-2 text-sm leading-6 text-white/56">Payout, billing, dispute, and anomaly signals needing eyes.</p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
            <p className="surface-label">Verification watch</p>
            <p className="mt-3 text-2xl font-semibold text-white">{verificationBacklogCount}</p>
            <p className="mt-2 text-sm leading-6 text-white/56">Barber and shop trust records waiting for review.</p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
            <p className="surface-label">Access posture</p>
            <p className="mt-3 text-2xl font-semibold text-white">{accountControlBlockers}</p>
            <p className="mt-2 text-sm leading-6 text-white/56">Suspended, deactivated, or blocked accounts in scope.</p>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total users" value={String(data.overview.totalUsers)} detail="Accounts inside platform scope." accent />
        <MetricCard label="Active clients" value={String(data.overview.activeClients)} detail="Client accounts still live." />
        <MetricCard label="Active barbers" value={String(data.overview.activeBarbers)} detail="Barbers still active." />
        <MetricCard label="Active shops" value={String(data.overview.activeShops)} detail="Shops with active platform posture." />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Bookings today" value={String(data.overview.bookingsToday)} detail="Canonical bookings for the current business date." />
        <MetricCard label="Service volume today" value={currency(data.overview.revenueToday)} detail="Canonical platform service-payment volume, not owner income." />
        <MetricCard label="Payout issues" value={String(data.overview.payoutIssues)} detail="Payout blockers needing review." />
        <MetricCard label="Billing issues" value={String(data.overview.billingIssues)} detail="Subscriptions or billing rows needing attention." />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Verification queue" value={String(verificationBacklogCount)} detail="Live barber and shop reviews still waiting." accent={verificationBacklogCount > 0} />
        <MetricCard label="Disputes open" value={String(data.moneyRisk.disputesOpen)} detail="Canonical dispute records still open." />
        <MetricCard label="Account blockers" value={String(accountControlBlockers)} detail="Accounts currently deactivated, suspended, or banned." />
        <MetricCard label="Attention items" value={String(totalAttentionCount)} detail="Verification, money, and access issues needing review." accent={totalAttentionCount > 0} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Platform health</p>
              <p className="mt-2 text-sm text-white/58">Control-tower visibility across readiness, kiosk, AI manager, and reward liability.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Fraud flags" value={String(data.overview.fraudFlags)} detail="Trust or anomaly flags still open." />
            <MetricCard label="Kiosk active" value={String(data.overview.kioskActiveCount)} detail="Shops still live on kiosk mode." />
            <MetricCard label="AI manager active" value={String(data.overview.aiManagerActiveCount)} detail="Shops still running assist mode." />
            <MetricCard label="Release-ready" value={String(data.overview.releaseReadyCount)} detail="Readiness checks currently clear." accent />
            <MetricCard label="Needs attention" value={String(data.overview.releaseAttentionCount)} detail="Release-readiness issues still open." />
            <MetricCard label="Points liability" value={currency(data.moneyRisk.pointsLiabilityValue)} detail="Outstanding reward liability." />
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Immediate attention</p>
              <p className="mt-2 text-sm text-white/58">The highest-signal items to review first.</p>
            </div>
            <ShieldAlert className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {data.moneyRisk.recentAnomalies.length ? data.moneyRisk.recentAnomalies.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.summary}</p>
                  <span className={cn("status-pill", badgeClasses(item.status))}>{formatLabel(item.status)}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{item.description ?? "No additional anomaly detail recorded."}</p>
              </div>
            )) : (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                No live financial anomalies are currently open.
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <QueueShortcutCard
          title="Verification queue"
          count={String(verificationBacklogCount)}
          detail="Review pending barber and shop trust records."
          action={(
            <Link href="/architect/verifications" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#C4F24E]/24 bg-[#C4F24E]/10 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#C4F24E]/35 hover:text-[#e4f9b8] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
              Open verification queue
            </Link>
          )}
        />
        <QueueShortcutCard
          title="Transaction monitor"
          count={String(moneyAttentionCount)}
          detail="Inspect payouts, anomalies, and disputes from canonical money truth."
          action={(
            isLegacyMode ? (
              <Button type="button" variant="secondary" className="min-w-[11rem]" onClick={() => setActiveSection("money-risk")}>
                Open transactions
              </Button>
            ) : (
              <Link href="/architect/money" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#c4f24e]/20 hover:text-[#e4f9b8] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
                Open money
              </Link>
            )
          )}
        />
        <QueueShortcutCard
          title="User control"
          count={String(accountControlBlockers)}
          detail="Search accounts, inspect identity state, and apply access controls safely."
          action={(
            <Link href="/architect/users" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#c4f24e]/20 hover:text-[#e4f9b8] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
              Open user search
            </Link>
          )}
        />
        <QueueShortcutCard
          title="Support queue"
          count={String(data.support.length)}
          detail="Follow real booking, payout, kiosk, and queue issues without synthetic filler."
          action={(
            isLegacyMode ? (
              <Button type="button" variant="secondary" className="min-w-[11rem]" onClick={() => setActiveSection("support")}>
                Open support tools
              </Button>
            ) : (
              <Link href="/architect/settings?section=support" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#c4f24e]/20 hover:text-[#e4f9b8] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
                Open settings
              </Link>
            )
          )}
        />
      </section>

      {hasQuietPlatformState ? (
        <Card className="rounded-[32px] border border-dashed border-white/10 p-6">
          <p className="surface-label">Platform activity is quiet right now</p>
          <p className="mt-3 text-sm leading-7 text-white/58">
            There are no live verification, transaction, or account-control blockers in scope yet. As real platform activity arrives, the architect lane will surface it here without synthetic filler.
          </p>
        </Card>
      ) : null}
    </div>
  );
  const moneyTabSection = (
    <div className="space-y-4">
      <section id="architect-money-overview" className="grid scroll-mt-24 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Today GMV" value={currency(data.overview.revenueToday)} detail="Canonical platform money in scope today." accent />
        <MetricCard label="Payment issues" value={String(data.overview.billingIssues)} detail="Billing and transaction failures needing review." />
        <MetricCard label="Payout blockers" value={String(data.overview.payoutIssues)} detail="Payout routing issues still blocking movement." />
        <MetricCard label="Disputes open" value={String(data.moneyRisk.disputesOpen)} detail="Live canonical dispute records still open." />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open anomalies" value={String(data.moneyRisk.openAnomalies)} detail="Financial anomalies currently in review." />
        <MetricCard label="Critical anomalies" value={String(data.moneyRisk.criticalAnomalies)} detail="Highest-severity money issues." />
        <MetricCard label="Points liability" value={currency(data.moneyRisk.pointsLiabilityValue)} detail="Outstanding reward liability tracked canonically." />
        <MetricCard label="Overdue booth rent" value={String(data.moneyRisk.overdueBoothRent)} detail="Booth-rent rows currently overdue." />
      </section>

      <div id="architect-money-payouts" className="scroll-mt-24">
        <ArchitectFreelancePayoutQueue />
        <div className="mt-4">
        {moneyRiskSection}
        </div>
      </div>

      <Card id="architect-money-refunds" className="scroll-mt-24 rounded-[32px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="surface-label">Refund status</p>
            <p className="mt-2 text-sm text-white/58">
              Refund review remains tied to canonical payment records. This Tier 1 money surface does not fabricate a second refund ledger.
            </p>
          </div>
          <WalletCards className="h-5 w-5 text-[#d9f985]" />
        </div>
        <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
          No standalone refund feed is exposed in the architect money layer yet. Review disputes, payment failures, and audit history from the canonical money truth above.
        </div>
      </Card>
    </div>
  );
  const settingsTabSection = (
    <div className="space-y-4">
      <section id="architect-settings-platform" className="grid scroll-mt-24 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Kiosk-enabled shops" value={String(data.controls.shops.filter((shop) => shop.kioskEnabled).length)} detail="Canonical kiosk posture still live." accent />
        <MetricCard label="AI-enabled shops" value={String(data.controls.shops.filter((shop) => shop.aiManagerEnabled).length)} detail="AI operator posture currently active." />
        <MetricCard label="Release-ready" value={String(data.controls.release.readyCount)} detail="Checks currently clear." />
        <MetricCard label="Needs attention" value={String(data.controls.release.attentionCount)} detail="Readiness issues still open." />
      </section>

      <Card id="architect-settings-roles" className="scroll-mt-24 rounded-[32px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="surface-label">Roles and permissions</p>
            <p className="mt-2 text-sm text-white/58">Architect remains protected by canonical platform-admin authorization on top of shared auth/session identity.</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-[#d9f985]" />
        </div>
        <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-white/62">
          Platform-admin access, verification actions, account controls, and money interventions continue to flow through canonical architect guards and audit-safe mutation rails.
        </div>
      </Card>

      <Card id="architect-settings-integrations" className="scroll-mt-24 rounded-[32px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="surface-label">Integrations</p>
            <p className="mt-2 text-sm text-white/58">Stripe, Supabase, Twilio, and deployment integrations remain part of the canonical platform stack.</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-[#d9f985]" />
        </div>
        <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
          No live integration status panel is available in architect Tier 1 yet. This settings tab stays honest rather than inventing health checks that do not exist.
        </div>
      </Card>

      <Card id="architect-settings-logs" className="scroll-mt-24 rounded-[32px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="surface-label">System logs</p>
            <p className="mt-2 text-sm text-white/58">Operational and event logs stay canonical. When explicit log streams are unavailable, this view shows a clean empty state.</p>
          </div>
          <History className="h-5 w-5 text-[#d9f985]" />
        </div>
        <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
          No system log panel is exposed in architect Tier 1 yet. Audit entries and platform support records below remain the live operator truth currently available.
        </div>
      </Card>

      <div id="architect-settings-support" className="scroll-mt-24">
        {supportSection}
      </div>
      <div>{controlsSection}</div>
      <div id="architect-settings-audit" className="scroll-mt-24">
        {auditSection}
      </div>
    </div>
  );
  const section = sections.find((item) => item.id === activeSection) ?? sections[0];
  const currentTabLabel = mode === "home"
    ? "Home"
    : mode === "money"
      ? "Money"
      : mode === "settings"
        ? "Settings"
        : section.label;
  const CurrentTabIcon = mode === "home"
    ? Activity
    : mode === "money"
      ? WalletCards
      : mode === "settings"
        ? SlidersHorizontal
        : section.icon;
  const pageTitle = mode === "home"
    ? "Architect Home"
    : mode === "money"
      ? "Architect Money"
      : mode === "settings"
        ? "Architect Settings"
        : "Architect Console";
  const pageDescription = mode === "home"
    ? "Platform health, trust posture, user control, and money risk from canonical operator data only."
    : mode === "money"
      ? "Financial oversight for transactions, payouts, disputes, fees, and refund posture without inventing a second money truth."
      : mode === "settings"
        ? "Platform configuration, roles, logs, integrations, audit history, and support tooling that stay grounded in canonical admin rails."
        : "Hidden platform oversight for users, shops, risk, support, controls, and auditability. This console sits above all business roles without rewriting canonical money or booking truth directly.";
  const sectionContent = mode === "home"
    ? homeSection
    : mode === "money"
      ? moneyTabSection
      : mode === "settings"
        ? settingsTabSection
        : activeSection === "overview"
          ? homeSection
          : activeSection === "users"
            ? usersSection
            : activeSection === "shops"
              ? shopsSection
              : activeSection === "money-risk"
                ? moneyRiskSection
                : activeSection === "support"
                  ? supportSection
                  : activeSection === "controls"
                    ? controlsSection
                    : activeSection === "audit-log"
                      ? auditSection
                      : (
    <Card className="rounded-[32px] p-6">
      <p className="surface-label">{section.label}</p>
      <p className="mt-3 text-sm leading-7 text-white/62">This Architect Console section is being hydrated from canonical platform data and founder-safe action rails.</p>
    </Card>
  );

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card className="rounded-[36px] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.92),rgba(5,5,5,0.96))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="editorial-kicker">
                <span className="accent-rule" />
                {mode === "legacy" ? "Founder-only control plane" : "Platform-admin control plane"}
              </div>
              <h1 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{pageTitle}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
                {pageDescription}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[22rem]">
              <div className="rounded-[24px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4">
                <p className="surface-label text-[#e4f9b8]">Operating as</p>
                <p className="mt-3 text-lg font-semibold text-white">{data.actorName}</p>
                <p className="mt-2 text-sm text-white/62">Platform administrator lane</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">{mode === "legacy" ? "Current section" : "Current tab"}</p>
                <div className="mt-3 flex items-center gap-2 text-white">
                  <CurrentTabIcon className="h-4 w-4 text-[#d9f985]" />
                  <span className="font-medium">{currentTabLabel}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">Sensitive actions always require confirmation.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-5">
            <Link href="/architect/verifications" className="inline-flex min-h-12 items-center rounded-full border border-[#C4F24E]/24 bg-[#C4F24E]/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:border-[#C4F24E]/35 hover:text-[#e4f9b8] sm:text-[11px] sm:tracking-[0.2em]">
              Open verification queue
            </Link>
            <Link href="/architect/users" className="inline-flex min-h-12 items-center rounded-full border border-white/8 bg-black/20 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:border-[#C4F24E]/20 hover:text-white sm:text-[11px] sm:tracking-[0.2em]">
              Open user search
            </Link>
            {isLegacyMode
              ? sections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "inline-flex min-h-12 items-center gap-2 rounded-full border px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] transition sm:text-[11px] sm:tracking-[0.2em]",
                    activeSection === item.id
                      ? "border-[#C4F24E]/24 bg-[#C4F24E]/10 text-white"
                      : "border-white/8 bg-black/20 text-white/68 hover:border-[#C4F24E]/20 hover:text-white"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", activeSection === item.id ? "text-[#e4f9b8]" : "text-[#d9f985]")} />
                  {item.label}
                </button>
              ))
              : ARCHITECT_PRIMARY_NAV_ITEMS
                .filter((item) => item.label !== currentTabLabel)
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="inline-flex min-h-12 items-center rounded-full border border-white/8 bg-black/20 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:border-[#C4F24E]/20 hover:text-white sm:text-[11px] sm:tracking-[0.2em]"
                  >
                    {item.label}
                  </Link>
                ))}
          </div>
        </Card>

        {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
        {consoleQuery.error ? <FeedbackBanner tone="error" message={getReadableActionError(consoleQuery.error)} /> : null}
        {data.warnings.length ? (
          <Card className="rounded-[28px] border border-amber-300/18 bg-amber-300/8 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-100" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-50">{ARCHITECT_DEGRADED_WARNING}</p>
                {architectWarnings.length ? (
                  <div className="space-y-1 text-sm leading-6 text-white/70">
                    {architectWarnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}
        {sectionContent}
      </div>

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-3 py-3 sm:items-center sm:px-6">
          <div className="w-full max-w-2xl rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.98))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="surface-label">Confirm Architect Console action</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">{pendingAction.title}</h2>
              </div>
              <span className={cn("status-pill", actionToneClasses(pendingAction.actionClass))}>{formatLabel(pendingAction.actionClass)}</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/62">{pendingAction.detail}</p>
            <div className="mt-5">
              <label className="mb-2 block surface-label">Reason</label>
              <textarea
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
                rows={4}
                placeholder="Why is this change necessary?"
                className="min-h-[7.5rem] w-full rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 py-4 text-sm text-[#f5f1e8] outline-none transition placeholder:text-white/32 focus:border-[#C4F24E]/55 focus:shadow-[0_0_0_4px_rgba(196, 242, 78,0.10)]"
              />
              <p className="mt-2 text-sm text-white/48">Sensitive and critical actions require a reason and will be written into the platform audit log.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" className="min-w-[10rem]" disabled={actionMutation.isPending} onClick={confirmAction}>
                {actionMutation.isPending ? "Applying..." : pendingAction.confirmLabel}
              </Button>
              <Button type="button" variant="secondary" className="min-w-[8rem]" disabled={actionMutation.isPending} onClick={() => {
                setActionNote("");
                setPendingAction(null);
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
