"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageSquarePlus, MessageSquareText, Plus, RadioTower, Send } from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, FilterChip, SearchBar } from "@/design/components";
import { isBarberAccountRole } from "@/lib/auth/roles";
import {
  useCreateMessageThreadMutation,
  useMessageThreadQuery,
  useMessageThreadsQuery,
  useSendMessageBroadcastMutation,
  useSendMessageMutation
} from "@/lib/messages/client";
import type {
  MessagingBroadcastAudience,
  MessagingContactCandidate,
  MessagingCreateThreadInput,
  MessagingInboxCandidate,
  MessagingThreadPayload,
  MessagingThreadSummary
} from "@/lib/messages/service";

type MessagingSurface = "client" | "barber" | "shop";
type ThreadFilter = "all" | "barbers" | "shops" | "support" | "other";
type BarberInboxTab = "primary" | "requests" | "bookings" | "general";
type ActiveThread = MessagingThreadPayload["thread"];

const threadFilters: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "barbers", label: "Barbers" },
  { key: "shops", label: "Shops" },
  { key: "support", label: "Support" },
  { key: "other", label: "Other" }
];

const barberThreadFilters: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "other", label: "Clients" },
  { key: "shops", label: "Shops" },
  { key: "support", label: "Support" }
];

const barberInboxTabs: { key: BarberInboxTab; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "requests", label: "Requests" },
  { key: "bookings", label: "Bookings" },
  { key: "general", label: "General" }
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
      shellLabel: "Shop messages",
      composerPlaceholder: "Message this thread.",
      emptyThreadCopy: "Pick a conversation or open a direct shop line.",
      starterTitle: "New lines",
      starterCopy: "Open a real client or barber thread tied to this location.",
      broadcastTitle: "Broadcast",
      broadcastCopy: "Send one update into the existing shop conversation network."
    };
  }

  if (surface === "barber") {
    return {
      shellLabel: "Client messages",
      composerPlaceholder: "Message the client.",
      emptyThreadCopy: "Pick a client conversation or open one from a booked appointment.",
      starterTitle: "New messages",
      starterCopy: "Start from appointment-linked clients or connected shop lines.",
      broadcastTitle: "",
      broadcastCopy: ""
    };
  }

  return {
    shellLabel: "Messages",
    composerPlaceholder: "Message your barber, shop, or support.",
    emptyThreadCopy: "Pick a conversation or start one from an appointment.",
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

  if (role === "owner" || role === "manager" || role === "front_desk") {
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

function getThreadFilter(role?: string | null, threadType?: string): ThreadFilter {
  if (threadType === "support" || role === "platform_admin") {
    return "support";
  }

  if (role === "owner" || role === "manager" || role === "front_desk") {
    return "shops";
  }

  if (isBarberAccountRole(role)) {
    return "barbers";
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

function isBookingRequestThread(thread: MessagingThreadSummary) {
  const statusText = `${thread.appointmentContext?.status ?? ""} ${thread.appointmentContext?.statusLabel ?? ""}`.toLowerCase();
  return Boolean(thread.appointmentContext && (statusText.includes("pending") || statusText.includes("request")));
}

function getBarberInboxCategory(thread: MessagingThreadSummary): Exclude<BarberInboxTab, "primary"> {
  if (isBookingRequestThread(thread)) {
    return "requests";
  }

  if (thread.appointmentContext) {
    return "bookings";
  }

  return "general";
}

function getBarberTabCount(tab: BarberInboxTab, threads: MessagingThreadSummary[]) {
  if (tab === "primary") {
    return threads.length;
  }

  return threads.filter((thread) => getBarberInboxCategory(thread) === tab).length;
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

function filterThreads(threads: MessagingThreadSummary[], activeFilter: ThreadFilter, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  return threads.filter((thread) => {
    const filterKey = getThreadFilter(thread.counterpart?.role, thread.threadType);
    const matchesFilter = activeFilter === "all" || filterKey === activeFilter;
    const searchable = [
      thread.counterpart?.fullName,
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

function filterBarberThreads(threads: MessagingThreadSummary[], activeTab: BarberInboxTab, activeFilter: ThreadFilter, query: string) {
  const filtered = filterThreads(threads, activeFilter, query);

  return filtered.filter((thread) => activeTab === "primary" || getBarberInboxCategory(thread) === activeTab);
}

function getThreadActivityTime(thread: MessagingThreadSummary) {
  const activityIso = thread.lastMessage?.createdAt ?? thread.updatedAt ?? thread.createdAt;
  const activityTime = new Date(activityIso).getTime();
  return Number.isNaN(activityTime) ? 0 : activityTime;
}

function orderAndDedupeThreads(threads: MessagingThreadSummary[]) {
  const threadMap = new Map<string, MessagingThreadSummary>();

  for (const thread of threads) {
    const existingThread = threadMap.get(thread.id);
    if (!existingThread || getThreadActivityTime(thread) > getThreadActivityTime(existingThread)) {
      threadMap.set(thread.id, thread);
    }
  }

  return Array.from(threadMap.values()).sort((left, right) => getThreadActivityTime(right) - getThreadActivityTime(left));
}

function buildQuickContacts(
  threads: MessagingThreadSummary[],
  appointmentStarters: MessagingInboxCandidate[],
  contactStarters: MessagingContactCandidate[]
) {
  const contacts = new Map<string, { id: string; label: string; active?: boolean; role?: string | null; threadId?: string; threadType?: string }>();

  for (const thread of threads) {
    const id = thread.counterpart?.profileId ?? thread.id;
    const label = thread.counterpart?.fullName ?? "Conversation";
    if (!contacts.has(id)) {
      contacts.set(id, {
        id,
        label,
        active: Boolean(thread.lastMessage || thread.appointmentContext),
        role: thread.counterpart?.role,
        threadId: thread.id,
        threadType: thread.threadType
      });
    }
  }

  for (const starter of appointmentStarters) {
    const id = starter.counterpart.profileId;
    if (!contacts.has(id)) {
      contacts.set(id, { id, label: starter.counterpart.fullName, role: starter.counterpart.role });
    }
  }

  for (const starter of contactStarters) {
    const id = starter.profileId;
    if (!contacts.has(id)) {
      contacts.set(id, { id, label: starter.fullName, role: starter.role, threadType: starter.threadType });
    }
  }

  return Array.from(contacts.values()).slice(0, 10);
}

function ThreadSkeleton() {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-48" />
      </div>
      <Skeleton className="h-3 w-10" />
    </div>
  );
}

function RolePill({ label }: { label: string }) {
  return (
    <span className="inline-flex h-5 items-center rounded-md border border-white/10 bg-white/[0.035] px-1.5 text-[10px] font-bold uppercase text-[#d7ffab]">
      {label}
    </span>
  );
}

function ThreadStoryRail({
  basePath,
  contacts,
  onNewMessage,
  onOpenThread
}: {
  basePath: string;
  contacts: ReturnType<typeof buildQuickContacts>;
  onNewMessage: () => void;
  onOpenThread?: (threadId: string) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max gap-3">
        <button
          type="button"
          className="group w-16 shrink-0 text-center"
          onClick={onNewMessage}
        >
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#a3ff12]/50 bg-[#a3ff12]/10 text-[#a3ff12] transition group-hover:bg-[#a3ff12] group-hover:text-[#050505]">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="mt-1 block truncate text-[11px] font-semibold text-white/64">New</span>
        </button>

        {contacts.map((contact) => {
          const avatar = (
            <>
              <Avatar
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
            <button key={contact.id} type="button" className="group w-16 shrink-0 text-center" onClick={onNewMessage}>
              {avatar}
            </button>
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
  const appointmentLine = getAppointmentLine(thread);
  const contextDetail = appointmentLine ?? getThreadStatusLabel(thread.threadType);
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
        "group grid min-h-[74px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2 transition",
        active
          ? "border-[#a3ff12]/35 bg-[#a3ff12]/10"
          : "border-white/8 bg-white/[0.022] hover:border-[#a3ff12]/24 hover:bg-white/[0.04]"
      ].join(" ")}
    >
      <Avatar
        alt={displayName}
        initials={getAvatarInitials(displayName, thread.counterpart?.role, thread.threadType)}
        className="h-11 w-11 text-sm"
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-bold text-white">{displayName}</p>
          {roleBadgeLabel ? <RolePill label={roleBadgeLabel} /> : null}
        </div>
        <p className="mt-0.5 truncate text-xs font-medium text-white/54">{contextDetail}</p>
        <p className="mt-0.5 truncate text-xs text-white/42">{preview}</p>
      </div>
      <div className="flex h-full flex-col items-end justify-between py-1">
        <span className="text-[11px] font-medium text-white/42">
          {formatCompactThreadTime(thread.lastMessage?.createdAt ?? thread.updatedAt)}
        </span>
        {thread.appointmentContext ? (
          <span className="rounded-md border border-[#a3ff12]/18 bg-[#a3ff12]/8 px-1.5 py-0.5 text-[10px] font-bold text-[#d7ffab]">
            {thread.appointmentContext.statusLabel}
          </span>
        ) : null}
      </div>
    </Link>
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
  selectedThreadId,
  sendPending,
  surface,
  threadError,
  onComposerChange,
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
  selectedThreadId?: string;
  sendPending: boolean;
  surface: MessagingSurface;
  threadError: unknown;
  onComposerChange: (value: string) => void;
  onSend: () => void;
}) {
  const participantSummary = activeThread?.participants
    .filter((participant) => !participant.isSelf)
    .map((participant) => participant.fullName)
    .join(", ") ?? "";
  const displayName = participantSummary || activeThread?.counterpart?.fullName || "Conversation";
  const roleBadgeLabel = getRoleBadgeLabel(activeThread?.counterpart?.role, activeThread?.threadType);
  const hasAppointment = Boolean(activeThread?.appointmentContext);

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
                  alt={displayName}
                  initials={getAvatarInitials(displayName, activeThread?.counterpart?.role, activeThread?.threadType)}
                  className="h-12 w-12 border-2 border-[#a3ff12]/65 text-sm"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-base font-black text-white">{displayName}</h3>
                    {roleBadgeLabel ? <RolePill label={roleBadgeLabel} /> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-white/46">
                    {activeThread.threadType === "support" ? "Support" : "Active soon"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="h-8 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/72 transition hover:border-[#a3ff12]/28 hover:text-white disabled:opacity-45"
                  disabled={activeThread.threadType === "support"}
                >
                  View Profile
                </button>
                {surface !== "shop" && activeThread.threadType !== "support" ? (
                  <Link
                    href="/booking/new"
                    className="inline-flex h-8 items-center rounded-lg bg-[#a3ff12] px-3 text-xs font-black text-[#050505] transition hover:bg-[#d7ffab]"
                  >
                    Book Now
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-[#a3ff12]/18 bg-[#a3ff12]/8 px-3 py-2 text-xs font-semibold text-[#d7ffab]">
              {getConversationContextLine(activeThread)}
            </div>
          </div>
        ) : null}
      </div>

      {activeThread ? (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 scroll-smooth sm:px-4">
            {messages.length ? messages.map((message) => (
              <div key={message.id} className={message.isOwn ? "flex justify-end" : "flex justify-start"}>
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
              </div>
            )) : (
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
            <p className="mt-1 text-sm leading-6 text-white/54">{copy.emptyThreadCopy}</p>
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
  onComposerChange,
  onSend,
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
  onComposerChange: (value: string) => void;
  onSend: () => void;
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
          sendPending={sendPending}
          surface={surface}
          threadError={threadError}
          onComposerChange={onComposerChange}
          onSend={onSend}
        />
      </div>
    </div>
  );
}

export function MessagingInboxScreen({
  surface,
  basePath,
  selectedThreadId,
  startSupportIntent = false,
  title,
  subtitle
}: {
  surface: MessagingSurface;
  basePath: string;
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
  const clientUsesModal = surface === "client";
  const [modalThreadId, setModalThreadId] = useState<string | null>(selectedThreadId ?? null);
  const [composerBody, setComposerBody] = useState("");
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [broadcastLocationId, setBroadcastLocationId] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<MessagingBroadcastAudience>("all");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [barberInboxTab, setBarberInboxTab] = useState<BarberInboxTab>("primary");
  const startersRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredSupportIntentRef = useRef(false);

  const available = threadsQuery.data?.available ?? false;
  const threads = useMemo(() => orderAndDedupeThreads(threadsQuery.data?.threads ?? []), [threadsQuery.data?.threads]);
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
  const activeThreadId = clientUsesModal ? modalThreadId ?? undefined : selectedThreadId ?? threads[0]?.id;
  const threadQuery = useMessageThreadQuery(activeThreadId);
  const sendMessageMutation = useSendMessageMutation(activeThreadId);
  const activeThread = threadQuery.data?.thread ?? null;
  const messages = threadQuery.data?.messages ?? [];
  const supportThread = useMemo(
    () => threads.find((thread) => thread.threadType === "support") ?? null,
    [threads]
  );
  const quickContacts = useMemo(
    () => buildQuickContacts(threads, uniqueAppointmentStarters, contactStarters),
    [contactStarters, threads, uniqueAppointmentStarters]
  );
  const activeThreadFilters = surface === "barber" ? barberThreadFilters : threadFilters;
  const displayedThreads = useMemo(
    () => surface === "barber"
      ? filterBarberThreads(threads, barberInboxTab, threadFilter, threadSearch)
      : filterThreads(threads, threadFilter, threadSearch),
    [barberInboxTab, surface, threadFilter, threadSearch, threads]
  );

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
        if (clientUsesModal) {
          setModalThreadId(threadPayload.thread.id);
        }
        router.push(`${basePath}/${threadPayload.thread.id}` as Route, { scroll: false });
      }
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to open the conversation.") });
    }
  }, [basePath, clientUsesModal, createThreadMutation, router]);

  const handleOpenThread = useCallback((threadId: string) => {
    if (clientUsesModal) {
      setComposerBody("");
      setModalThreadId(threadId);
      router.push(`${basePath}/${threadId}` as Route, { scroll: false });
    }
  }, [basePath, clientUsesModal, router]);

  const handleCloseThread = useCallback(() => {
    if (!clientUsesModal) {
      return;
    }

    setComposerBody("");
    setModalThreadId(null);
    router.push(basePath as Route, { scroll: false });
  }, [basePath, clientUsesModal, router]);

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

  async function handleSupportThread() {
    if (supportThread?.id) {
      handleOpenThread(supportThread.id);
      return;
    }

    await handleStartThread({ threadType: "support" }, "Support conversation ready.");
  }

  const handleNewMessage = () => {
    if (clientUsesModal) {
      void handleSupportThread();
      return;
    }

    startersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="relative isolate overflow-hidden rounded-lg border border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.10),transparent_28%),#050505] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] sm:p-4"
      data-testid={`messaging-inbox-${surface}`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(163,255,18,0.55),transparent)]" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-[#a3ff12]">{copy.shellLabel}</p>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl" data-display="true">{title}</h2>
          <p className="mt-1 max-w-xl truncate text-sm text-white/54">{subtitle}</p>
        </div>
        <Button
          className="h-10 rounded-lg px-4 normal-case tracking-normal"
          disabled={surface === "client" ? createThreadMutation.isPending : false}
          onClick={surface === "client" && !uniqueAppointmentStarters.length && !contactStarters.length ? () => void handleSupportThread() : handleNewMessage}
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          {createThreadMutation.isPending ? "Opening..." : "New Message"}
        </Button>
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
        <div className={clientUsesModal ? "mt-4" : "mt-4 grid gap-4 xl:grid-cols-[0.88fr_1.12fr]"}>
          <aside className={clientUsesModal ? "mx-auto w-full max-w-3xl space-y-3" : "min-w-0 space-y-3"}>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <SearchBar
                aria-label="Search messages"
                placeholder="Search"
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
                className="h-11 rounded-lg border-white/10 bg-white/[0.035] text-sm [&_input]:min-h-10"
              />
              <button
                type="button"
                className="hidden h-11 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/68 transition hover:border-[#a3ff12]/28 hover:text-white sm:inline-flex sm:items-center sm:justify-center"
                onClick={handleNewMessage}
              >
                New
              </button>
            </div>

            <ThreadStoryRail
              basePath={basePath}
              contacts={quickContacts}
              onNewMessage={handleNewMessage}
              onOpenThread={clientUsesModal ? handleOpenThread : undefined}
            />

            {surface === "barber" ? (
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/8 bg-white/[0.025] p-1">
                {barberInboxTabs.map((tab) => {
                  const active = barberInboxTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setBarberInboxTab(tab.key)}
                      className={[
                        "min-h-9 rounded-lg px-2 text-[11px] font-bold transition",
                        active ? "bg-[#a3ff12] text-[#050505]" : "text-white/62 hover:bg-white/[0.04] hover:text-white"
                      ].join(" ")}
                    >
                      {tab.label} <span className={active ? "text-black/58" : "text-white/36"}>{getBarberTabCount(tab.key, threads)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

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
              ) : displayedThreads.length ? displayedThreads.map((thread) => (
                <ThinThreadRow
                  key={thread.id}
                  thread={thread}
                  basePath={basePath}
                  active={thread.id === activeThreadId}
                  onOpen={clientUsesModal ? handleOpenThread : undefined}
                />
              )) : (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/58">
                  <p>{threads.length ? "No matching messages." : "No messages yet."}</p>
                </div>
              )}
            </div>

            {surface !== "client" ? (
              <div ref={startersRef} className="rounded-lg border border-white/8 bg-white/[0.025] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-[#a3ff12]">{copy.starterTitle}</p>
                  <p className="mt-1 text-xs text-white/48">{copy.starterCopy}</p>
                </div>
                <MessageSquareText className="h-4 w-4 text-[#d7ffab]" aria-hidden="true" />
              </div>
              <div className="mt-3 space-y-2">
                {uniqueAppointmentStarters.map((starter) => (
                  <div key={starter.appointmentId} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/24 p-3">
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
                  <div key={`${starter.threadType}-${starter.locationId}-${starter.profileId}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/24 p-3">
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

            {surface === "shop" ? (
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

          {!clientUsesModal ? (
            <ConversationPanel
              activeThread={activeThread}
              activeThreadId={activeThreadId}
              basePath={basePath}
              copy={copy}
              composerBody={composerBody}
              isLoading={threadQuery.isLoading}
              messages={messages}
              selectedThreadId={selectedThreadId}
              sendPending={sendMessageMutation.isPending}
              surface={surface}
              threadError={threadQuery.error}
              onComposerChange={setComposerBody}
              onSend={() => void handleSendMessage()}
            />
          ) : null}
        </div>
      ) : null}

      {available && clientUsesModal ? (
        <ConversationModal
          activeThread={activeThread}
          activeThreadId={activeThreadId}
          basePath={basePath}
          copy={copy}
          composerBody={composerBody}
          isLoading={threadQuery.isLoading}
          messages={messages}
          sendPending={sendMessageMutation.isPending}
          surface={surface}
          threadError={threadQuery.error}
          onClose={handleCloseThread}
          onComposerChange={setComposerBody}
          onSend={() => void handleSendMessage()}
        />
      ) : null}
    </div>
  );
}
