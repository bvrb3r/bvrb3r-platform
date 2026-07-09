"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, MessageSquarePlus, MessageSquareText, RadioTower, Search, Send, Sparkles, X } from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, FilterChip, PageHeader, SearchBar } from "@/design/components";
import { isBarberAccountRole } from "@/lib/auth/roles";
import type { MessagingApiError } from "@/lib/messages/client";
import {
  useApprovePosPaymentRequestMutation,
  useCreateMessageThreadMutation,
  useDeclinePosPaymentRequestMutation,
  useMarkMessageThreadReadMutation,
  useMessageParticipantSearchQuery,
  useMessageRequestActionMutation,
  useMessageThreadQuery,
  useMessageThreadsQuery,
  useSendMessageBroadcastMutation,
  useSendMessageMutation
} from "@/lib/messages/client";
import type {
  MessagingBroadcastAudience,
  MessagingCreateThreadInput,
  MessagingParticipantSearchResult,
  PosPaymentRequestMessageMetadata,
  MessagingThreadPayload,
  MessagingThreadSummary
} from "@/lib/messages/service";

type MessagingSurface = "client" | "barber" | "shop";
type ThreadFilter = "all" | "barbers" | "shops" | "support" | "other" | "clients" | "requests" | "bookings" | "team";
type ActiveThread = MessagingThreadPayload["thread"];
type AppointmentContextView = NonNullable<MessagingThreadSummary["appointmentContext"]>;

const threadFilters: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "barbers", label: "Barbers" },
  { key: "shops", label: "Shops" },
  { key: "bookings", label: "Bookings" },
  { key: "support", label: "Support" }
];

const barberThreadFilters: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "clients", label: "Clients" },
  { key: "bookings", label: "Bookings" },
  { key: "requests", label: "Requests" },
  { key: "shops", label: "Shops" },
  { key: "support", label: "Support" }
];

const shopThreadFilters: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "clients", label: "Clients" },
  { key: "barbers", label: "Barbers" },
  { key: "team", label: "Team" },
  { key: "bookings", label: "Bookings" },
  { key: "support", label: "Support" }
];

function formatThreadTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatMoneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

function getPosPaymentRequestMetadata(metadata: MessagingThreadPayload["messages"][number]["metadata"]): PosPaymentRequestMessageMetadata | null {
  if (!metadata || metadata.kind !== "pos_payment_request") {
    return null;
  }

  return metadata as PosPaymentRequestMessageMetadata;
}

function formatCompactThreadTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays > 0 && diffDays < 7) {
    return `${diffDays}d`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatContextDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function isSameLocalDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) {
    return false;
  }
  return da.toDateString() === db.toDateString();
}

// Day divider label for the message stream: "Today" / "Yesterday" / "Mon, Jul 7".
function formatMessageDayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return "Today";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

// Presence proxy from real thread activity (last message / update time). We have no
// live online signal, so this reports the last real activity rather than inventing one.
function formatLastActiveLabel(iso?: string | null) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const diffMs = new Date().getTime() - date.getTime();
  if (diffMs < 60_000) {
    return "Active just now";
  }
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `Active ${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Active ${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `Active ${diffDays}d ago`;
  }
  return `Active ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)}`;
}

// True once the viewport is at least the md breakpoint. Defaults to false so SSR,
// mobile, and the (matchMedia-less) test environment keep the single-pane modal
// flow; desktop upgrades to the two-pane layout after mount.
function useIsWideViewport() {
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsWide(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return isWide;
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function getMessagingApiError(error: unknown): MessagingApiError | null {
  if (error instanceof Error) {
    return error as MessagingApiError;
  }

  return null;
}

function getParticipantTargetIdKind(result: MessagingParticipantSearchResult) {
  if (result.resultType === "support") {
    return "support";
  }

  if (result.resultType === "shop") {
    return "public_shop_identity";
  }

  return "profile_id";
}

function getSurfaceCopy(surface: MessagingSurface) {
  if (surface === "shop") {
    return {
      shellLabel: "MESSAGES",
      composerPlaceholder: "Message this thread.",
      emptyTitle: "No conversations yet.",
      emptyThreadCopy: "Search a client, barber, or team member to start a message.",
      emptyPanelCopy: "Pick a conversation or open a direct shop line.",
      starterTitle: "New lines",
      starterCopy: "Open a real client or barber thread tied to this location.",
      broadcastTitle: "Broadcast",
      broadcastCopy: "Send one update into the existing shop conversation network."
    };
  }

  if (surface === "barber") {
    return {
      shellLabel: "MESSAGES",
      composerPlaceholder: "Message this thread.",
      emptyTitle: "No conversations yet.",
      emptyThreadCopy: "Search a client or shop to start a message.",
      emptyPanelCopy: "Pick a client conversation or open one from a booked appointment.",
      starterTitle: "New messages",
      starterCopy: "Start from appointment-linked clients or connected shop lines.",
      broadcastTitle: "",
      broadcastCopy: ""
    };
  }

  return {
    shellLabel: "MESSAGES",
    composerPlaceholder: "Message this thread.",
    emptyTitle: "No conversations yet.",
    emptyThreadCopy: "Search a barber or shop to start a message.",
    emptyPanelCopy: "Pick a conversation or start one from an appointment.",
    starterTitle: "New messages",
    starterCopy: "Start from a booked appointment, shop line, or support.",
    broadcastTitle: "",
    broadcastCopy: ""
  };
}

function getThreadStatusLabel(threadType: string) {
  if (threadType === "support") {
    return "support";
  }

  return threadType.replaceAll("_", " ");
}

function isClientAccountRole(role?: string | null) {
  return role === "client" || role === "client_user";
}

function getRoleBadgeLabel(role?: string | null, threadType?: string) {
  if (threadType === "support" || role === "platform_admin") {
    return "Support";
  }

  if (role === "owner" || role === "shop_owner_user" || role === "manager" || role === "front_desk") {
    return "Shop";
  }

  if (isBarberAccountRole(role)) {
    return "Barber";
  }

  if (isClientAccountRole(role)) {
    return "Client";
  }

  return null;
}

function getMessageThreadFilterTags(thread: MessagingThreadSummary, surface: MessagingSurface): Set<ThreadFilter> {
  const tags = new Set<ThreadFilter>(["all"]);

  if (thread.lifecycleStatus === "request_pending") {
    tags.add("requests");
  }

  if (surface !== "client" && isBookingRequestThread(thread)) {
    tags.add("requests");
  }

  if (thread.appointmentContext) {
    tags.add("bookings");
  }

  const role = thread.counterpart?.role;
  if (thread.threadType === "support" || role === "platform_admin") {
    tags.add("support");
    return tags;
  }

  if (surface === "client") {
    if (isBarberAccountRole(role) || thread.threadType === "client_barber") {
      tags.add("barbers");
    }

    if (role === "owner" || role === "shop_owner_user" || role === "manager" || role === "front_desk" || thread.threadType === "client_shop") {
      tags.add("shops");
    }

    return tags;
  }

  if (surface === "barber") {
    if (isClientAccountRole(role) || thread.threadType === "client_barber") {
      tags.add("clients");
    }

    if (role === "owner" || role === "shop_owner_user" || role === "manager" || role === "front_desk" || thread.threadType === "barber_shop") {
      tags.add("shops");
    }

    return tags;
  }

  if (surface === "shop") {
    if (isClientAccountRole(role) || thread.threadType === "client_shop") {
      tags.add("clients");
    }

    if (isBarberAccountRole(role) || thread.threadType === "barber_shop") {
      tags.add("barbers");
    }

    if (thread.threadType === "barber_shop" && (thread.locationId || thread.locationContext)) {
      tags.add("team");
    }

    if (role === "owner" || role === "shop_owner_user" || role === "manager" || role === "front_desk") {
      tags.add("team");
    }

    return tags;
  }

  tags.add("other");
  return tags;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getAvatarInitials(name: string, role?: string | null, threadType?: string | null) {
  if (threadType === "support" || role === "platform_admin") {
    return "B";
  }

  return getInitials(name);
}

function getAvatarImageUrl(avatarUrl?: string | null, role?: string | null, threadType?: string | null) {
  if (threadType === "support" || role === "platform_admin") {
    return null;
  }

  return avatarUrl ?? null;
}

function isBookingRequestThread(thread: MessagingThreadSummary) {
  const statusText = `${thread.appointmentContext?.status ?? ""} ${thread.appointmentContext?.statusLabel ?? ""}`.toLowerCase();
  return Boolean(thread.appointmentContext && (statusText.includes("pending") || statusText.includes("request")));
}

function normalizeMessageDisplayText(value: string) {
  return value
    .replaceAll("â€¢", "•")
    .replaceAll("â€™", "’")
    .replaceAll("â€œ", "“")
    .replaceAll("â€", "”");
}

function getThreadPreview(thread: MessagingThreadSummary) {
  if (thread.lastMessage?.body) {
    return normalizeMessageDisplayText(thread.lastMessage.body);
  }

  if (thread.appointmentContext) {
    return `${thread.appointmentContext.serviceName} conversation`;
  }

  if (thread.threadType === "support") {
    return "Support conversation";
  }

  return "No messages yet.";
}

function getDisplayName(thread: MessagingThreadSummary | ActiveThread) {
  if (thread?.threadType === "support" || thread?.counterpart?.role === "platform_admin") {
    return "BVRB3R Support";
  }

  const username = thread?.counterpart?.publicUsername?.trim().replace(/^@+/, "");
  if (username) {
    return `@${username}`;
  }

  return thread?.counterpart?.fullName ?? "Conversation";
}

function getAppointmentLine(thread: MessagingThreadSummary | ActiveThread) {
  if (!thread?.appointmentContext) {
    return null;
  }

  return `${thread.appointmentContext.serviceName} • ${thread.appointmentContext.statusLabel}`;
}

function getConversationContextLine(thread: ActiveThread) {
  if (!thread) {
    return "";
  }

  if (thread.appointmentContext) {
    const date = formatContextDate(thread.appointmentContext.startsAt);
    return [
      thread.appointmentContext.serviceName,
      date,
      thread.appointmentContext.statusLabel
    ].filter(Boolean).join(" • ");
  }

  if (thread.threadType === "support") {
    return "BVRB3R Support";
  }

  return thread.locationContext?.locationLabel ?? "Direct conversation";
}

function getFreshAppointmentContext(thread: ActiveThread, relatedAppointmentContexts: AppointmentContextView[] = []) {
  if (relatedAppointmentContexts.length) {
    return relatedAppointmentContexts[0] ?? null;
  }

  return thread?.appointmentContext ?? null;
}

function getConversationContextLineWithContext(thread: ActiveThread, appointmentContext: AppointmentContextView | null) {
  if (!thread) {
    return "";
  }

  if (appointmentContext) {
    const date = formatContextDate(appointmentContext.startsAt);
    return [
      appointmentContext.serviceName,
      date,
      appointmentContext.statusLabel
    ].filter(Boolean).join(" • ");
  }

  return getConversationContextLine(thread);
}

function getConversationTypeLabel(thread: MessagingThreadSummary | ActiveThread) {
  if (thread?.appointmentContext) {
    return "Booking conversation";
  }

  if (thread?.threadType === "support") {
    return "Support conversation";
  }

  return "Direct conversation";
}

function getTargetAwareComposerPlaceholder(thread: ActiveThread, surface: MessagingSurface) {
  if (!thread) {
    return "Message this thread.";
  }

  if (thread.threadType === "support") {
    return "Message support.";
  }

  const role = thread.counterpart?.role;
  if (role === "client") {
    return "Message the client.";
  }

  if (isBarberAccountRole(role)) {
    return surface === "client" ? "Message your barber." : "Message the barber.";
  }

  if (role === "owner" || role === "shop_owner_user" || role === "manager" || role === "front_desk") {
    return "Message the shop.";
  }

  return "Message this thread.";
}

function getRequestBanner(thread: ActiveThread) {
  if (!thread?.request) {
    return null;
  }

  if (thread.lifecycleStatus === "request_pending") {
    return {
      tone: "info" as const,
      message: "Message request pending."
    };
  }

  if (thread.lifecycleStatus === "request_declined") {
    return {
      tone: "error" as const,
      message: "Message request declined."
    };
  }

  if (thread.lifecycleStatus === "blocked") {
    return {
      tone: "error" as const,
      message: "You cannot message this user."
    };
  }

  if (thread.lifecycleStatus === "reported") {
    return {
      tone: "info" as const,
      message: "Report submitted."
    };
  }

  if (thread.request.status === "accepted") {
    return {
      tone: "success" as const,
      message: "Message request accepted."
    };
  }

  return null;
}

function isComposerDisabledByLifecycle(thread: ActiveThread) {
  return thread?.lifecycleStatus === "request_declined"
    || thread?.lifecycleStatus === "blocked"
    || thread?.lifecycleStatus === "reported"
    || (thread?.lifecycleStatus === "request_pending" && Boolean(thread.request?.isRecipient))
    || (thread?.lifecycleStatus === "request_pending" && Boolean(thread.request?.isRequester && thread.request.firstMessageId));
}

function getPublicUsernameLine(thread: MessagingThreadSummary | ActiveThread) {
  const username = thread?.counterpart?.publicUsername?.trim();
  return username ? `@${username}` : null;
}

function getSecondaryUsernameLine(thread: MessagingThreadSummary | ActiveThread, displayName: string) {
  const usernameLine = getPublicUsernameLine(thread);
  return usernameLine && usernameLine !== displayName ? usernameLine : null;
}

function getPublicContextLine(thread: MessagingThreadSummary | ActiveThread) {
  if (thread?.threadType === "support" || thread?.counterpart?.role === "platform_admin") {
    return "Support";
  }

  return thread?.counterpart?.publicContextLine
    ?? getAppointmentLine(thread)
    ?? thread?.locationContext?.locationLabel
    ?? null;
}

function getProfileTargetKind(role?: string | null, threadType?: string | null): "client" | "barber" | "shop" | null {
  if (threadType === "support" || role === "platform_admin") {
    return null;
  }

  if (isClientAccountRole(role)) {
    return "client";
  }

  if (isBarberAccountRole(role)) {
    return "barber";
  }

  if (role === "owner" || role === "shop_owner_user" || role === "manager" || role === "front_desk") {
    return "shop";
  }

  if (threadType === "client_shop" || threadType === "barber_shop") {
    return "shop";
  }

  if (threadType === "client_barber") {
    return "barber";
  }

  return null;
}

function getDashboardProfileViewBase(surface: MessagingSurface) {
  if (surface === "client") {
    return "/dashboard/client/profile-view";
  }

  if (surface === "barber") {
    return "/dashboard/barber/profile-view";
  }

  return "/dashboard/owner/profile-view";
}

function buildDashboardProfileHref({
  surface,
  targetKind,
  target,
  sourceThreadId
}: {
  surface: MessagingSurface;
  targetKind: "client" | "barber" | "shop";
  target?: string | null;
  sourceThreadId?: string | null;
}) {
  const cleanTarget = target?.trim().replace(/^@+/, "");
  if (!cleanTarget) {
    return null;
  }

  const baseHref = `${getDashboardProfileViewBase(surface)}/${targetKind}/${encodeURIComponent(cleanTarget)}`;
  return sourceThreadId ? `${baseHref}?sourceThreadId=${encodeURIComponent(sourceThreadId)}` : baseHref;
}

function getThreadProfileHref(thread: MessagingThreadSummary | ActiveThread | null | undefined, surface: MessagingSurface, sourceThreadId?: string | null) {
  if (!thread?.counterpart) {
    return null;
  }

  const targetKind = getProfileTargetKind(thread.counterpart.role, thread.threadType);
  if (!targetKind) {
    return null;
  }

  return buildDashboardProfileHref({
    surface,
    targetKind,
    target: thread.counterpart.publicUsername ?? thread.counterpart.profileId,
    sourceThreadId
  }) ?? thread.counterpart.publicProfileHref ?? null;
}

function getParticipantProfileHref(result: MessagingParticipantSearchResult, surface: MessagingSurface) {
  const targetKind = result.resultType === "support" ? null : result.resultType;
  if (!targetKind) {
    return null;
  }

  return buildDashboardProfileHref({
    surface,
    targetKind,
    target: result.publicUsername ?? result.id
  }) ?? result.publicProfileHref ?? result.profileHref ?? null;
}

function filterThreads(threads: MessagingThreadSummary[], activeFilter: ThreadFilter, query: string, surface: MessagingSurface) {
  const normalizedQuery = query.trim().toLowerCase();

  return threads.filter((thread) => {
    const filterTags = getMessageThreadFilterTags(thread, surface);
    const matchesFilter = filterTags.has(activeFilter);
    const searchable = [
      thread.counterpart?.fullName,
      thread.counterpart?.publicUsername,
      thread.counterpart?.publicContextLine,
      getRoleBadgeLabel(thread.counterpart?.role, thread.threadType),
      thread.appointmentContext?.serviceName,
      thread.appointmentContext?.locationLabel,
      thread.locationContext?.locationLabel,
      thread.lastMessage?.body
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}

function getThreadActivityTime(thread: MessagingThreadSummary) {
  const activityIso = thread.lastMessage?.createdAt ?? thread.updatedAt ?? thread.createdAt;
  const activityTime = new Date(activityIso).getTime();
  return Number.isNaN(activityTime) ? 0 : activityTime;
}

function getThreadLifecycleRank(thread: MessagingThreadSummary) {
  if (!thread.lifecycleStatus || thread.lifecycleStatus === "active") {
    return 0;
  }

  if (thread.lifecycleStatus === "request_pending") {
    return 1;
  }

  return 2;
}

function getDirectConversationKey(thread: MessagingThreadSummary, surface: MessagingSurface) {
  if (thread.threadType === "support" || thread.counterpart?.role === "platform_admin") {
    return `support:${thread.counterpart?.profileId ?? "bvrb3r"}`;
  }

  if (thread.threadType === "client_barber" && thread.counterpart?.profileId) {
    return `${surface}:client_barber:${thread.counterpart.profileId}`;
  }

  if (thread.threadType === "client_shop" && thread.counterpart?.profileId) {
    const targetKind = isClientAccountRole(thread.counterpart.role) ? "client" : "shop";
    return `${surface}:client_shop:${targetKind}:${thread.counterpart.profileId}`;
  }

  if (thread.threadType === "barber_shop" && thread.counterpart?.profileId) {
    const targetKind = isBarberAccountRole(thread.counterpart.role) ? "barber" : "shop";
    return `${surface}:barber_shop:${targetKind}:${thread.counterpart.profileId}`;
  }

  return `thread:${thread.id}`;
}

function getUniqueAppointmentContexts(threads: MessagingThreadSummary[]) {
  const contexts = new Map<string, AppointmentContextView>();

  for (const thread of threads) {
    if (thread.appointmentContext && !contexts.has(thread.appointmentContext.appointmentId)) {
      contexts.set(thread.appointmentContext.appointmentId, thread.appointmentContext);
    }
  }

  return Array.from(contexts.values()).sort(
    (left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime()
  );
}

function orderAndDedupeThreads(threads: MessagingThreadSummary[], surface: MessagingSurface) {
  const threadMap = new Map<string, MessagingThreadSummary[]>();

  for (const thread of threads) {
    const key = getDirectConversationKey(thread, surface);
    threadMap.set(key, [...(threadMap.get(key) ?? []), thread]);
  }

  const relatedAppointmentContextsByThreadId = new Map<string, AppointmentContextView[]>();
  const aggregatedThreads = Array.from(threadMap.values()).map((group) => {
    const sortedGroup = [...group].sort(
      (left, right) => getThreadLifecycleRank(left) - getThreadLifecycleRank(right)
        || getThreadActivityTime(right) - getThreadActivityTime(left)
    );
    const primaryThread = sortedGroup[0] as MessagingThreadSummary;
    const relatedAppointmentContexts = getUniqueAppointmentContexts(sortedGroup);
    relatedAppointmentContextsByThreadId.set(primaryThread.id, relatedAppointmentContexts);

    return {
      ...primaryThread,
      appointmentContext: relatedAppointmentContexts[0] ?? primaryThread.appointmentContext
    };
  });

  return {
    threads: aggregatedThreads.sort((left, right) => getThreadActivityTime(right) - getThreadActivityTime(left)),
    relatedAppointmentContextsByThreadId
  };
}

function buildQuickContacts(threads: MessagingThreadSummary[]) {
  const contacts = new Map<string, {
    id: string;
    label: string;
    active?: boolean;
    role?: string | null;
    threadId?: string;
    threadType?: string;
    avatarUrl?: string | null;
  }>();

  for (const thread of threads) {
    const id = thread.counterpart?.profileId ?? thread.id;
    const label = getDisplayName(thread);
    if (!contacts.has(id)) {
      contacts.set(id, {
        id,
        label,
        active: Boolean(thread.lastMessage || thread.appointmentContext),
        role: thread.counterpart?.role,
        threadId: thread.id,
        threadType: thread.threadType,
        avatarUrl: thread.counterpart?.avatarUrl ?? null
      });
    }
  }

  return Array.from(contacts.values()).slice(0, 10);
}

function ThreadSkeleton() {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-[12px] border border-white/8 bg-white/[0.025] px-3 py-2">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-48" />
      </div>
      <Skeleton className="h-3 w-10" />
    </div>
  );
}

function getParticipantSearchDisplay(result: MessagingParticipantSearchResult) {
  if (result.resultType === "support") {
    return "BVRB3R Support";
  }

  const username = result.publicUsername?.trim().replace(/^@+/, "");
  return username ? `@${username}` : result.displayName;
}

function RolePill({ label }: { label: string }) {
  return (
    <span className="inline-flex h-5 items-center rounded-[6px] border border-white/10 bg-white/[0.035] px-1.5 text-[10px] font-bold uppercase text-[#e4f9b8]">
      {label}
    </span>
  );
}

function ParticipantSearchResultRow({
  result,
  disabled,
  surface,
  onSelect
}: {
  result: MessagingParticipantSearchResult;
  disabled: boolean;
  surface: MessagingSurface;
  onSelect: (result: MessagingParticipantSearchResult) => void;
}) {
  const publicDisplayName = getParticipantSearchDisplay(result);
  const username = result.publicUsername?.trim().replace(/^@+/, "");
  const secondaryUsername = username && publicDisplayName !== `@${username}` ? `@${username}` : null;
  const roleLabel = result.resultType === "support" ? "Support" : result.resultType === "shop" ? "Shop" : result.resultType === "client" ? "Client" : "Barber";
  const profileHref = getParticipantProfileHref(result, surface);
  const messageDisabled = disabled || Boolean(result.messageDisabledReason);
  const isOpening = disabled && !result.messageDisabledReason;

  return (
    <div
      className="grid min-h-[82px] w-full grid-cols-[auto_1fr] gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-left transition hover:border-[#c4f24e]/28 hover:bg-white/[0.05] sm:grid-cols-[auto_1fr_auto]"
      data-testid={`message-participant-result-${result.resultType}-${result.id}`}
    >
      <Avatar
        src={getAvatarImageUrl(result.avatarUrl, result.role, result.resultType === "support" ? "support" : undefined)}
        alt={publicDisplayName}
        initials={getAvatarInitials(publicDisplayName, result.role, result.resultType === "support" ? "support" : undefined)}
        className="h-11 w-11 text-sm"
      />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold text-white">{publicDisplayName}</span>
          <RolePill label={roleLabel} />
        </span>
        {secondaryUsername ? (
          <span className="mt-0.5 block truncate text-xs font-bold text-[#e4f9b8]/85">{secondaryUsername}</span>
        ) : null}
        <span className="mt-0.5 block truncate text-xs text-white/48">
          {result.publicContextLine ?? result.subtitle ?? (result.existingThreadId ? "Existing conversation" : "Start a conversation")}
        </span>
        {result.messageDisabledReason ? (
          <span className="mt-1 block text-[11px] font-semibold text-white/42">{result.messageDisabledReason}</span>
        ) : null}
      </span>
      <span className="col-span-2 flex shrink-0 items-center justify-end gap-2 sm:col-span-1">
        {profileHref ? (
          <Link
            href={profileHref as Route}
            className="inline-flex h-8 items-center rounded-lg border border-white/10 px-2.5 text-[11px] font-black text-white/72 transition hover:border-[#c4f24e]/28 hover:text-white"
          >
            View Profile
          </Link>
        ) : null}
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-lg border border-[#c4f24e]/20 bg-[#c4f24e]/10 px-2.5 text-[11px] font-black text-[#e4f9b8] transition hover:border-[#c4f24e]/36 hover:bg-[#c4f24e]/16 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={messageDisabled}
          onClick={() => onSelect(result)}
        >
          {isOpening ? "Opening..." : result.existingThreadId ? "Open" : "Message"}
        </button>
      </span>
    </div>
  );
}

function TopLayerModal({
  children,
  label,
  onClose,
  testId
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  testId?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/72 px-0 pb-0 pt-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid={testId}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={`Close ${label}`}
        onClick={onClose}
      />
      {children}
    </div>,
    document.body
  );
}

function ThreadStoryRail({
  basePath,
  contacts,
  onOpenThread
}: {
  basePath: string;
  contacts: ReturnType<typeof buildQuickContacts>;
  onOpenThread?: (threadId: string) => void;
}) {
  if (!contacts.length) {
    return null;
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max gap-3">
        {contacts.map((contact) => {
          const avatar = (
            <>
              <Avatar
                src={getAvatarImageUrl(contact.avatarUrl, contact.role, contact.threadType)}
                alt={contact.label}
                initials={getAvatarInitials(contact.label, contact.role, contact.threadType)}
                className={[
                  "mx-auto h-12 w-12 text-sm",
                  contact.active ? "border-2 border-white/70" : "border-white/12"
                ].join(" ")}
              />
              <span className="mt-1 block truncate text-[11px] font-semibold text-white/64 group-hover:text-white">
                {contact.label}
              </span>
            </>
          );

          if (contact.threadId) {
            return (
              <Link
                key={contact.id}
                href={`${basePath}/${contact.threadId}` as Route}
                className="group w-16 shrink-0 text-center"
                onClick={onOpenThread ? (event) => {
                  event.preventDefault();
                  onOpenThread(contact.threadId as string);
                } : undefined}
              >
                {avatar}
              </Link>
            );
          }

          return (
            <div key={contact.id} className="group w-16 shrink-0 text-center">
              {avatar}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThinThreadRow({
  thread,
  basePath,
  active,
  onOpen
}: {
  thread: MessagingThreadSummary;
  basePath: string;
  active: boolean;
  onOpen?: (threadId: string) => void;
}) {
  const displayName = getDisplayName(thread);
  const roleBadgeLabel = getRoleBadgeLabel(thread.counterpart?.role, thread.threadType);
  const usernameLine = getSecondaryUsernameLine(thread, displayName);
  const contextDetail = getPublicContextLine(thread) ?? getThreadStatusLabel(thread.threadType);
  const preview = getThreadPreview(thread);

  return (
    <Link
      href={`${basePath}/${thread.id}` as Route}
      data-testid={`message-thread-row-${thread.id}`}
      onClick={onOpen ? (event) => {
        event.preventDefault();
        onOpen(thread.id);
      } : undefined}
      className={[
        "group grid min-h-[78px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[12px] border px-3 py-2 transition",
        active
          ? "border-[#c4f24e]/35 bg-[#c4f24e]/10"
          : "border-white/8 bg-white/[0.022] hover:border-white/16 hover:bg-white/[0.04]"
      ].join(" ")}
    >
      <Avatar
        src={getAvatarImageUrl(thread.counterpart?.avatarUrl, thread.counterpart?.role, thread.threadType)}
        alt={displayName}
        initials={getAvatarInitials(displayName, thread.counterpart?.role, thread.threadType)}
        className="h-11 w-11 text-sm"
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-bold text-white">{displayName}</p>
          {roleBadgeLabel ? <RolePill label={roleBadgeLabel} /> : null}
        </div>
        {usernameLine ? <p className="mt-0.5 truncate text-xs font-bold text-white/70">{usernameLine}</p> : null}
        <p className="mt-0.5 truncate text-xs font-medium text-white/54">{contextDetail}</p>
        <p className="mt-0.5 truncate text-xs text-white/42">{preview}</p>
      </div>
      <div className="flex h-full flex-col items-end justify-between py-1">
        <span className="text-[11px] font-medium text-white/42">
          {formatCompactThreadTime(thread.lastMessage?.createdAt ?? thread.updatedAt)}
        </span>
        {thread.hasUnread ? (
          <span className="h-2.5 w-2.5 rounded-full bg-[#c4f24e] shadow-[0_0_14px_rgba(196, 242, 78,0.75)]" aria-label="Unread message" />
        ) : thread.appointmentContext ? (
          <span className="rounded-[6px] border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-bold text-white/70">
            {thread.appointmentContext.statusLabel}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function PaymentRequestCard({
  counterpartName,
  isProcessing,
  metadata,
  onApprove,
  onDecline,
  surface
}: {
  counterpartName: string;
  isProcessing: boolean;
  metadata: PosPaymentRequestMessageMetadata;
  onApprove: (paymentRequestId: string) => void;
  onDecline: (paymentRequestId: string) => void;
  surface: MessagingSurface;
}) {
  const status = metadata.status;
  const isPending = status === "pending" || status === "pending_approval";
  const showClientActions = surface === "client" && isPending;
  const statusLabel = status === "paid"
    ? "Paid"
    : status === "approved"
      ? "Approved"
    : status === "declined"
      ? "Declined"
      : status === "canceled" || status === "canceled_duplicate"
        ? "Canceled"
        : status === "superseded"
          ? "Superseded"
      : status === "failed"
        ? "Failed"
        : status === "expired"
          ? "Expired"
          : status === "pending_message_failed"
            ? "Retry Needed"
            : isProcessing
              ? "Processing"
              : "Pending";

  return (
    <div
      className="w-full max-w-[22rem] rounded-lg border border-white/10 bg-[linear-gradient(180deg,rgba(245,241,232,0.05),rgba(8,8,8,0.96))] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.32)]"
      data-testid="pos-payment-request-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/56">Payment Request</p>
          <p className="mt-2 text-sm font-black text-white">
            {counterpartName} requested {formatMoneyFromCents(metadata.amountCents)}
          </p>
          <p className="mt-1 text-xs text-white/56">Walk-in service</p>
        </div>
        <span className={[
          "rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]",
          status === "paid"
            ? "border-[#c4f24e]/28 bg-[#c4f24e]/12 text-[#e4f9b8]"
            : status === "declined" || status === "failed" || status === "expired" || status === "canceled" || status === "canceled_duplicate" || status === "superseded"
              ? "border-rose-300/24 bg-rose-500/10 text-rose-100"
              : "border-amber-200/22 bg-amber-300/10 text-amber-100"
        ].join(" ")}>
          {statusLabel}
        </span>
      </div>

      {showClientActions ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="h-9 rounded-lg bg-[#c4f24e] px-3 text-xs font-black text-[#050505] transition hover:bg-[#e4f9b8] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isProcessing}
            onClick={() => onApprove(metadata.paymentRequestId)}
          >
            {isProcessing ? "Processing..." : "Approve Payment"}
          </button>
          <button
            type="button"
            className="h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/72 transition hover:border-rose-200/28 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isProcessing}
            onClick={() => onDecline(metadata.paymentRequestId)}
          >
            Decline
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-white/54">
          {status === "paid"
            ? "Payment approved and collected through BVRB3R."
            : status === "approved"
              ? "Payment approved and waiting for final receipt."
            : status === "declined"
              ? "This request was declined. No payment was created."
              : status === "superseded" || status === "canceled_duplicate"
                ? "This duplicate request was closed. No payment can be approved from this card."
                : status === "canceled"
                  ? "This request was canceled. No payment was created."
              : status === "failed"
                ? "Payment could not be completed. Contact the barber to try again."
                : status === "expired"
                  ? "This request expired."
                  : status === "pending_message_failed"
                    ? "The payment card needs to be resent before approval."
                    : "Waiting on client approval."}
        </p>
      )}
    </div>
  );
}

function ConversationPanel({
  activeThread,
  activeThreadId,
  basePath,
  copy,
  composerBody,
  isLoading,
  messages,
  mode = "panel",
  onClose,
  relatedAppointmentContexts = [],
  selectedThreadId,
  sendPending,
  surface,
  paymentRequestActionId,
  threadError,
  onApprovePaymentRequest,
  onRequestAction,
  onComposerChange,
  onDeclinePaymentRequest,
  onSend
}: {
  activeThread: ActiveThread;
  activeThreadId?: string;
  basePath: string;
  copy: ReturnType<typeof getSurfaceCopy>;
  composerBody: string;
  isLoading: boolean;
  messages: MessagingThreadPayload["messages"];
  mode?: "panel" | "modal";
  onClose?: () => void;
  relatedAppointmentContexts?: AppointmentContextView[];
  selectedThreadId?: string;
  sendPending: boolean;
  surface: MessagingSurface;
  paymentRequestActionId?: string | null;
  threadError: unknown;
  onApprovePaymentRequest: (paymentRequestId: string) => void;
  onRequestAction: (requestId: string, action: "accept" | "decline" | "block" | "report") => void;
  onComposerChange: (value: string) => void;
  onDeclinePaymentRequest: (paymentRequestId: string) => void;
  onSend: () => void;
}) {
  const participantSummary = activeThread?.participants
    .filter((participant) => !participant.isSelf)
    .map((participant) => participant.fullName)
    .join(", ") ?? "";
  const displayName = getDisplayName(activeThread) || participantSummary || "Conversation";
  const roleBadgeLabel = getRoleBadgeLabel(activeThread?.counterpart?.role, activeThread?.threadType);
  const freshAppointmentContext = getFreshAppointmentContext(activeThread, relatedAppointmentContexts);
  const hasAppointment = Boolean(freshAppointmentContext);
  const usernameLine = getSecondaryUsernameLine(activeThread, displayName);
  const publicContextLine = getPublicContextLine(activeThread);
  const conversationTypeLabel = getConversationTypeLabel(activeThread);
  const requestBanner = getRequestBanner(activeThread);
  const composerDisabledByLifecycle = isComposerDisabledByLifecycle(activeThread);
  const composerPlaceholder = composerDisabledByLifecycle
    ? requestBanner?.message ?? copy.composerPlaceholder
    : getTargetAwareComposerPlaceholder(activeThread, surface);
  const profileHref = getThreadProfileHref(activeThread, surface, activeThreadId ?? selectedThreadId ?? null);
  const bookingHref = activeThread?.counterpart?.bookingHref ?? "/booking/new";
  const lastActiveLabel = messages.length ? formatLastActiveLabel(messages[messages.length - 1]?.createdAt) : null;
  const bookingActionLabel = surface === "client" ? "Rebook" : "Book";
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const previousThreadIdRef = useRef<string | undefined>(undefined);
  const previousMessageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    const scrollContainer = scrollContainerRef.current;
    const bottomSentinel = bottomSentinelRef.current;

    if (!scrollContainer || !bottomSentinel) {
      return;
    }

    bottomSentinel.scrollIntoView({ block: "end", behavior });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
    const isNearBottom = distanceFromBottom <= 160;
    isNearBottomRef.current = isNearBottom;
    if (isNearBottom) {
      setShowJumpToLatest(false);
    }
  }, []);

  useEffect(() => {
    if (!activeThreadId || isLoading) {
      return;
    }

    const threadChanged = previousThreadIdRef.current !== activeThreadId;
    const previousMessageCount = previousMessageCountRef.current;
    const messageCountChanged = previousMessageCount !== messages.length;
    const shouldScrollToLatest = threadChanged || (messageCountChanged && isNearBottomRef.current);

    previousThreadIdRef.current = activeThreadId;
    previousMessageCountRef.current = messages.length;

    if (shouldScrollToLatest) {
      const frame = window.requestAnimationFrame(() => scrollToLatest("auto"));
      return () => window.cancelAnimationFrame(frame);
    }

    if (messageCountChanged && messages.length > previousMessageCount && !isNearBottomRef.current) {
      setShowJumpToLatest(true);
    }
  }, [activeThreadId, isLoading, messages.length, scrollToLatest]);

  return (
    <section
      className={[
        "flex flex-col border border-white/8 bg-[#070707]/96 shadow-[0_20px_60px_rgba(0,0,0,0.38)]",
        mode === "modal"
          ? "h-[100dvh] min-h-0 w-full rounded-none sm:h-[min(92vh,48rem)] sm:max-w-2xl sm:rounded-lg"
          : "min-h-[34rem] rounded-lg"
      ].join(" ")}
      data-testid={mode === "modal" ? "message-thread-modal" : "message-thread-panel"}
    >
      <div className="border-b border-white/8 px-3 py-3 sm:px-4">
        {onClose ? (
          <button
            type="button"
            className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-white/56 transition hover:text-[#e4f9b8]"
            onClick={onClose}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
        ) : selectedThreadId ? (
          <Link href={basePath as Route} className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-white/56 transition hover:text-[#e4f9b8] md:hidden">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Link>
        ) : null}

        {threadError ? (
          <FeedbackBanner tone="error" message={readableError(threadError, "Unable to load the selected conversation.")} />
        ) : null}

        {isLoading && activeThreadId ? (
          <div className="space-y-3">
            <ThreadSkeleton />
            <ThreadSkeleton />
          </div>
        ) : activeThread ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  src={getAvatarImageUrl(activeThread?.counterpart?.avatarUrl, activeThread?.counterpart?.role, activeThread?.threadType)}
                  alt={displayName}
                  initials={getAvatarInitials(displayName, activeThread?.counterpart?.role, activeThread?.threadType)}
                  className="h-12 w-12 border-2 border-[#c4f24e]/65 text-sm"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-base font-black text-white">{displayName}</h3>
                    {roleBadgeLabel ? <RolePill label={roleBadgeLabel} /> : null}
                  </div>
                  {usernameLine ? <p className="mt-0.5 truncate text-xs font-bold text-white/70">{usernameLine}</p> : null}
                  <p className="mt-0.5 truncate text-xs text-white/46">
                    {[conversationTypeLabel, publicContextLine].filter(Boolean).join(" - ")}
                  </p>
                  {lastActiveLabel ? <p className="mt-0.5 truncate text-[11px] font-semibold text-white/40">{lastActiveLabel}</p> : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {profileHref ? (
                  <Link
                    href={profileHref as Route}
                    className="inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs font-bold text-white/72 transition hover:border-[#c4f24e]/28 hover:text-white"
                  >
                    View Profile
                  </Link>
                ) : activeThread.threadType !== "support" ? (
                  <button
                    type="button"
                    className="h-8 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/72 transition hover:border-[#c4f24e]/28 hover:text-white disabled:opacity-45"
                    disabled
                  >
                    View Profile
                  </button>
                ) : null}
                {surface !== "shop" && activeThread.threadType !== "support" ? (
                  <Link
                    href={bookingHref as Route}
                    className="inline-flex h-8 items-center rounded-lg bg-[#c4f24e] px-3 text-xs font-black text-[#050505] transition hover:bg-[#e4f9b8]"
                  >
                    {bookingActionLabel}
                  </Link>
                ) : null}
              </div>
            </div>

            <div
              className="rounded-lg border border-[#c4f24e]/18 bg-[#c4f24e]/8 px-3 py-2 text-xs font-semibold text-[#e4f9b8]"
              data-testid="message-thread-context-line"
            >
              {getConversationContextLineWithContext(activeThread, freshAppointmentContext)}
            </div>

            {requestBanner ? (
              <div className={[
                "rounded-lg border px-3 py-2 text-xs font-semibold",
                requestBanner.tone === "success"
                  ? "border-[#c4f24e]/22 bg-[#c4f24e]/8 text-[#e4f9b8]"
                  : requestBanner.tone === "error"
                    ? "border-red-400/20 bg-red-500/10 text-red-100"
                    : "border-white/10 bg-white/[0.035] text-white/64"
              ].join(" ")}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>{requestBanner.message}</span>
                  {activeThread.request?.isRecipient && activeThread.lifecycleStatus === "request_pending" ? (
                    <div className="flex flex-wrap gap-2">
                      {(["accept", "decline", "block", "report"] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-bold text-white/72 transition hover:border-[#c4f24e]/28 hover:text-white"
                          onClick={() => onRequestAction(activeThread.request!.id, action)}
                        >
                          {action === "accept" ? "Accept" : action === "decline" ? "Decline" : action === "block" ? "Block" : "Report"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {relatedAppointmentContexts.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1" data-testid="related-appointment-contexts">
                {relatedAppointmentContexts.map((context) => (
                  <span
                    key={context.appointmentId}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-[11px] font-bold text-white/68"
                  >
                    {context.serviceName} • {formatContextDate(context.startsAt)} • {context.statusLabel}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeThread ? (
        <>
          <div
            ref={scrollContainerRef}
            className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 scroll-smooth sm:px-4"
            data-testid="message-thread-scroll-container"
            onScroll={handleMessagesScroll}
          >
            {messages.length ? messages.map((message, index) => {
              const paymentRequestMetadata = getPosPaymentRequestMetadata(message.metadata);
              const showDayDivider = index === 0 || !isSameLocalDay(messages[index - 1].createdAt, message.createdAt);
              return (
              <Fragment key={message.id}>
                {showDayDivider ? (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/44">
                      {formatMessageDayLabel(message.createdAt)}
                    </span>
                  </div>
                ) : null}
              <div className={message.isOwn ? "flex justify-end" : "flex justify-start"}>
                {paymentRequestMetadata ? (
                  <PaymentRequestCard
                    counterpartName={displayName}
                    isProcessing={paymentRequestActionId === paymentRequestMetadata.paymentRequestId}
                    metadata={paymentRequestMetadata}
                    onApprove={onApprovePaymentRequest}
                    onDecline={onDeclinePaymentRequest}
                    surface={surface}
                  />
                ) : (
                  <div
                  className={[
                    "max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6 shadow-[0_10px_28px_rgba(0,0,0,0.24)]",
                    message.messageType === "system"
                      ? "border border-white/8 bg-white/[0.025] text-white/56"
                      : message.isOwn
                        ? "bg-[#c4f24e] text-[#050505]"
                        : "border border-white/8 bg-white/[0.06] text-white"
                  ].join(" ")}
                >
                  <p className="font-medium">{normalizeMessageDisplayText(message.body)}</p>
                  <p className={["mt-1 text-[10px] font-bold", message.isOwn ? "text-black/52" : "text-white/38"].join(" ")}>
                    {message.messageType === "system" ? "System" : message.senderName ?? "Participant"} • {formatThreadTime(message.createdAt)}
                  </p>
                  </div>
                )}
              </div>
              </Fragment>
              );
            }) : (
              <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-center text-sm text-white/54">
                No messages yet.
              </div>
            )}
            <div ref={bottomSentinelRef} data-testid="message-thread-bottom-sentinel" />
            {showJumpToLatest ? (
              <button
                type="button"
                className="sticky bottom-2 left-1/2 z-10 mx-auto flex -translate-x-0 items-center rounded-lg border border-[#c4f24e]/24 bg-[#0b0b0b]/92 px-3 py-2 text-xs font-black text-[#e4f9b8] shadow-[0_12px_32px_rgba(0,0,0,0.36)] transition hover:border-[#c4f24e]/55"
                onClick={() => scrollToLatest("smooth")}
              >
                Jump to latest
              </button>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-white/8 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <label className="sr-only" htmlFor={`${surface}-message-composer`}>Reply</label>
            <div className="flex items-end gap-2 rounded-lg border border-white/10 bg-black/35 p-2">
              <textarea
                id={`${surface}-message-composer`}
                value={composerBody}
                onChange={(event) => onComposerChange(event.target.value)}
                rows={1}
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-white/34"
                placeholder={composerPlaceholder}
                disabled={composerDisabledByLifecycle}
              />
              <button
                type="button"
                aria-label="Send message"
                disabled={sendPending || composerDisabledByLifecycle || !composerBody.trim()}
                onClick={onSend}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#c4f24e] text-[#050505] transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-center">
          <div className="max-w-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#c4f24e]/28 bg-[#c4f24e]/10 text-[#c4f24e]">
              <MessageSquareText className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white">{hasAppointment ? "Open this appointment thread." : "Pick a conversation"}</p>
            <p className="mt-1 text-sm leading-6 text-white/54">{copy.emptyPanelCopy}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ConversationModal({
  activeThread,
  activeThreadId,
  basePath,
  copy,
  composerBody,
  isLoading,
  messages,
  onClose,
  onApprovePaymentRequest,
  onComposerChange,
  onDeclinePaymentRequest,
  onRequestAction,
  onSend,
  paymentRequestActionId,
  relatedAppointmentContexts,
  sendPending,
  surface,
  threadError
}: {
  activeThread: ActiveThread;
  activeThreadId?: string;
  basePath: string;
  copy: ReturnType<typeof getSurfaceCopy>;
  composerBody: string;
  isLoading: boolean;
  messages: MessagingThreadPayload["messages"];
  onClose: () => void;
  onApprovePaymentRequest: (paymentRequestId: string) => void;
  onComposerChange: (value: string) => void;
  onDeclinePaymentRequest: (paymentRequestId: string) => void;
  onRequestAction: (requestId: string, action: "accept" | "decline" | "block" | "report") => void;
  onSend: () => void;
  paymentRequestActionId?: string | null;
  relatedAppointmentContexts: AppointmentContextView[];
  sendPending: boolean;
  surface: MessagingSurface;
  threadError: unknown;
}) {
  if (!activeThreadId) {
    return null;
  }

  return (
    <TopLayerModal label="Message conversation" onClose={onClose}>
      <div className="relative z-10 w-full sm:max-w-2xl">
        <ConversationPanel
          activeThread={activeThread}
          activeThreadId={activeThreadId}
          basePath={basePath}
          copy={copy}
          composerBody={composerBody}
          isLoading={isLoading}
          messages={messages}
          mode="modal"
          onClose={onClose}
          onApprovePaymentRequest={onApprovePaymentRequest}
          onRequestAction={onRequestAction}
          relatedAppointmentContexts={relatedAppointmentContexts}
          paymentRequestActionId={paymentRequestActionId}
          sendPending={sendPending}
          surface={surface}
          threadError={threadError}
          onComposerChange={onComposerChange}
          onDeclinePaymentRequest={onDeclinePaymentRequest}
          onSend={onSend}
        />
      </div>
    </TopLayerModal>
  );
}

function ComposeModal({
  actionError,
  error,
  isLoading,
  onClose,
  onQueryChange,
  onSelect,
  query,
  results,
  selectPending,
  surface
}: {
  actionError?: string | null;
  error: unknown;
  isLoading: boolean;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (result: MessagingParticipantSearchResult) => void;
  query: string;
  results: MessagingParticipantSearchResult[];
  selectPending: boolean;
  surface: MessagingSurface;
}) {
  const hasSearch = query.trim().length >= 2;

  return (
    <TopLayerModal label="New message" onClose={onClose} testId="message-compose-modal">
      <section className="relative z-10 flex h-[100dvh] w-full flex-col rounded-none border border-white/8 bg-[#070707]/96 shadow-[0_20px_60px_rgba(0,0,0,0.38)] sm:h-[min(80vh,38rem)] sm:max-w-xl sm:rounded-lg">
        <div className="border-b border-white/8 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-[#c4f24e]">New Message</p>
              <h3 className="mt-1 text-lg font-black text-white">Choose a conversation</h3>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/60 transition hover:border-[#c4f24e]/28 hover:text-white"
              aria-label="Close new message"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <label className="sr-only" htmlFor="message-participant-search">Search @username, barber, shop, or client</label>
          <div className="mt-3 flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 focus-within:border-[#c4f24e]/30">
            <Search className="h-4 w-4 text-white/36" aria-hidden="true" />
            <input
              id="message-participant-search"
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search @username, barber, shop, or client"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/34"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <FeedbackBanner tone="error" message={readableError(error, "Unable to search message participants.")} />
          ) : null}
          {actionError ? (
            <div className={error ? "mt-2" : undefined}>
              <FeedbackBanner tone="error" message={actionError} />
            </div>
          ) : null}

          {!hasSearch ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/56">
              Search a public username like @phillipforsure.
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              <ThreadSkeleton />
              <ThreadSkeleton />
            </div>
          ) : results.length ? (
            <div className="space-y-2">
              {results.map((result) => (
                <ParticipantSearchResultRow
                  key={`${result.resultType}-${result.id}`}
                  disabled={selectPending}
                  result={result}
                  surface={surface}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/56">
              No public profiles or messages found. Try searching a public username like @phillipforsure.
            </div>
          )}
        </div>
      </section>
    </TopLayerModal>
  );
}

export function MessagingInboxScreen({
  surface,
  basePath,
  cultureHref,
  cultureLabel = "Culture",
  selectedThreadId,
  startSupportIntent = false,
  title,
  subtitle
}: {
  surface: MessagingSurface;
  basePath: string;
  cultureHref?: string;
  cultureLabel?: string;
  selectedThreadId?: string;
  startSupportIntent?: boolean;
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const copy = getSurfaceCopy(surface);
  const threadsQuery = useMessageThreadsQuery();
  const createThreadMutation = useCreateMessageThreadMutation();
  const markReadMutation = useMarkMessageThreadReadMutation();
  const broadcastMutation = useSendMessageBroadcastMutation();
  // Desktop (md+) restores the two-pane layout: conversation list + open thread inline.
  // Mobile keeps the single-pane list that opens each thread full-screen (modal).
  const isWideViewport = useIsWideViewport();
  const usesModalThreadView = !isWideViewport;
  const [modalThreadId, setModalThreadId] = useState<string | null>(selectedThreadId ?? null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeActionError, setComposeActionError] = useState<string | null>(null);
  const [participantSearch, setParticipantSearch] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [broadcastLocationId, setBroadcastLocationId] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<MessagingBroadcastAudience>("all");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [paymentRequestActionId, setPaymentRequestActionId] = useState<string | null>(null);
  const [optimisticallyReadThreadIds, setOptimisticallyReadThreadIds] = useState<Set<string>>(() => new Set());
  const startersRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredSupportIntentRef = useRef(false);
  const markedReadThreadIdsRef = useRef<Set<string>>(new Set());
  const pendingParticipantSelectionRef = useRef<string | null>(null);

  const available = threadsQuery.data?.available ?? false;
  const threadAggregation = useMemo(
    () => orderAndDedupeThreads(threadsQuery.data?.threads ?? [], surface),
    [surface, threadsQuery.data?.threads]
  );
  const threads = useMemo(
    () =>
      threadAggregation.threads.map((thread) =>
        optimisticallyReadThreadIds.has(thread.id)
          ? { ...thread, hasUnread: false }
          : thread
      ),
    [optimisticallyReadThreadIds, threadAggregation.threads]
  );
  const appointmentStarters = useMemo(() => threadsQuery.data?.eligibleAppointments ?? [], [threadsQuery.data?.eligibleAppointments]);
  const uniqueAppointmentStarters = useMemo(() => {
    const seen = new Set<string>();
    return appointmentStarters.filter((starter) => {
      const key = `${starter.appointmentId}:${starter.counterpart.profileId}:${starter.appointmentContext.status}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [appointmentStarters]);
  const contactStarters = useMemo(() => threadsQuery.data?.eligibleContacts ?? [], [threadsQuery.data?.eligibleContacts]);
  const broadcastTargets = useMemo(() => threadsQuery.data?.broadcastTargets ?? [], [threadsQuery.data?.broadcastTargets]);
  const activeThreadId = usesModalThreadView ? modalThreadId ?? undefined : selectedThreadId ?? threads[0]?.id;
  const requestActionMutation = useMessageRequestActionMutation(activeThreadId);
  const threadQuery = useMessageThreadQuery(activeThreadId);
  const participantSearchQuery = useMessageParticipantSearchQuery(participantSearch, composeOpen && available);
  const isUnifiedSearchActive = threadSearch.trim().length >= 2;
  const mainParticipantSearchQuery = useMessageParticipantSearchQuery(threadSearch, isUnifiedSearchActive && available);
  const sendMessageMutation = useSendMessageMutation(activeThreadId);
  const approvePaymentRequestMutation = useApprovePosPaymentRequestMutation(activeThreadId);
  const declinePaymentRequestMutation = useDeclinePosPaymentRequestMutation(activeThreadId);
  const activeThread = threadQuery.data?.thread ?? null;
  const messages = threadQuery.data?.messages ?? [];
  const relatedAppointmentContexts = threadQuery.data?.relatedAppointmentContexts?.length
    ? threadQuery.data.relatedAppointmentContexts
    : activeThreadId
      ? threadAggregation.relatedAppointmentContextsByThreadId.get(activeThreadId) ?? []
      : [];
  const supportThread = useMemo(
    () => threads.find((thread) => thread.threadType === "support") ?? null,
    [threads]
  );
  const quickContacts = useMemo(
    () => buildQuickContacts(threads),
    [threads]
  );
  const activeThreadFilters = surface === "barber" ? barberThreadFilters : surface === "shop" ? shopThreadFilters : threadFilters;
  const requestCount = useMemo(
    () => threads.filter((thread) => thread.lifecycleStatus === "request_pending" && thread.request?.isRecipient).length,
    [threads]
  );
  const displayedThreads = useMemo(
    () => filterThreads(threads, threadFilter, threadSearch, surface),
    [surface, threadFilter, threadSearch, threads]
  );
  const mainSearchResults = useMemo(() => {
    const displayedThreadIds = new Set(displayedThreads.map((thread) => thread.id));
    return (mainParticipantSearchQuery.data?.results ?? []).filter((result) => {
      return !result.existingThreadId || !displayedThreadIds.has(result.existingThreadId);
    });
  }, [displayedThreads, mainParticipantSearchQuery.data?.results]);

  useEffect(() => {
    setModalThreadId(selectedThreadId ?? null);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!activeThreadId || !available) {
      return;
    }

    if (markedReadThreadIdsRef.current.has(activeThreadId)) {
      return;
    }

    markedReadThreadIdsRef.current.add(activeThreadId);
    setOptimisticallyReadThreadIds((current) => {
      if (current.has(activeThreadId)) {
        return current;
      }

      const next = new Set(current);
      next.add(activeThreadId);
      return next;
    });

    void markReadMutation.mutateAsync(activeThreadId).catch(() => {
      markedReadThreadIdsRef.current.delete(activeThreadId);
      setOptimisticallyReadThreadIds((current) => {
        if (!current.has(activeThreadId)) {
          return current;
        }

        const next = new Set(current);
        next.delete(activeThreadId);
        return next;
      });
      void threadsQuery.refetch();
    });
  }, [activeThreadId, available, markReadMutation, threadsQuery]);

  useEffect(() => {
    if (!broadcastLocationId && broadcastTargets[0]?.locationId) {
      setBroadcastLocationId(broadcastTargets[0].locationId);
    }
  }, [broadcastLocationId, broadcastTargets]);

  const activateConversationThread = useCallback((threadId: string, options: { closeCompose?: boolean } = {}) => {
    if (options.closeCompose) {
      setComposeOpen(false);
      setParticipantSearch("");
      setComposeActionError(null);
    }

    setComposerBody("");
    if (usesModalThreadView) {
      setModalThreadId(threadId);
    }
    router.push(`${basePath}/${threadId}` as Route, { scroll: false });
  }, [basePath, router, usesModalThreadView]);

  const handleStartThread = useCallback(async (payload: MessagingCreateThreadInput, successMessage: string) => {
    setStatusUpdate(null);
    try {
      const threadPayload = await createThreadMutation.mutateAsync(payload);
      const threadId = threadPayload.thread?.id;
      if (!threadId) {
        throw new Error("Conversation opened without a thread id.");
      }
      setStatusUpdate({ tone: "success", message: successMessage });
      activateConversationThread(threadId);
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to open the conversation.") });
    }
  }, [activateConversationThread, createThreadMutation]);

  const handleOpenThread = useCallback((threadId: string) => {
    activateConversationThread(threadId, { closeCompose: true });
  }, [activateConversationThread]);

  const handleCloseCompose = useCallback(() => {
    setComposeOpen(false);
    setParticipantSearch("");
    setComposeActionError(null);
  }, []);

  const handleCloseThread = useCallback(() => {
    if (!usesModalThreadView) {
      return;
    }

    setComposerBody("");
    setModalThreadId(null);
    router.push(basePath as Route, { scroll: false });
  }, [basePath, router, usesModalThreadView]);

  useEffect(() => {
    if (
      surface !== "client"
      || !startSupportIntent
      || selectedThreadId
      || hasTriggeredSupportIntentRef.current
      || threadsQuery.isLoading
      || !available
    ) {
      return;
    }

    if (supportThread?.id) {
      hasTriggeredSupportIntentRef.current = true;
      router.replace(`${basePath}/${supportThread.id}` as Route);
      return;
    }

    hasTriggeredSupportIntentRef.current = true;
    void handleStartThread({ threadType: "support" }, "Support conversation ready.");
  }, [
    available,
    basePath,
    router,
    selectedThreadId,
    startSupportIntent,
    supportThread?.id,
    surface,
    handleStartThread,
    threadsQuery.isLoading
  ]);

  async function handleSendMessage() {
    if (!activeThreadId) {
      return;
    }

    setStatusUpdate(null);
    try {
      await sendMessageMutation.mutateAsync({ body: composerBody });
      setComposerBody("");
      setStatusUpdate({ tone: "success", message: "Message sent." });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to send the message.") });
    }
  }

  async function handleApprovePaymentRequest(paymentRequestId: string) {
    setStatusUpdate(null);
    setPaymentRequestActionId(paymentRequestId);
    try {
      await approvePaymentRequestMutation.mutateAsync(paymentRequestId);
      setStatusUpdate({ tone: "success", message: "Payment approved." });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to approve this payment request.") });
    } finally {
      setPaymentRequestActionId(null);
    }
  }

  async function handleDeclinePaymentRequest(paymentRequestId: string) {
    setStatusUpdate(null);
    setPaymentRequestActionId(paymentRequestId);
    try {
      await declinePaymentRequestMutation.mutateAsync(paymentRequestId);
      setStatusUpdate({ tone: "info", message: "Payment request declined." });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to decline this payment request.") });
    } finally {
      setPaymentRequestActionId(null);
    }
  }

  async function handleRequestAction(requestId: string, action: "accept" | "decline" | "block" | "report") {
    setStatusUpdate(null);
    try {
      await requestActionMutation.mutateAsync({
        requestId,
        action,
        reason: action === "report" ? "Message request report" : undefined
      });
      setStatusUpdate({
        tone: action === "accept" ? "success" : action === "decline" ? "info" : "error",
        message: action === "accept"
          ? "Message request accepted."
          : action === "decline"
            ? "Message request declined."
            : action === "block"
              ? "You cannot message this user."
              : "Report submitted."
      });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to update message request.") });
    }
  }

  async function handleBroadcast() {
    if (!broadcastLocationId || !broadcastBody.trim()) {
      return;
    }

    setStatusUpdate(null);
    try {
      const result = await broadcastMutation.mutateAsync({
        locationId: broadcastLocationId,
        audience: broadcastAudience,
        body: broadcastBody
      });
      setBroadcastBody("");
      setStatusUpdate({
        tone: "success",
        message: `Broadcast delivered to ${result.broadcast.deliveredCount} ${result.broadcast.deliveredCount === 1 ? "conversation" : "conversations"}.`
      });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to send the shop broadcast.") });
    }
  }

  async function handleSelectParticipant(result: MessagingParticipantSearchResult) {
    setStatusUpdate(null);
    setComposeActionError(null);
    const selectionKey = `${result.resultType}:${result.id}`;
    if (pendingParticipantSelectionRef.current) {
      return;
    }

    pendingParticipantSelectionRef.current = selectionKey;
    try {
      console.info("[messages] participant_result_open_requested", {
        resultType: result.resultType,
        participantType: result.participantType,
        targetId: result.participantId,
        hasExistingThread: Boolean(result.existingThreadId),
        threadType: result.createThreadInput && "threadType" in result.createThreadInput ? result.createThreadInput.threadType : null
      });

      if (result.existingThreadId) {
        handleOpenThread(result.existingThreadId);
        console.info("[messages] participant_result_opened", {
          resultType: result.resultType,
          targetId: result.participantId,
          threadId: result.existingThreadId,
          status: "reused"
        });
        return;
      }

      if (!result.createThreadInput) {
        setStatusUpdate({ tone: "info", message: result.messageDisabledReason ?? "Messaging this profile is not available yet." });
        setComposeActionError(result.messageDisabledReason ?? "Messaging this profile is not available yet.");
        return;
      }

      const threadPayload = await createThreadMutation.mutateAsync(result.createThreadInput);
      const threadId = threadPayload.thread?.id;
      if (!threadId) {
        throw new Error("Conversation opened without a thread id.");
      }

      activateConversationThread(threadId, { closeCompose: true });
      setStatusUpdate({ tone: "success", message: "Conversation ready." });
      console.info("[messages] participant_result_opened", {
        resultType: result.resultType,
        targetId: result.participantId,
        threadId,
        status: result.existingThreadId ? "reused" : "created"
      });
    } catch (error) {
      const apiError = getMessagingApiError(error);
      console.warn("[messages:create-open-failed]", {
        status: apiError?.status ?? null,
        code: apiError?.code ?? null,
        step: apiError?.step ?? null,
        message: error instanceof Error ? error.message : String(error),
        targetType: result.resultType,
        targetIdKind: getParticipantTargetIdKind(result),
        actorRole: threadsQuery.data?.viewer.role ?? surface,
        actorProfileId: threadsQuery.data?.viewer.profileId ?? null,
        responseBody: apiError?.responseBody ?? null,
        participantType: result.participantType,
        threadType: result.createThreadInput && "threadType" in result.createThreadInput ? result.createThreadInput.threadType : null,
      });
      const message = readableError(error, "Couldn't open conversation. Try again.");
      setStatusUpdate({ tone: "error", message });
      setComposeActionError("Couldn't open conversation. Try again.");
    } finally {
      pendingParticipantSelectionRef.current = null;
    }
  }

  const handleNewMessage = () => {
    if (usesModalThreadView) {
      setStatusUpdate(null);
      setComposeActionError(null);
      setComposeOpen(true);
      setParticipantSearch("");
      return;
    }

    startersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="relative isolate overflow-hidden rounded-[18px] border border-white/8 bg-[#050505] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] sm:p-4"
      data-testid={`messaging-inbox-${surface}`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(245,241,232,0.16),transparent)]" />

      <PageHeader
        label="Inbox"
        title={title}
        subtitle={subtitle}
        action={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
            <Button
              className="h-10 rounded-lg px-4 normal-case tracking-normal"
              disabled={surface === "client" ? createThreadMutation.isPending : false}
              onClick={handleNewMessage}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
              {createThreadMutation.isPending ? "Opening..." : "New Message"}
            </Button>
            {cultureHref ? (
              <Link
                href={cultureHref as Route}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-xs font-black text-white/74 transition hover:border-white/20 hover:text-white"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {cultureLabel}
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mt-3 space-y-2">
        {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
        {threadsQuery.error ? <FeedbackBanner tone="error" message={readableError(threadsQuery.error, "Unable to load the messaging inbox.")} /> : null}
      </div>

      {!available ? (
        <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/58">
          Messaging becomes available when the live thread environment is connected.
        </div>
      ) : null}

      {available ? (
        <div className={usesModalThreadView ? "mt-4" : "mt-4 grid gap-4 md:grid-cols-[0.88fr_1.12fr]"}>
          <aside className={usesModalThreadView ? "mx-auto w-full max-w-3xl space-y-3" : "min-w-0 space-y-3"}>
            <div>
              <SearchBar
                aria-label="Search messages"
                placeholder="Search"
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
                className="h-11 rounded-lg border-white/10 bg-white/[0.035] text-sm [&_input]:min-h-10"
              />
            </div>

            <ThreadStoryRail
              basePath={basePath}
              contacts={quickContacts}
              onOpenThread={usesModalThreadView ? handleOpenThread : undefined}
            />

            <div className="flex gap-2 overflow-x-auto pb-1">
              {activeThreadFilters.map((filter) => (
                <FilterChip
                  key={filter.key}
                  type="button"
                  active={threadFilter === filter.key}
                  className="h-8 rounded-lg px-3 text-xs"
                  onClick={() => setThreadFilter(filter.key)}
                >
                  {filter.key === "requests" && requestCount ? `${filter.label} ${requestCount}` : filter.label}
                </FilterChip>
              ))}
            </div>

            <div className="space-y-2">
              {threadsQuery.isLoading && !threadsQuery.data ? (
                <>
                  <ThreadSkeleton />
                  <ThreadSkeleton />
                  <ThreadSkeleton />
                </>
              ) : (
                <>
                  {isUnifiedSearchActive && displayedThreads.length ? (
                    <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/38">Existing conversations</p>
                  ) : null}

                  {displayedThreads.length ? displayedThreads.map((thread) => (
                    <ThinThreadRow
                      key={thread.id}
                      thread={thread}
                      basePath={basePath}
                      active={thread.id === activeThreadId}
                      onOpen={usesModalThreadView ? handleOpenThread : undefined}
                    />
                  )) : null}

                  {isUnifiedSearchActive ? (
                    <div className={displayedThreads.length ? "pt-2" : undefined}>
                      {displayedThreads.length || mainSearchResults.length || mainParticipantSearchQuery.isLoading || mainParticipantSearchQuery.error ? (
                        <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/38">People and businesses</p>
                      ) : null}

                      {mainParticipantSearchQuery.error ? (
                        <FeedbackBanner tone="error" message="Unable to search public usernames. Try again." />
                      ) : mainParticipantSearchQuery.isLoading ? (
                        <div className="space-y-2">
                          <ThreadSkeleton />
                          <ThreadSkeleton />
                        </div>
                      ) : mainSearchResults.length ? (
                        <div className="space-y-2">
                          {mainSearchResults.map((result) => (
                            <ParticipantSearchResultRow
                              key={`${result.resultType}-${result.id}`}
                              disabled={createThreadMutation.isPending}
                              result={result}
                              surface={surface}
                              onSelect={(selectedResult) => void handleSelectParticipant(selectedResult)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!displayedThreads.length && (!isUnifiedSearchActive || (!mainSearchResults.length && !mainParticipantSearchQuery.isLoading && !mainParticipantSearchQuery.error)) ? (
                    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/58">
                      <p className="font-bold text-white/72">
                        {isUnifiedSearchActive ? "No matching people or messages." : threads.length ? "No matching messages." : copy.emptyTitle}
                      </p>
                      {isUnifiedSearchActive ? (
                        <p className="mt-1">Try a public username like @phillipforsure.</p>
                      ) : !threads.length ? (
                        <p className="mt-1">{copy.emptyThreadCopy}</p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {surface !== "client" && !usesModalThreadView ? (
              <div ref={startersRef} className="rounded-[14px] border border-white/8 bg-white/[0.025] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-[#c4f24e]">{copy.starterTitle}</p>
                  <p className="mt-1 text-xs text-white/48">{copy.starterCopy}</p>
                </div>
                <MessageSquareText className="h-4 w-4 text-[#e4f9b8]" aria-hidden="true" />
              </div>
              <div className="mt-3 space-y-2">
                {uniqueAppointmentStarters.map((starter) => (
                  <div key={starter.appointmentId} className="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-black/24 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{starter.counterpart.fullName}</p>
                      <p className="truncate text-xs text-white/50">
                        {starter.appointmentContext.serviceName} • {starter.appointmentContext.statusLabel}
                      </p>
                    </div>
                    <Button
                      className="h-8 rounded-lg px-3 text-xs normal-case tracking-normal"
                      disabled={createThreadMutation.isPending}
                      onClick={() =>
                        void handleStartThread(
                          { appointmentId: starter.appointmentId },
                          "Appointment conversation ready."
                        )
                      }
                    >
                      {createThreadMutation.isPending ? "Opening..." : "Open"}
                    </Button>
                  </div>
                ))}

                {contactStarters.map((starter) => (
                  <div key={`${starter.threadType}-${starter.locationId}-${starter.profileId}`} className="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-black/24 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{starter.fullName}</p>
                      <p className="truncate text-xs text-white/50">{starter.locationLabel}</p>
                    </div>
                    <Button
                      className="h-8 rounded-lg px-3 text-xs normal-case tracking-normal"
                      disabled={createThreadMutation.isPending}
                      onClick={() =>
                        void handleStartThread(
                          {
                            threadType: starter.threadType,
                            profileId: starter.profileId,
                            locationId: starter.locationId
                          },
                          "Conversation ready."
                        )
                      }
                    >
                      {createThreadMutation.isPending ? "Opening..." : "Open"}
                    </Button>
                  </div>
                ))}

                {!uniqueAppointmentStarters.length && !contactStarters.length ? (
                  <div className="rounded-lg border border-dashed border-white/10 bg-black/24 p-3 text-sm leading-6 text-white/52">
                    No additional thread starters are available right now.
                  </div>
                ) : null}
              </div>
              </div>
            ) : null}

            {surface === "shop" && !usesModalThreadView ? (
              <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#c4f24e]">{copy.broadcastTitle}</p>
                    <p className="mt-1 text-xs text-white/48">{copy.broadcastCopy}</p>
                  </div>
                  <RadioTower className="h-4 w-4 text-[#e4f9b8]" aria-hidden="true" />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <select
                    className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-white outline-none transition focus:border-[#c4f24e]/30"
                    value={broadcastLocationId}
                    onChange={(event) => setBroadcastLocationId(event.target.value)}
                  >
                    <option value="">Choose location</option>
                    {broadcastTargets.map((target) => (
                      <option key={target.locationId} value={target.locationId}>{target.locationLabel}</option>
                    ))}
                  </select>
                  <select
                    className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-white outline-none transition focus:border-[#c4f24e]/30"
                    value={broadcastAudience}
                    onChange={(event) => setBroadcastAudience(event.target.value as MessagingBroadcastAudience)}
                  >
                    <option value="all">Clients and barbers</option>
                    <option value="clients">Clients only</option>
                    <option value="barbers">Barbers only</option>
                  </select>
                </div>
                <textarea
                  value={broadcastBody}
                  onChange={(event) => setBroadcastBody(event.target.value)}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#090909] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-[#C4F24E]/28"
                  placeholder="Send a shop update."
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    className="h-9 rounded-lg px-3 text-xs normal-case tracking-normal"
                    disabled={broadcastMutation.isPending || !broadcastLocationId || !broadcastBody.trim()}
                    onClick={() => void handleBroadcast()}
                  >
                    <RadioTower className="h-4 w-4" aria-hidden="true" />
                    {broadcastMutation.isPending ? "Sending..." : "Send broadcast"}
                  </Button>
                </div>
              </div>
            ) : null}
          </aside>

          {!usesModalThreadView ? (
            <ConversationPanel
              activeThread={activeThread}
              activeThreadId={activeThreadId}
              basePath={basePath}
              copy={copy}
              composerBody={composerBody}
              isLoading={threadQuery.isLoading}
              messages={messages}
              onApprovePaymentRequest={(paymentRequestId) => void handleApprovePaymentRequest(paymentRequestId)}
              onRequestAction={(requestId, action) => void handleRequestAction(requestId, action)}
              relatedAppointmentContexts={relatedAppointmentContexts}
              selectedThreadId={selectedThreadId}
              paymentRequestActionId={paymentRequestActionId}
              sendPending={sendMessageMutation.isPending}
              surface={surface}
              threadError={threadQuery.error}
              onComposerChange={setComposerBody}
              onDeclinePaymentRequest={(paymentRequestId) => void handleDeclinePaymentRequest(paymentRequestId)}
              onSend={() => void handleSendMessage()}
            />
          ) : null}
        </div>
      ) : null}

      {available && usesModalThreadView ? (
        <ConversationModal
          activeThread={activeThread}
          activeThreadId={activeThreadId}
          basePath={basePath}
          copy={copy}
          composerBody={composerBody}
          isLoading={threadQuery.isLoading}
          messages={messages}
          onApprovePaymentRequest={(paymentRequestId) => void handleApprovePaymentRequest(paymentRequestId)}
          onRequestAction={(requestId, action) => void handleRequestAction(requestId, action)}
          relatedAppointmentContexts={relatedAppointmentContexts}
          paymentRequestActionId={paymentRequestActionId}
          sendPending={sendMessageMutation.isPending}
          surface={surface}
          threadError={threadQuery.error}
          onClose={handleCloseThread}
          onComposerChange={setComposerBody}
          onDeclinePaymentRequest={(paymentRequestId) => void handleDeclinePaymentRequest(paymentRequestId)}
          onSend={() => void handleSendMessage()}
        />
      ) : null}

      {available && usesModalThreadView && composeOpen ? (
        <ComposeModal
          actionError={composeActionError}
          error={participantSearchQuery.error}
          isLoading={participantSearchQuery.isLoading}
          onClose={handleCloseCompose}
          onQueryChange={setParticipantSearch}
          onSelect={(result) => void handleSelectParticipant(result)}
          query={participantSearch}
          results={participantSearchQuery.data?.results ?? []}
          selectPending={createThreadMutation.isPending}
          surface={surface}
        />
      ) : null}
    </div>
  );
}
