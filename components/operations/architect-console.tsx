"use client";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  { id: "money-risk", label: "Money / Risk", icon: WalletCards },
  { id: "support", label: "Support Tools", icon: LifeBuoy },
  { id: "controls", label: "Controls", icon: SlidersHorizontal },
  { id: "audit-log", label: "Audit Log", icon: History }
];

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
      return action.nextStatus === "suspended" ? "critical" : "sensitive";
    case "set_shop_status":
      return "critical";
    case "set_shop_control":
    case "update_barber_verification":
    case "update_shop_verification":
      return "sensitive";
    case "resolve_financial_anomaly":
    case "dismiss_financial_anomaly":
      return "critical";
    default:
      return "safe";
  }
}

function badgeClasses(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("verified") || normalized.includes("active") || normalized.includes("resolved") || normalized.includes("healthy")) {
    return "border-[#7CFF00]/16 bg-[#7CFF00]/10 text-[#d7ffab]";
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
      return "border-[#7CFF00]/16 bg-[#7CFF00]/10 text-[#d7ffab]";
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
    <div className={cn("rounded-[24px] border p-4", accent ? "border-[#7CFF00]/18 bg-[#7CFF00]/8" : "border-white/8 bg-black/20")}>
      <p className={cn("surface-label", accent ? "text-[#d7ffab]" : undefined)}>{label}</p>
      <p className="mt-3 text-3xl font-semibold" data-display="true">{value}</p>
      <p className="mt-2 text-sm text-white/58">{detail}</p>
    </div>
  );
}

function AuditRow({ entry }: { entry: PlatformAdminAuditLogEntry }) {
  return (
    <Card className="rounded-[30px] p-6">
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
    </Card>
  );
}

export function ArchitectConsole({ initialData }: { initialData: PlatformAdminConsolePayload }) {
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
  const architectWarnings = useMemo(
    () => data.warnings.filter((warning) => warning !== ARCHITECT_DEGRADED_WARNING),
    [data.warnings]
  );

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

  const section = sections.find((item) => item.id === activeSection) ?? sections[0];
  const usersSection = (
    <div className="space-y-4">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="surface-label">Users</p>
            <p className="mt-2 text-sm text-white/58">Search by identity, role, status, phone, or shop relationship.</p>
          </div>
          <span className="status-pill text-[#d7ffab]">{filteredUsers.length} users in view</span>
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
                  {user.isPlatformAdmin ? <span className="status-pill border-[#7CFF00]/20 bg-[#7CFF00]/10 text-[#d7ffab]">Founder</span> : null}
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
          <span className="status-pill text-[#d7ffab]">{filteredShops.length} shops in view</span>
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
              <MetricCard label="Revenue today" value={currency(shop.revenueToday)} detail="Canonical revenue in scope today." />
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
            <AlertTriangle className="h-5 w-5 text-[#baff69]" />
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
              <WalletCards className="h-5 w-5 text-[#baff69]" />
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
              <ShieldAlert className="h-5 w-5 text-[#baff69]" />
            </div>
            <div className="mt-4 space-y-3">
              {data.moneyRisk.recentDisputes.length ? data.moneyRisk.recentDisputes.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-white">{item.summary}</p>
                    <span className={cn("status-pill", badgeClasses(item.status))}>{formatLabel(item.status)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{item.locationId ? `Location ${item.locationId}` : "No location scope recorded."}</p>
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
          <span className="status-pill text-[#d7ffab]">{filteredSupport.length} items in view</span>
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
                <a href={item.href} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/20 hover:text-[#d7ffab] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
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
            <LockKeyhole className="h-5 w-5 text-[#baff69]" />
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
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-[22px] border border-[#7CFF00]/16 bg-[#7CFF00]/8 p-4"><p className="surface-label text-[#d7ffab]">Safe</p><p className="mt-2 text-sm leading-7 text-white/62">Visibility and routing that do not change canonical truth.</p></div>
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
          <span className="status-pill text-[#d7ffab]">{filteredAudit.length} entries in view</span>
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
  const sectionContent = activeSection === "overview" ? (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total users" value={String(data.overview.totalUsers)} detail="Accounts inside platform scope." accent />
        <MetricCard label="Active clients" value={String(data.overview.activeClients)} detail="Client accounts still live." />
        <MetricCard label="Active barbers" value={String(data.overview.activeBarbers)} detail="Barbers still active." />
        <MetricCard label="Active shops" value={String(data.overview.activeShops)} detail="Shops with active platform posture." />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Bookings today" value={String(data.overview.bookingsToday)} detail="Canonical bookings for the current business date." />
        <MetricCard label="Revenue today" value={currency(data.overview.revenueToday)} detail="Canonical platform analytics revenue." />
        <MetricCard label="Payout issues" value={String(data.overview.payoutIssues)} detail="Payout blockers needing review." />
        <MetricCard label="Billing issues" value={String(data.overview.billingIssues)} detail="Subscriptions or billing rows needing attention." />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Platform health</p>
              <p className="mt-2 text-sm text-white/58">Control-tower visibility across readiness, kiosk, AI manager, and reward liability.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
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
            <ShieldAlert className="h-5 w-5 text-[#baff69]" />
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
    </div>
  ) : activeSection === "users" ? usersSection : activeSection === "shops" ? shopsSection : activeSection === "money-risk" ? moneyRiskSection : activeSection === "support" ? supportSection : activeSection === "controls" ? controlsSection : activeSection === "audit-log" ? auditSection : (
    <Card className="rounded-[32px] p-6">
      <p className="surface-label">{section.label}</p>
      <p className="mt-3 text-sm leading-7 text-white/62">This Architect Console section is being hydrated from canonical platform data and founder-safe action rails.</p>
    </Card>
  );

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card className="rounded-[34px] p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="editorial-kicker">
                <span className="accent-rule" />
                Founder-only control plane
              </div>
              <h1 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Architect Console</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
                Hidden platform oversight for users, shops, risk, support, controls, and auditability. This console sits above all business roles without rewriting canonical money or booking truth directly.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[22rem]">
              <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
                <p className="surface-label text-[#d7ffab]">Operating as</p>
                <p className="mt-3 text-lg font-semibold text-white">{data.actorName}</p>
                <p className="mt-2 text-sm text-white/62">Platform administrator lane</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Current section</p>
                <div className="mt-3 flex items-center gap-2 text-white">
                  <section.icon className="h-4 w-4 text-[#baff69]" />
                  <span className="font-medium">{section.label}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">Sensitive actions always require confirmation.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/architect/verifications" className="inline-flex min-h-12 items-center rounded-full border border-[#7CFF00]/24 bg-[#7CFF00]/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:border-[#7CFF00]/35 hover:text-[#d7ffab] sm:text-[11px] sm:tracking-[0.2em]">
              Open verification queue
            </Link>
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "inline-flex min-h-12 items-center gap-2 rounded-full border px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] transition sm:text-[11px] sm:tracking-[0.2em]",
                  activeSection === item.id
                    ? "border-[#7CFF00]/24 bg-[#7CFF00]/10 text-white"
                    : "border-white/8 bg-black/20 text-white/68 hover:border-[#7CFF00]/20 hover:text-white"
                )}
              >
                <item.icon className={cn("h-4 w-4", activeSection === item.id ? "text-[#d7ffab]" : "text-[#baff69]")} />
                {item.label}
              </button>
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
                className="min-h-[7.5rem] w-full rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 py-4 text-sm text-[#f5f1e8] outline-none transition placeholder:text-white/32 focus:border-[#7CFF00]/55 focus:shadow-[0_0_0_4px_rgba(124,255,0,0.10)]"
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
