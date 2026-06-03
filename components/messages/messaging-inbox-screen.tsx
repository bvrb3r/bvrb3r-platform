"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageSquarePlus, MessageSquareText, RadioTower, Search, Send, X } from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, FilterChip, SearchBar } from "@/design/components";
import { isBarberAccountRole } from "@/lib/auth/roles";
import {
  useApprovePosPaymentRequestMutation,
  useCreateMessageThreadMutation,
  useDeclinePosPaymentRequestMutation,
  useMessageParticipantSearchQuery,
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

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function getSurfaceCopy(surface: MessagingSurface) {
  if (surface === "shop") {
    return {
      shellLabel: "MESSAGES",
      composerPlaceholder: "Message this thread.",
      emptyTitle: "No shop messages yet.",
      emptyThreadCopy: "Client, barber, team, booking, and support conversations will appear here.",
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
      composerPlaceholder: "Message the client.",
      emptyTitle: "No client messages yet.",
      emptyThreadCopy: "Booked clients, requests, shop lines, and support conversations will appear here.",
      emptyPanelCopy: "Pick a client conversation or open one from a booked appointment.",
      starterTitle: "New messages",
      starterCopy: "Start from appointment-linked clients or connected shop lines.",
      broadcastTitle: "",
      broadcastCopy: ""
    };
  }

  return {
    shellLabel: "MESSAGES",
    composerPlaceholder: "Message your barber, shop, or support.",
    emptyTitle: "No messages yet.",
    emptyThreadCopy: "Your barber, shop, booking, and support conversations will appear here.",
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

  if (role === "client") {
    return "Client";
  }

  return null;
}

function getSurfaceThreadFilter(thread: MessagingThreadSummary, surface: MessagingSurface): ThreadFilter {
  if (surface !== "client" && isBookingRequestThread(thread)) {
    return "requests";
  }

  if (surface !== "client" && thread.appointmentContext) {
    return "bookings";
  }

  const role = thread.counterpart?.role;
  if (thread.threadType === "support" || role === "platform_admin") {
    return "support";
  }

  if (role === "client") {
    return "clients";
  }

  if (isBarberAccountRole(role)) {
    return "barbers";
  }

  if (role === "owner" || role === "shop_owner_user" || role === "manager" || role === "front_desk") {
    return surface === "shop" ? "team" : "shops";
  }

  return "other";
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

function getThreadPreview(thread: MessagingThreadSummary) {
  if (thread.lastMessage?.body) {
    return thread.lastMessage.body;
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

function filterThreads(threads: MessagingThreadSummary[], activeFilter: ThreadFilter, query: string, surface: MessagingSurface) {
  const normalizedQuery = query.trim().toLowerCase();

  return threads.filter((thread) => {
    const filterKey = getSurfaceThreadFilter(thread, surface);
    const matchesFilter = activeFilter === "all"
      || filterKey === activeFilter
      || (activeFilter === "bookings" && Boolean(thread.appointmentContext));
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

function getClientConversationKey(thread: MessagingThreadSummary) {
  if (thread.threadType === "support" || thread.counterpart?.role === "platform_admin") {
    return `support:${thread.counterpart?.profileId ?? "bvrb3r"}`;
  }

  if (thread.threadType === "client_barber" && thread.counterpart?.profileId) {
    return `barber:${thread.counterpart.profileId}`;
  }

  if (thread.threadType === "client_shop") {
    return `shop:${thread.locationId ?? thread.counterpart?.profileId ?? thread.id}`;
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
    const key = surface === "client" ? getClientConversationKey(thread) : `thread:${thread.id}`;
    threadMap.set(key, [...(threadMap.get(key) ?? []), thread]);
  }

  const relatedAppointmentContextsByThreadId = new Map<string, AppointmentContextView[]>();
  const aggregatedThreads = Array.from(threadMap.values()).map((group) => {
    const sortedGroup = [...group].sort((left, right) => getThreadActivityTime(right) - getThreadActivityTime(left));
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
    <span className="inline-flex h-5 items-center rounded-[6px] border border-white/10 bg-white/[0.035] px-1.5 text-[10px] font-bold uppercase text-[#d7ffab]">
      {label}
    </span>
  );
}

function ParticipantSearchResultRow({
  result,
  disabled,
  onSelect
}: {
  result: MessagingParticipantSearchResult;
  disabled: boolean;
  onSelect: (result: MessagingParticipantSearchResult) => void;
}) {
  const publicDisplayName = getParticipantSearchDisplay(result);
  const username = result.publicUsername?.trim().replace(/^@+/, "");
  const secondaryUsername = username && publicDisplayName !== `@${username}` ? `@${username}` : null;

  return (
    <button
      type="button"
      className="grid min-h-[68px] w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-left transition hover:border-[#a3ff12]/28 hover:bg-white/[0.05] disabled:opacity-55"
      disabled={disabled}
      onClick={() => onSelect(result)}
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
          <RolePill label={result.resultType === "support" ? "Support" : result.resultType === "shop" ? "Shop" : result.resultType === "client" ? "Client" : "Barber"} />
        </span>
        {secondaryUsername ? (
          <span className="mt-0.5 block truncate text-xs font-bold text-[#d7ffab]/85">{secondaryUsername}</span>
        ) : null}
        <span className="mt-0.5 block truncate text-xs text-white/48">
          {result.existingThreadId ? "Existing conversation" : result.publicContextLine ?? result.subtitle ?? "Start a conversation"}
        </span>
      </span>
      <span className="rounded-lg border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-2.5 py-1 text-[11px] font-black text-[#d7ffab]">
        {result.existingThreadId ? "Open" : "Start"}
      </span>
    </button>
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
                  contact.active ? "border-2 border-[#a3ff12]/80 shadow-[0_0_18px_rgba(163,255,18,0.18)]" : "border-white/12"
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
          ? "border-[#a3ff12]/35 bg-[#a3ff12]/10"
          : "border-white/8 bg-white/[0.022] hover:border-[#a3ff12]/24 hover:bg-white/[0.04]"
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
        {usernameLine ? <p className="mt-0.5 truncate text-xs font-bold text-[#d7ffab]/85">{usernameLine}</p> : null}
        <p className="mt-0.5 truncate text-xs font-medium text-white/54">{contextDetail}</p>
        <p className="mt-0.5 truncate text-xs text-white/42">{preview}</p>
      </div>
      <div className="flex h-full flex-col items-end justify-between py-1">
        <span className="text-[11px] font-medium text-white/42">
          {formatCompactThreadTime(thread.lastMessage?.createdAt ?? thread.updatedAt)}
        </span>
        {thread.hasUnread ? (
          <span className="h-2.5 w-2.5 rounded-full bg-[#a3ff12] shadow-[0_0_14px_rgba(163,255,18,0.75)]" aria-label="Unread message" />
        ) : thread.appointmentContext ? (
          <span className="rounded-[6px] border border-[#a3ff12]/18 bg-[#a3ff12]/8 px-1.5 py-0.5 text-[10px] font-bold text-[#d7ffab]">
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
      className="w-full max-w-[22rem] rounded-lg border border-[#a3ff12]/24 bg-[linear-gradient(180deg,rgba(163,255,18,0.12),rgba(8,8,8,0.96))] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.32)]"
      data-testid="pos-payment-request-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d7ffab]">Payment Request</p>
          <p className="mt-2 text-sm font-black text-white">
            {counterpartName} requested {formatMoneyFromCents(metadata.amountCents)}
          </p>
          <p className="mt-1 text-xs text-white/56">Walk-in service</p>
        </div>
        <span className={[
          "rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]",
          status === "paid"
            ? "border-[#a3ff12]/28 bg-[#a3ff12]/12 text-[#d7ffab]"
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
            className="h-9 rounded-lg bg-[#a3ff12] px-3 text-xs font-black text-[#050505] transition hover:bg-[#d7ffab] disabled:cursor-not-allowed disabled:opacity-60"
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
  const hasAppointment = Boolean(activeThread?.appointmentContext);
  const usernameLine = getSecondaryUsernameLine(activeThread, displayName);
  const publicContextLine = getPublicContextLine(activeThread);
  const profileHref = activeThread?.threadType === "support"
    ? null
    : activeThread?.counterpart?.publicProfileHref ?? null;
  const bookingHref = activeThread?.counterpart?.bookingHref ?? "/booking/new";

  return (
    <section
      className={[
        "flex flex-col border border-white/8 bg-[#070707]/96 shadow-[0_20px_60px_rgba(0,0,0,0.38)]",
        mode === "modal"
          ? "h-[100dvh] w-full rounded-none sm:h-[min(92vh,48rem)] sm:max-w-2xl sm:rounded-lg"
          : "min-h-[34rem] rounded-lg"
      ].join(" ")}
      data-testid={mode === "modal" ? "message-thread-modal" : "message-thread-panel"}
    >
      <div className="border-b border-white/8 px-3 py-3 sm:px-4">
        {onClose ? (
          <button
            type="button"
            className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-white/56 transition hover:text-[#d7ffab]"
            onClick={onClose}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
        ) : selectedThreadId ? (
          <Link href={basePath as Route} className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-white/56 transition hover:text-[#d7ffab] xl:hidden">
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
                  className="h-12 w-12 border-2 border-[#a3ff12]/65 text-sm"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-base font-black text-white">{displayName}</h3>
                    {roleBadgeLabel ? <RolePill label={roleBadgeLabel} /> : null}
                  </div>
                  {usernameLine ? <p className="mt-0.5 truncate text-xs font-bold text-[#d7ffab]/85">{usernameLine}</p> : null}
                  <p className="mt-0.5 truncate text-xs text-white/46">
                    {publicContextLine ?? (activeThread.threadType === "support" ? "Support" : "Direct conversation")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {profileHref ? (
                  <Link
                    href={profileHref as Route}
                    className="inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs font-bold text-white/72 transition hover:border-[#a3ff12]/28 hover:text-white"
                  >
                    View Profile
                  </Link>
                ) : activeThread.threadType !== "support" ? (
                  <button
                    type="button"
                    className="h-8 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/72 transition hover:border-[#a3ff12]/28 hover:text-white disabled:opacity-45"
                    disabled
                  >
                    View Profile
                  </button>
                ) : null}
                {surface !== "shop" && activeThread.threadType !== "support" ? (
                  <Link
                    href={bookingHref as Route}
                    className="inline-flex h-8 items-center rounded-lg bg-[#a3ff12] px-3 text-xs font-black text-[#050505] transition hover:bg-[#d7ffab]"
                  >
                    Book
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-[#a3ff12]/18 bg-[#a3ff12]/8 px-3 py-2 text-xs font-semibold text-[#d7ffab]">
              {getConversationContextLine(activeThread)}
            </div>

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
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 scroll-smooth sm:px-4">
            {messages.length ? messages.map((message) => {
              const paymentRequestMetadata = getPosPaymentRequestMetadata(message.metadata);
              return (
              <div key={message.id} className={message.isOwn ? "flex justify-end" : "flex justify-start"}>
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
                        ? "bg-[#a3ff12] text-[#050505]"
                        : "border border-white/8 bg-white/[0.06] text-white"
                  ].join(" ")}
                >
                  <p className="font-medium">{message.body}</p>
                  <p className={["mt-1 text-[10px] font-bold", message.isOwn ? "text-black/52" : "text-white/38"].join(" ")}>
                    {message.messageType === "system" ? "System" : message.senderName ?? "Participant"} • {formatThreadTime(message.createdAt)}
                  </p>
                  </div>
                )}
              </div>
              );
            }) : (
              <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-center text-sm text-white/54">
                No messages yet.
              </div>
            )}
          </div>

          <div className="border-t border-white/8 p-3">
            <label className="sr-only" htmlFor={`${surface}-message-composer`}>Reply</label>
            <div className="flex items-end gap-2 rounded-lg border border-white/10 bg-black/35 p-2">
              <textarea
                id={`${surface}-message-composer`}
                value={composerBody}
                onChange={(event) => onComposerChange(event.target.value)}
                rows={1}
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-white/34"
                placeholder={copy.composerPlaceholder}
              />
              <button
                type="button"
                aria-label="Send message"
                disabled={sendPending || !composerBody.trim()}
                onClick={onSend}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#a3ff12] text-[#050505] transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-center">
          <div className="max-w-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#a3ff12]/28 bg-[#a3ff12]/10 text-[#a3ff12]">
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Message conversation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close conversation"
        onClick={onClose}
      />
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
    </div>
  );
}

function ComposeModal({
  error,
  isLoading,
  onClose,
  onQueryChange,
  onSelect,
  query,
  results,
  selectPending
}: {
  error: unknown;
  isLoading: boolean;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (result: MessagingParticipantSearchResult) => void;
  query: string;
  results: MessagingParticipantSearchResult[];
  selectPending: boolean;
}) {
  const hasSearch = query.trim().length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New message"
      data-testid="message-compose-modal"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close new message"
        onClick={onClose}
      />
      <section className="relative z-10 flex h-[100dvh] w-full flex-col rounded-none border border-white/8 bg-[#070707]/96 shadow-[0_20px_60px_rgba(0,0,0,0.38)] sm:h-[min(80vh,38rem)] sm:max-w-xl sm:rounded-lg">
        <div className="border-b border-white/8 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-[#a3ff12]">New Message</p>
              <h3 className="mt-1 text-lg font-black text-white">Choose a conversation</h3>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/60 transition hover:border-[#a3ff12]/28 hover:text-white"
              aria-label="Close new message"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <label className="sr-only" htmlFor="message-participant-search">Search barbers, shops, or clients</label>
          <div className="mt-3 flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 focus-within:border-[#a3ff12]/30">
            <Search className="h-4 w-4 text-white/36" aria-hidden="true" />
            <input
              id="message-participant-search"
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search barbers, shops, or clients"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/34"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <FeedbackBanner tone="error" message={readableError(error, "Unable to search message participants.")} />
          ) : null}

          {!hasSearch ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/56">
              Search for a barber, shop, or support line to start a message.
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
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/56">
              No messageable matches yet.
            </div>
          )}
        </div>
      </section>
    </div>
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
  const broadcastMutation = useSendMessageBroadcastMutation();
  const usesModalThreadView = true;
  const [modalThreadId, setModalThreadId] = useState<string | null>(selectedThreadId ?? null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [broadcastLocationId, setBroadcastLocationId] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<MessagingBroadcastAudience>("all");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [paymentRequestActionId, setPaymentRequestActionId] = useState<string | null>(null);
  const startersRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredSupportIntentRef = useRef(false);

  const available = threadsQuery.data?.available ?? false;
  const threadAggregation = useMemo(
    () => orderAndDedupeThreads(threadsQuery.data?.threads ?? [], surface),
    [surface, threadsQuery.data?.threads]
  );
  const threads = threadAggregation.threads;
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
    if (!broadcastLocationId && broadcastTargets[0]?.locationId) {
      setBroadcastLocationId(broadcastTargets[0].locationId);
    }
  }, [broadcastLocationId, broadcastTargets]);

  const handleStartThread = useCallback(async (payload: MessagingCreateThreadInput, successMessage: string) => {
    setStatusUpdate(null);
    try {
      const threadPayload = await createThreadMutation.mutateAsync(payload);
      if (threadPayload.thread?.id) {
        setStatusUpdate({ tone: "success", message: successMessage });
        if (usesModalThreadView) {
          setModalThreadId(threadPayload.thread.id);
        }
        router.push(`${basePath}/${threadPayload.thread.id}` as Route, { scroll: false });
      }
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to open the conversation.") });
    }
  }, [basePath, createThreadMutation, router, usesModalThreadView]);

  const handleOpenThread = useCallback((threadId: string) => {
    if (usesModalThreadView) {
      setComposerBody("");
      setComposeOpen(false);
      setModalThreadId(threadId);
      router.push(`${basePath}/${threadId}` as Route, { scroll: false });
    }
  }, [basePath, router, usesModalThreadView]);

  const handleCloseCompose = useCallback(() => {
    setComposeOpen(false);
    setParticipantSearch("");
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
    try {
      if (result.existingThreadId) {
        handleCloseCompose();
        handleOpenThread(result.existingThreadId);
        return;
      }

      const threadPayload = await createThreadMutation.mutateAsync(result.createThreadInput);
      if (threadPayload.thread?.id) {
        handleCloseCompose();
        setComposerBody("");
        setModalThreadId(threadPayload.thread.id);
        setStatusUpdate({ tone: "success", message: "Conversation ready." });
        router.push(`${basePath}/${threadPayload.thread.id}` as Route, { scroll: false });
      }
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to open the conversation.") });
    }
  }

  const handleNewMessage = () => {
    if (usesModalThreadView) {
      setStatusUpdate(null);
      setComposeOpen(true);
      setParticipantSearch("");
      return;
    }

    startersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="relative isolate overflow-hidden rounded-[18px] border border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.10),transparent_28%),#050505] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] sm:p-4"
      data-testid={`messaging-inbox-${surface}`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(163,255,18,0.55),transparent)]" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-[#a3ff12]">{copy.shellLabel}</p>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl" data-display="true">{title}</h2>
          <p className="mt-1 max-w-xl truncate text-sm text-white/54">{subtitle}</p>
        </div>
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-xs font-black text-white/74 transition hover:border-[#a3ff12]/30 hover:text-[#d7ffab]"
            >
              <RadioTower className="h-4 w-4" aria-hidden="true" />
              {cultureLabel}
            </Link>
          ) : null}
        </div>
      </div>

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
        <div className={usesModalThreadView ? "mt-4" : "mt-4 grid gap-4 xl:grid-cols-[0.88fr_1.12fr]"}>
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
                  {filter.label}
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
                  <p className="text-xs font-bold uppercase text-[#a3ff12]">{copy.starterTitle}</p>
                  <p className="mt-1 text-xs text-white/48">{copy.starterCopy}</p>
                </div>
                <MessageSquareText className="h-4 w-4 text-[#d7ffab]" aria-hidden="true" />
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
                    <p className="text-xs font-bold uppercase text-[#a3ff12]">{copy.broadcastTitle}</p>
                    <p className="mt-1 text-xs text-white/48">{copy.broadcastCopy}</p>
                  </div>
                  <RadioTower className="h-4 w-4 text-[#d7ffab]" aria-hidden="true" />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <select
                    className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-white outline-none transition focus:border-[#7cff00]/30"
                    value={broadcastLocationId}
                    onChange={(event) => setBroadcastLocationId(event.target.value)}
                  >
                    <option value="">Choose location</option>
                    {broadcastTargets.map((target) => (
                      <option key={target.locationId} value={target.locationId}>{target.locationLabel}</option>
                    ))}
                  </select>
                  <select
                    className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-white outline-none transition focus:border-[#7cff00]/30"
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
                  className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#090909] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-[#7CFF00]/28"
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
          error={participantSearchQuery.error}
          isLoading={participantSearchQuery.isLoading}
          onClose={handleCloseCompose}
          onQueryChange={setParticipantSearch}
          onSelect={(result) => void handleSelectParticipant(result)}
          query={participantSearch}
          results={participantSearchQuery.data?.results ?? []}
          selectPending={createThreadMutation.isPending}
        />
      ) : null}
    </div>
  );
}
