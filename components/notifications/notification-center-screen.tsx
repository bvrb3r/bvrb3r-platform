"use client";

import {
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UsersRound,
  Wifi
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import {
  defaultNotificationChannelPreferences,
  groupNotificationDate,
  notificationCategories,
  notificationChannels,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationChannelPreferences
} from "@/lib/notifications/domain";
import type { NotificationCenterPayload } from "@/lib/notifications/service";

type PreferenceState = {
  channelPreferences: NotificationChannelPreferences;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimezone: string;
  marketingBarberEnabled: boolean;
  marketingPlatformEnabled: boolean;
};

const categoryCopy: Record<NotificationCategory, {
  filter: string;
  label: string;
  helper: string;
  color: string;
}> = {
  booking: {
    filter: "Bookings",
    label: "Appointment reminders",
    helper: "Upcoming slots, changes, and cancellations",
    color: "#9BE15D"
  },
  queue: {
    filter: "Queue",
    label: "Waitlist & open slots",
    helper: "Time-critical chair and availability updates",
    color: "#C4F24E"
  },
  money: {
    filter: "Money",
    label: "Money records",
    helper: "Receipts, payment failures, and payout truth",
    color: "#C9A87C"
  },
  culture: {
    filter: "Culture",
    label: "Culture & social",
    helper: "New work from barbers you follow",
    color: "#C78CFF"
  },
  team: {
    filter: "Team",
    label: "Messages & team",
    helper: "From barbers, shops, teammates, and support",
    color: "#7FB5FF"
  },
  system: {
    filter: "System",
    label: "Account & system",
    helper: "Security, devices, and service status",
    color: "#F5F1E8"
  }
};

function categoryIcon(category: NotificationCategory) {
  if (category === "booking") return <CalendarDays className="h-4 w-4" />;
  if (category === "queue") return <Wifi className="h-4 w-4" />;
  if (category === "money") return <CircleDollarSign className="h-4 w-4" />;
  if (category === "culture") return <Sparkles className="h-4 w-4" />;
  if (category === "team") return <UsersRound className="h-4 w-4" />;
  return <ShieldCheck className="h-4 w-4" />;
}

function formatNotificationTime(value: string | null) {
  if (!value) {
    return "TIME PENDING";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value)).toUpperCase();
}

function ChannelToggle({
  category,
  channel,
  checked,
  locked,
  onChange
}: {
  category: NotificationCategory;
  channel: NotificationChannel;
  checked: boolean;
  locked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const label = `${categoryCopy[category].label} ${channel}`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={locked ? `${label}, required while you are active in queue` : label}
      disabled={locked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full border transition ${
        checked
          ? "border-[#D9B461]/60 bg-[#D9B461]"
          : "border-white/15 bg-white/[0.06]"
      } disabled:cursor-not-allowed disabled:opacity-100`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-[#08090A] transition ${
          checked ? "left-[22px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

export function NotificationCenterScreen({
  initial,
  roleLabel = "Client"
}: {
  initial: NotificationCenterPayload;
  roleLabel?: string;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState(initial);
  const [activeView, setActiveView] = useState<"center" | "preferences">("center");
  const [filter, setFilter] = useState<"all" | NotificationCategory>("all");
  const [saving, setSaving] = useState(false);
  const [pushPermissionOff, setPushPermissionOff] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [preferences, setPreferences] = useState<PreferenceState>({
    channelPreferences: initial.preferences?.channelPreferences
      ?? defaultNotificationChannelPreferences,
    quietHoursEnabled: initial.preferences?.quietHoursEnabled ?? true,
    quietHoursStart: initial.preferences?.quietHoursStart ?? "22:00",
    quietHoursEnd: initial.preferences?.quietHoursEnd ?? "08:00",
    quietHoursTimezone: initial.preferences?.quietHoursTimezone ?? "America/New_York",
    marketingBarberEnabled: initial.preferences?.marketingBarberEnabled ?? false,
    marketingPlatformEnabled: initial.preferences?.marketingPlatformEnabled ?? false
  });

  useEffect(() => {
    setPushPermissionOff(
      typeof Notification !== "undefined" && Notification.permission !== "granted"
    );
  }, []);

  const unread = payload.items.filter((item) => item.unread).length;
  const visibleItems = useMemo(
    () => payload.items.filter((item) => filter === "all" || item.category === filter),
    [filter, payload.items]
  );
  const groups = useMemo(
    () => ([
      ["today", "Today"],
      ["earlier", "Earlier"]
    ] as const).map(([key, label]) => ({
      key,
      label,
      items: visibleItems.filter((item) => groupNotificationDate(item.createdAt) === key)
    })),
    [visibleItems]
  );

  async function refresh(options: { clearFeedback?: boolean } = {}) {
    if (options.clearFeedback !== false) {
      setFeedback(null);
    }
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const body = await response.json() as NotificationCenterPayload & { error?: string };
    if (!response.ok) {
      setFeedback({ tone: "error", message: body.error ?? "Unable to refresh notifications." });
      return false;
    }
    setPayload(body);
    setPreferences((current) => ({
      ...current,
      channelPreferences: body.preferences?.channelPreferences ?? current.channelPreferences
    }));
    return true;
  }

  async function markRead(notificationId?: string) {
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notificationId ? { notificationId } : {})
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      setFeedback({ tone: "error", message: body?.error ?? "Unable to update read state." });
      return false;
    }
    setPayload((current) => ({
      ...current,
      items: current.items.map((item) => (
        !notificationId || item.id === notificationId
          ? { ...item, unread: false, readAt: new Date().toISOString() }
          : item
      ))
    }));
    return true;
  }

  async function openNotification(item: NotificationCenterPayload["items"][number]) {
    await markRead(item.id);
    if (item.deepLink) {
      router.push(item.deepLink);
    }
  }

  function updateChannel(
    category: NotificationCategory,
    channel: NotificationChannel,
    checked: boolean
  ) {
    setPreferences((current) => ({
      ...current,
      channelPreferences: {
        ...current.channelPreferences,
        [category]: {
          ...current.channelPreferences[category],
          [channel]: checked
        }
      }
    }));
  }

  async function savePreferences() {
    setSaving(true);
    setFeedback(null);
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_preferences: preferences.channelPreferences,
        quiet_hours_enabled: preferences.quietHoursEnabled,
        quiet_hours_start: preferences.quietHoursStart,
        quiet_hours_end: preferences.quietHoursEnd,
        quiet_hours_timezone: preferences.quietHoursTimezone,
        marketing_barber_enabled: preferences.marketingBarberEnabled,
        marketing_platform_enabled: preferences.marketingPlatformEnabled,
        push_enabled: notificationCategories.some(
          (category) => preferences.channelPreferences[category].push
        ),
        sms_enabled: notificationCategories.some(
          (category) => preferences.channelPreferences[category].sms
        ),
        email_enabled: notificationCategories.some(
          (category) => preferences.channelPreferences[category].email
        )
      })
    });
    const body = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setFeedback({ tone: "error", message: body.error ?? "Unable to save notification preferences." });
      return;
    }
    const refreshed = await refresh({ clearFeedback: false });
    if (refreshed) {
      setFeedback({
        tone: "success",
        message: "Notification preferences saved. Protected booking, money, and active-queue truth remains on."
      });
    }
  }

  return (
    <main
      className="min-h-screen bg-[#060708] px-4 pb-16 text-[#F5F1E8] sm:px-6"
      data-testid="notification-center"
    >
      <header className="mx-auto flex max-w-[860px] items-center justify-between border-b border-white/10 py-4">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-left font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/48"
        >
          <span className="text-white">BVRB3R</span> / Notifications
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#C4F24E]/45 bg-[#C4F24E] px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-black">
            {roleLabel}
          </span>
          <button
            type="button"
            aria-label="Notification preferences"
            onClick={() => setActiveView(activeView === "center" ? "preferences" : "center")}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/12 text-white/65 transition hover:border-[#C4F24E]/50 hover:text-[#C4F24E]"
          >
            {activeView === "center"
              ? <Settings2 className="h-4 w-4" />
              : <BellRing className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className={`mx-auto ${activeView === "center" ? "max-w-[860px]" : "max-w-[640px]"}`}>
        {feedback ? (
          <div className="mt-5">
            <FeedbackBanner tone={feedback.tone} message={feedback.message} />
          </div>
        ) : null}

        {activeView === "center" ? (
          <>
            <section className="pb-7 pt-10 sm:pt-14">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#C4F24E]">
                    Notification Center
                  </p>
                  <h1 className="mt-3 font-serif text-[46px] leading-none tracking-[-0.02em] sm:text-[58px]">
                    What moved<span className="text-[#C4F24E]">.</span>
                  </h1>
                  <p className="mt-4 text-sm text-white/50">
                    {unread
                      ? `${unread} unread ${unread === 1 ? "update" : "updates"} — each linked to the exact record.`
                      : "You’re fully caught up."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!unread}
                  onClick={() => void markRead()}
                  className="rounded-full border border-white/15 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/65 transition hover:border-[#C4F24E]/50 hover:text-[#C4F24E] disabled:cursor-default disabled:opacity-45"
                >
                  {unread ? "Mark all read" : "All read ✓"}
                </button>
              </div>

              {pushPermissionOff ? (
                <button
                  type="button"
                  onClick={() => router.push("/notifications/push-permission")}
                  className="mt-7 flex w-full items-center gap-4 rounded-2xl border border-[#D9B461]/30 bg-[#D9B461]/[0.07] p-4 text-left"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#D9B461]/35 text-[#D9B461]">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Push is off on this device</span>
                    <span className="mt-1 block font-mono text-[10px] text-white/42">
                      Open Push Permission to restore time-critical alerts.
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#D9B461]" />
                </button>
              ) : null}
            </section>

            <nav className="flex gap-2 overflow-x-auto border-y border-white/10 py-3" aria-label="Notification filters">
              {(["all", ...notificationCategories] as const).map((key) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`shrink-0 rounded-full px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] transition ${
                    filter === key
                      ? "bg-[#F5F1E8] text-[#08090A]"
                      : "border border-white/10 text-white/42 hover:text-white"
                  }`}
                >
                  {key === "all" ? "All" : categoryCopy[key].filter}
                </button>
              ))}
            </nav>

            <section className="py-7">
              {visibleItems.length ? groups.map((group) => (
                group.items.length ? (
                  <div key={group.key} className="mb-9 last:mb-0">
                    <p className="mb-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                      {group.label}
                    </p>
                    <div className="divide-y divide-white/10 border-y border-white/10">
                      {group.items.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => void openNotification(item)}
                          className="group flex w-full items-start gap-4 py-5 text-left"
                        >
                          <span
                            className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border"
                            style={{
                              color: categoryCopy[item.category].color,
                              borderColor: `${categoryCopy[item.category].color}55`
                            }}
                          >
                            {categoryIcon(item.category)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span
                                className="rounded-full border px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.13em]"
                                style={{
                                  color: categoryCopy[item.category].color,
                                  borderColor: `${categoryCopy[item.category].color}55`
                                }}
                              >
                                {categoryCopy[item.category].filter}
                              </span>
                              {item.operational ? (
                                <span className="font-mono text-[8px] uppercase tracking-[0.13em] text-[#D9B461]">
                                  Protected
                                </span>
                              ) : null}
                            </span>
                            <span className={`mt-2 block text-[15px] ${item.unread ? "font-semibold text-white" : "text-white/65"}`}>
                              {item.title}
                            </span>
                            <span className="mt-1 block text-sm leading-6 text-white/43">{item.body}</span>
                            <span className="mt-2 block font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                              {formatNotificationTime(item.createdAt)} · {item.channel.replaceAll("_", " ")}
                            </span>
                          </span>
                          <span className="flex items-center gap-3 pt-2">
                            {item.unread ? <span className="h-2 w-2 rounded-full bg-[#C4F24E]" /> : null}
                            {item.deepLink ? (
                              <ChevronRight className="h-4 w-4 text-white/22 transition group-hover:text-[#C4F24E]" />
                            ) : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null
              )) : (
                <div className="rounded-3xl border border-white/10 px-6 py-14 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/12 text-white/42">
                    <Check className="h-5 w-5" />
                  </span>
                  <h2 className="mt-5 font-serif text-[32px]">
                    All quiet<span className="text-[#C4F24E]">.</span>
                  </h2>
                  <p className="mt-2 font-mono text-[10px] leading-5 text-white/42">
                    Nothing in this filter — you’re fully caught up.
                  </p>
                </div>
              )}
            </section>

            <section className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-white/42">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Smart digest</span>
                <span className="mt-1 block font-mono text-[10px] leading-5 text-white/42">
                  One morning summary instead of ten pings — your day, briefed
                </span>
              </span>
              <span className="rounded-full border border-white/10 px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/35">
                Still being built
              </span>
            </section>
            <p className="mt-7 font-mono text-[9px] leading-5 text-white/30">
              Money and booking alerts can’t be muted — they’re system truth · everything else is tunable in Notification Preferences.
            </p>
          </>
        ) : (
          <section className="pb-12 pt-10 sm:pt-14">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#D9B461]">
              Notification Preferences
            </p>
            <h1 className="mt-3 font-serif text-[44px] leading-none tracking-[-0.02em] sm:text-[52px]">
              Your signal<span className="text-[#D9B461]">.</span>
            </h1>
            <p className="mt-4 text-sm leading-6 text-white/48">
              Choose where each kind of update reaches you. System truth remains protected.
            </p>

            <div className="mt-8 rounded-2xl border border-[#D9B461]/30 bg-[#D9B461]/[0.07] p-5">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#D9B461]" />
                <div>
                  <p className="text-sm font-semibold text-[#F5F1E8]">Always on</p>
                  <p className="mt-2 text-xs leading-6 text-white/48">
                    Booking confirmations, barber cancellations, payment failures, and active-queue “you’re up” messages are protected operational truth.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center border-b border-white/10 pb-3">
                <span className="flex-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">Alert type</span>
                {notificationChannels.map((channel) => (
                  <span key={channel} className="w-[58px] text-center font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white/38">
                    {channel}
                  </span>
                ))}
              </div>
              <div className="divide-y divide-white/10">
                {notificationCategories.map((category) => (
                  <div key={category} className="flex items-center py-4">
                    <span className="min-w-0 flex-1 pr-3">
                      <span className="block text-[13.5px] font-semibold">{categoryCopy[category].label}</span>
                      <span className="mt-1 block text-[11px] leading-5 text-white/43">{categoryCopy[category].helper}</span>
                      {category === "queue" && payload.activeQueueSmsLocked ? (
                        <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.11em] text-[#C4F24E]">
                          SMS locked on while active in queue
                        </span>
                      ) : null}
                    </span>
                    {notificationChannels.map((channel) => {
                      const locked = category === "queue"
                        && channel === "sms"
                        && payload.activeQueueSmsLocked;
                      return (
                        <span key={channel} className="flex w-[58px] justify-center">
                          <ChannelToggle
                            category={category}
                            channel={channel}
                            checked={preferences.channelPreferences[category][channel]}
                            locked={locked}
                            onChange={(checked) => updateChannel(category, channel, checked)}
                          />
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Quiet hours</p>
                  <p className="mt-1 text-[11px] text-white/43">Non-operational alerts wait. Urgent truth still arrives.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.quietHoursEnabled}
                  onClick={() => setPreferences((current) => ({
                    ...current,
                    quietHoursEnabled: !current.quietHoursEnabled
                  }))}
                  className={`relative h-6 w-11 rounded-full border transition ${
                    preferences.quietHoursEnabled
                      ? "border-[#D9B461]/60 bg-[#D9B461]"
                      : "border-white/15 bg-white/[0.06]"
                  }`}
                >
                  <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-[#08090A] transition ${
                    preferences.quietHoursEnabled ? "left-[22px]" : "left-[3px]"
                  }`} />
                </button>
              </div>
              {preferences.quietHoursEnabled ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">Start</label>
                    <Input
                      type="time"
                      value={preferences.quietHoursStart}
                      onChange={(event) => setPreferences((current) => ({
                        ...current,
                        quietHoursStart: event.target.value
                      }))}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">End</label>
                    <Input
                      type="time"
                      value={preferences.quietHoursEnd}
                      onChange={(event) => setPreferences((current) => ({
                        ...current,
                        quietHoursEnd: event.target.value
                      }))}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-8 border-y border-white/10 py-2">
              {([
                ["marketingBarberEnabled", "Offers from your barbers & shops", "Rebook invites, open slots, and promos only from people you’ve booked"],
                ["marketingPlatformEnabled", "BVRB3R news", "Product updates, local culture, and platform announcements"]
              ] as const).map(([key, label, helper]) => (
                <button
                  type="button"
                  key={key}
                  role="switch"
                  aria-checked={preferences[key]}
                  onClick={() => setPreferences((current) => ({ ...current, [key]: !current[key] }))}
                  className="flex w-full items-center gap-4 border-b border-white/10 py-4 text-left last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold">{label}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-white/43">{helper}</span>
                  </span>
                  <span className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
                    preferences[key]
                      ? "border-[#D9B461]/60 bg-[#D9B461]"
                      : "border-white/15 bg-white/[0.06]"
                  }`}>
                    <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-[#08090A] transition ${
                      preferences[key] ? "left-[22px]" : "left-[3px]"
                    }`} />
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-6 font-mono text-[9px] leading-5 text-white/32">
              Reply <strong className="text-white/65">STOP</strong> to any SMS and that sender is cut off instantly — confirmed by text, honored everywhere, no exceptions.
            </p>

            <Button className="mt-8 w-full" disabled={saving} onClick={() => void savePreferences()}>
              {saving ? "Saving evidence…" : "Save preferences"}
            </Button>

            <aside
              aria-label="Notification tools still being built"
              className="mt-6 overflow-hidden rounded-[18px] border border-white/14 bg-[#101013]"
            >
              <div className="flex items-center gap-4 p-4">
                <span className="h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(196,242,78,0.14),rgba(217,180,97,0.1))]" />
                <span>
                  <span className="block text-sm font-semibold text-[#F5F1E8]">More on the way</span>
                  <span className="mt-1 block font-mono text-[10px] text-white/45">New tools are being built for this screen</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-[#060708]/75 px-4 py-3 backdrop-blur">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#C4F24E]/40 bg-[#C4F24E]/10 text-[#C4F24E]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-[#C4F24E]">Still being built</span>
                <span className="text-[13px] text-white/65">You can see it coming — opens in a future update.</span>
              </div>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}
