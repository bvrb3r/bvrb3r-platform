"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageSquareText, RadioTower, Send, ShieldCheck } from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterChip, PageHeader, SearchBar, StatusBadge } from "@/design/components";
import {
  useCreateMessageThreadMutation,
  useMessageThreadQuery,
  useMessageThreadsQuery,
  useSendMessageBroadcastMutation,
  useSendMessageMutation
} from "@/lib/messages/client";
import type { MessagingBroadcastAudience, MessagingCreateThreadInput } from "@/lib/messages/service";

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

function ThreadSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-3 h-4 w-24" />
    </div>
  );
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function getSurfaceCopy(surface: "client" | "barber" | "shop") {
  if (surface === "shop") {
    return {
      shellLabel: "Shop communication",
      participantCopy: "Shop conversations stay tied to assigned locations, real participants, and the existing thread system.",
      inboxCopy: "Client, barber, and broadcast threads stay inside assigned shop scope.",
      starterTitle: "Direct lines",
      starterCopy: "Open a direct shop thread with a real client or barber already connected to this location.",
      composerPlaceholder: "Send a clear operational message to the current conversation.",
      emptyThreadCopy: "Select a conversation to respond, or open a new shop thread from the location starters below.",
      broadcastTitle: "Shop broadcast",
      broadcastCopy: "Broadcasts reuse the same canonical thread system by delivering into client-shop and barber-shop conversations."
    };
  }

  if (surface === "barber") {
    return {
      shellLabel: "Chair communication",
      participantCopy: "Barber messaging stays scoped to appointment threads and shop relationships you already own.",
      inboxCopy: "Appointment-linked conversations first, with direct shop contact available from real chair history.",
      starterTitle: "Thread starters",
      starterCopy: "Open new appointment-linked or shop-linked threads only from relationships already grounded in the platform.",
      composerPlaceholder: "Reply with clear appointment guidance for the client or shop.",
      emptyThreadCopy: "Select a conversation to read the context and send a message, or start a new thread from an eligible appointment or shop below.",
      broadcastTitle: "",
      broadcastCopy: ""
    };
  }

  return {
    shellLabel: "Messages",
    participantCopy: "Client messaging stays tied to real barber, shop, and support relationships only.",
    inboxCopy: "Appointment-linked conversations stay first, with shop contact and support available when you need help.",
    starterTitle: "Thread starters",
    starterCopy: "Open a real appointment or shop thread, or start a support conversation when you need help from BVRB3R.",
    composerPlaceholder: "Ask your barber, the shop, or support about the appointment, timing, payment, or visit details.",
    emptyThreadCopy: "Select a conversation to read the appointment or support context and send a message, or start one below.",
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

  if (role === "commission_barber" || role === "booth_rent_barber") {
    return "Barber";
  }

  if (role === "client") {
    return "Client";
  }

  return null;
}

type ThreadFilter = "all" | "barbers" | "shops" | "support" | "other";

const threadFilters: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "barbers", label: "Barbers" },
  { key: "shops", label: "Shops" },
  { key: "support", label: "Support" },
  { key: "other", label: "Other" }
];

function getThreadFilter(role?: string | null, threadType?: string): ThreadFilter {
  if (threadType === "support" || role === "platform_admin") {
    return "support";
  }

  if (role === "owner" || role === "manager" || role === "front_desk") {
    return "shops";
  }

  if (role === "commission_barber" || role === "booth_rent_barber") {
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

export function MessagingInboxScreen({
  surface,
  basePath,
  selectedThreadId,
  startSupportIntent = false,
  title,
  subtitle
}: {
  surface: "client" | "barber" | "shop";
  basePath: string;
  selectedThreadId?: string;
  startSupportIntent?: boolean;
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const copy = getSurfaceCopy(surface);
  const isShopSurface = surface === "shop";
  const threadsQuery = useMessageThreadsQuery();
  const createThreadMutation = useCreateMessageThreadMutation();
  const broadcastMutation = useSendMessageBroadcastMutation();
  const activeThreadId = selectedThreadId ?? threadsQuery.data?.threads[0]?.id;
  const threadQuery = useMessageThreadQuery(activeThreadId);
  const sendMessageMutation = useSendMessageMutation(activeThreadId);
  const [composerBody, setComposerBody] = useState("");
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [broadcastLocationId, setBroadcastLocationId] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<MessagingBroadcastAudience>("all");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const hasTriggeredSupportIntentRef = useRef(false);

  const available = threadsQuery.data?.available ?? false;
  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data?.threads]);
  const appointmentStarters = threadsQuery.data?.eligibleAppointments ?? [];
  const contactStarters = threadsQuery.data?.eligibleContacts ?? [];
  const broadcastTargets = useMemo(() => threadsQuery.data?.broadcastTargets ?? [], [threadsQuery.data?.broadcastTargets]);
  const activeThread = threadQuery.data?.thread ?? null;
  const messages = threadQuery.data?.messages ?? [];
  const supportThread = useMemo(
    () => threads.find((thread) => thread.threadType === "support") ?? null,
    [threads]
  );
  const displayedThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();

    return threads.filter((thread) => {
      const filterKey = getThreadFilter(thread.counterpart?.role, thread.threadType);
      const matchesFilter = threadFilter === "all" || filterKey === threadFilter;
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

      return matchesFilter && (!query || searchable.includes(query));
    });
  }, [threadFilter, threadSearch, threads]);
  const participantSummary = useMemo(
    () =>
      activeThread?.participants
        .filter((participant) => !participant.isSelf)
        .map((participant) => participant.fullName)
        .join(", ") ?? "",
    [activeThread]
  );

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
        router.push(`${basePath}/${threadPayload.thread.id}` as Route);
      }
    } catch (error) {
      setStatusUpdate({ tone: "error", message: readableError(error, "Unable to open the conversation.") });
    }
  }, [basePath, createThreadMutation, router]);

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
    await handleStartThread({ threadType: "support" }, "Support conversation ready.");
  }

  return (
    <div className="space-y-4" data-testid={`messaging-inbox-${surface}`}>
      <Card className="rounded-[32px] p-6">
        <PageHeader
          label={copy.shellLabel}
          title={title}
          subtitle={subtitle}
          action={
            surface === "client" ? (
              <Button
                className="h-12 px-5"
                disabled={createThreadMutation.isPending}
                onClick={() => void handleSupportThread()}
              >
                <MessageSquareText className="h-4 w-4" />
                {createThreadMutation.isPending ? "Opening..." : "New message"}
              </Button>
            ) : (
              <StatusBadge>
                <ShieldCheck className="h-3.5 w-3.5" />
                Participant-only
              </StatusBadge>
            )
          }
        />
        <div className="mt-5 space-y-3">
          {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
          {threadsQuery.error ? <FeedbackBanner tone="error" message={readableError(threadsQuery.error, "Unable to load the messaging inbox.")} /> : null}
        </div>
      </Card>

      {!available ? (
        <Card className="rounded-[28px] p-6">
          <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
            Messaging becomes available when the app is connected to the live Supabase environment with profile-backed threads and appointment data.
          </div>
        </Card>
      ) : null}

      {available ? (
        <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-4">
            <Card className="rounded-[32px] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="surface-label">Inbox</p>
                  <p className="mt-2 text-sm text-white/58">{copy.inboxCopy}</p>
                </div>
                <span className="status-pill text-[#d7ffab]">{threads.length} threads</span>
              </div>
              <div className="mt-5 space-y-4">
                <SearchBar
                  aria-label="Search messages"
                  placeholder="Search messages"
                  value={threadSearch}
                  onChange={(event) => setThreadSearch(event.target.value)}
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {threadFilters.map((filter) => (
                    <FilterChip
                      key={filter.key}
                      type="button"
                      active={threadFilter === filter.key}
                      onClick={() => setThreadFilter(filter.key)}
                    >
                      {filter.label}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {threadsQuery.isLoading && !threadsQuery.data ? (
                  <>
                    <ThreadSkeleton />
                    <ThreadSkeleton />
                    <ThreadSkeleton />
                  </>
                ) : displayedThreads.length ? displayedThreads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  const roleBadgeLabel = getRoleBadgeLabel(thread.counterpart?.role, thread.threadType);
                  const contextDetail = thread.appointmentContext?.serviceName
                    ? `${thread.appointmentContext.serviceName} | ${thread.appointmentContext.statusLabel}`
                    : getThreadStatusLabel(thread.threadType);
                  const displayName = thread.counterpart?.fullName ?? "Conversation";

                  return (
                    <Link
                      key={thread.id}
                      href={`${basePath}/${thread.id}` as Route}
                      className={[
                        "block rounded-[24px] border p-4 transition",
                        isActive
                          ? "border-[#7CFF00]/24 bg-[linear-gradient(135deg,rgba(124,255,0,0.12),rgba(10,10,10,0.96))]"
                          : "border-white/8 bg-black/20 hover:border-[#7CFF00]/18 hover:bg-black/30"
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(12,12,12,0.96))] text-sm font-semibold text-[#d7ffab]">
                            {getInitials(displayName)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-semibold text-white">{displayName}</p>
                              {roleBadgeLabel ? (
                                <span className="rounded-full border border-white/10 bg-black/22 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#d7ffab]">
                                  {roleBadgeLabel}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-white/55">{contextDetail}</p>
                          </div>
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">
                          {formatThreadTime(thread.lastMessage?.createdAt ?? thread.updatedAt)}
                        </p>
                      </div>
                      <p className="mt-3 text-sm text-white/62">
                        {thread.appointmentContext?.locationLabel ?? thread.locationContext?.locationLabel ?? "Conversation"}
                      </p>
                      <p className="mt-2 text-sm text-white/58">
                        {thread.lastMessage?.body ?? "No messages yet."}
                      </p>
                    </Link>
                  );
                }) : (
                  <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                    <p>{threads.length ? "No matching messages." : "No messages yet."}</p>
                    {surface === "client" ? (
                      <div className="mt-4">
                        <Button
                          className="h-10 px-4"
                          disabled={createThreadMutation.isPending}
                          onClick={() => void handleSupportThread()}
                        >
                          {createThreadMutation.isPending ? "Opening..." : "Start a support message"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </Card>

            <Card className="rounded-[32px] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="surface-label">{copy.starterTitle}</p>
                  <p className="mt-2 text-sm text-white/58">{copy.starterCopy}</p>
                </div>
                <MessageSquareText className="h-5 w-5 text-[#baff69]" />
              </div>
              <div className="mt-5 space-y-3">
                {surface === "client" ? (
                  <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(10,10,10,0.94))] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-white">BVRB3R Support</p>
                        <p className="mt-2 text-sm leading-7 text-white/60">
                          Start a support message for booking, payment, or account help without leaving the client lane.
                        </p>
                      </div>
                      <Button
                        className="h-10 px-4"
                        disabled={createThreadMutation.isPending}
                        onClick={() => void handleSupportThread()}
                      >
                        {createThreadMutation.isPending ? "Opening..." : "Message Support"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {appointmentStarters.map((starter) => (
                  <div key={starter.appointmentId} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-white">{starter.counterpart.fullName}</p>
                        <p className="mt-1 text-sm text-white/56">{starter.appointmentContext.serviceName} | {starter.appointmentContext.statusLabel}</p>
                      </div>
                      <Button
                        className="h-10 px-4"
                        disabled={createThreadMutation.isPending}
                        onClick={() =>
                          void handleStartThread(
                            { appointmentId: starter.appointmentId },
                            "Appointment conversation ready."
                          )
                        }
                      >
                        {createThreadMutation.isPending ? "Opening..." : "Open thread"}
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-white/58">{starter.appointmentContext.locationLabel}</p>
                    <p className="mt-2 text-sm text-white/58">{formatThreadTime(starter.appointmentContext.startsAt)}</p>
                  </div>
                ))}

                {contactStarters.map((starter) => (
                  <div key={`${starter.threadType}-${starter.locationId}-${starter.profileId}`} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-white">{starter.fullName}</p>
                        <p className="mt-1 text-sm text-white/56">
                          {starter.threadType === "client_shop" ? "Shop support line" : "Shop-team collaboration"}
                        </p>
                      </div>
                      <Button
                        className="h-10 px-4"
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
                        {createThreadMutation.isPending ? "Opening..." : "Open thread"}
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-white/58">{starter.locationLabel}</p>
                    {starter.appointmentContext ? (
                      <p className="mt-2 text-sm text-white/58">
                        {starter.appointmentContext.serviceName} | {formatThreadTime(starter.appointmentContext.startsAt)}
                      </p>
                    ) : null}
                  </div>
                ))}

                {!appointmentStarters.length && !contactStarters.length ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                    {surface === "client"
                      ? "No additional thread starters are available right now."
                      : "No additional thread starters are available right now."}
                  </div>
                ) : null}
              </div>
            </Card>

            {isShopSurface ? (
              <Card className="rounded-[32px] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="surface-label">{copy.broadcastTitle}</p>
                    <p className="mt-2 text-sm text-white/58">{copy.broadcastCopy}</p>
                  </div>
                  <RadioTower className="h-5 w-5 text-[#d7ffab]" />
                </div>
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <select
                      className="h-12 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
                      value={broadcastLocationId}
                      onChange={(event) => setBroadcastLocationId(event.target.value)}
                    >
                      <option value="">Choose location</option>
                      {broadcastTargets.map((target) => (
                        <option key={target.locationId} value={target.locationId}>{target.locationLabel}</option>
                      ))}
                    </select>
                    <select
                      className="h-12 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
                      value={broadcastAudience}
                      onChange={(event) => setBroadcastAudience(event.target.value as MessagingBroadcastAudience)}
                    >
                      <option value="all">Clients and barbers</option>
                      <option value="clients">Clients only</option>
                      <option value="barbers">Barbers only</option>
                    </select>
                    <div className="rounded-[18px] border border-white/10 bg-black/18 px-4 py-3 text-sm text-white/68">
                      {broadcastTargets.find((target) => target.locationId === broadcastLocationId)
                        ? `${broadcastTargets.find((target) => target.locationId === broadcastLocationId)?.clientCount ?? 0} clients | ${broadcastTargets.find((target) => target.locationId === broadcastLocationId)?.barberCount ?? 0} barbers`
                        : "Choose a location to see audience counts."}
                    </div>
                  </div>

                  <textarea
                    value={broadcastBody}
                    onChange={(event) => setBroadcastBody(event.target.value)}
                    rows={4}
                    className="w-full rounded-[20px] border border-white/10 bg-[#090909] px-4 py-3 text-sm text-white outline-none transition focus:border-[#7CFF00]/28"
                    placeholder="Send a shop-wide update about arrivals, changes, chair readiness, or guest communication."
                  />

                  <div className="flex justify-end">
                    <Button
                      className="h-11 px-4"
                      disabled={broadcastMutation.isPending || !broadcastLocationId || !broadcastBody.trim()}
                      onClick={() => void handleBroadcast()}
                    >
                      <RadioTower className="mr-2 h-4 w-4" />
                      {broadcastMutation.isPending ? "Sending..." : "Send broadcast"}
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}
          </div>

          <Card className="rounded-[32px] p-6">
            {selectedThreadId ? (
              <Link href={basePath as Route} className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/56 transition hover:text-[#d7ffab] xl:hidden">
                <ArrowLeft className="h-4 w-4" />
                Back to inbox
              </Link>
            ) : null}
            {threadQuery.error ? (
              <FeedbackBanner tone="error" message={readableError(threadQuery.error, "Unable to load the selected conversation.")} />
            ) : null}
            {threadQuery.isLoading && activeThreadId ? (
              <div className="space-y-3">
                <ThreadSkeleton />
                <ThreadSkeleton />
                <ThreadSkeleton />
              </div>
            ) : activeThread ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(10,10,10,0.94))] p-5">
                  <p className="surface-label text-[#d7ffab]">Conversation</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(12,12,12,0.96))] text-sm font-semibold text-[#d7ffab]">
                      {getInitials(participantSummary || activeThread.counterpart?.fullName || "Conversation")}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-semibold text-white">{participantSummary || activeThread.counterpart?.fullName || "Conversation"}</h3>
                        {getRoleBadgeLabel(activeThread.counterpart?.role, activeThread.threadType) ? (
                          <span className="rounded-full border border-white/10 bg-black/22 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#d7ffab]">
                            {getRoleBadgeLabel(activeThread.counterpart?.role, activeThread.threadType)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-white/60">
                    {activeThread.appointmentContext
                      ? `${activeThread.appointmentContext.serviceName} | ${activeThread.appointmentContext.locationLabel}`
                      : activeThread.threadType === "support"
                        ? "Support conversation for account, booking, or payment help."
                        : activeThread.locationContext?.locationLabel ?? "Thread stays limited to its participants only."}
                  </p>
                  {activeThread.appointmentContext ? (
                    <p className="mt-3 text-sm text-white/58">
                      {activeThread.appointmentContext.statusLabel} | {formatThreadTime(activeThread.appointmentContext.startsAt)}
                      {activeThread.appointmentContext.confirmationCode ? ` | ${activeThread.appointmentContext.confirmationCode}` : ""}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {messages.length ? messages.map((message) => (
                    <div key={message.id} className={message.isOwn ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={[
                          "max-w-[88%] rounded-[22px] border px-4 py-3 text-sm leading-6",
                          message.messageType === "system"
                            ? "border-white/8 bg-black/20 text-white/58"
                            : message.isOwn
                              ? "border-[#7CFF00]/24 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(12,12,12,0.96))] text-white"
                              : "border-white/8 bg-black/24 text-white/82"
                        ].join(" ")}
                      >
                        <p>{message.body}</p>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
                          {message.messageType === "system" ? "System" : message.senderName ?? "Participant"} | {formatThreadTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                      No messages yet.
                    </div>
                  )}
                </div>

                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <label className="surface-label" htmlFor="message-composer">Reply</label>
                  <textarea
                    id="message-composer"
                    value={composerBody}
                    onChange={(event) => setComposerBody(event.target.value)}
                    rows={4}
                    className="mt-3 w-full rounded-[20px] border border-white/10 bg-[#090909] px-4 py-3 text-sm text-white outline-none transition focus:border-[#7CFF00]/28"
                    placeholder={copy.composerPlaceholder}
                  />
                  <div className="mt-4 flex justify-end">
                    <Button className="h-11 px-4" disabled={sendMessageMutation.isPending || !composerBody.trim()} onClick={() => void handleSendMessage()}>
                      <Send className="mr-2 h-4 w-4" />
                      {sendMessageMutation.isPending ? "Sending..." : "Send message"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                {copy.emptyThreadCopy}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
