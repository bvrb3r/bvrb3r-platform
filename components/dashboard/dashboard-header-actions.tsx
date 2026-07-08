"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Bell, MessageSquareText, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

type HeaderRole = "client" | "barber" | "owner" | "architect";

type AttentionTone = "yellow" | "red";
type NotificationTone = "yellow" | "red";
type NotificationSeverity = "critical" | "warning" | "info";

export type DashboardHeaderNotificationItem = {
  id: string;
  category: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  timestamp?: string | null;
  action?: {
    label: string;
    href: ComponentProps<typeof Link>["href"];
  };
  read?: boolean;
};

type DashboardHeaderActionsProps = {
  role: HeaderRole;
  notificationsHref?: ComponentProps<typeof Link>["href"];
  messagesHref: ComponentProps<typeof Link>["href"];
  moreHref: ComponentProps<typeof Link>["href"];
  notificationUnreadCount?: number;
  notificationTone?: NotificationTone;
  notificationItems?: DashboardHeaderNotificationItem[];
  messageUnreadCount?: number;
  accountAttentionCount?: number;
  accountAttentionTone?: AttentionTone;
};

function Dot({ tone, label }: { tone: "red" | "yellow"; label: string }) {
  return (
    <span
      aria-label={label}
      className={cn(
        "absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full ring-2 ring-black",
        tone === "red" ? "bg-[#ff3b30]" : "bg-[#ffd166]"
      )}
    />
  );
}

function iconButtonClass() {
  return "relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/74 transition hover:border-[#C4F24E]/28 hover:bg-[#C4F24E]/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/50";
}

function severityClass(severity: NotificationSeverity) {
  switch (severity) {
    case "critical":
      return "border-[#ff3b30]/24 bg-[#ff3b30]/10 text-[#ffb3ad]";
    case "warning":
      return "border-[#ffd166]/24 bg-[#ffd166]/10 text-[#ffe2a6]";
    case "info":
    default:
      return "border-[#C4F24E]/20 bg-[#C4F24E]/8 text-[#e4f9b8]";
  }
}

export function DashboardHeaderActions({
  role,
  notificationsHref,
  messagesHref,
  moreHref,
  notificationUnreadCount = 0,
  notificationTone,
  notificationItems = [],
  messageUnreadCount = 0,
  accountAttentionCount = 0,
  accountAttentionTone = "yellow"
}: DashboardHeaderActionsProps) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const unreadNotificationItems = notificationItems.filter((item) => !item.read);
  const recentNotificationItems = notificationItems.filter((item) => item.read).slice(0, 4);
  const effectiveNotificationUnreadCount = Math.max(notificationUnreadCount, unreadNotificationItems.length);
  const hasUnreadNotifications = effectiveNotificationUnreadCount > 0;
  const hasUnreadMessages = messageUnreadCount > 0;
  const hasAccountAttention = accountAttentionCount > 0;
  const effectiveNotificationTone =
    notificationTone ?? (unreadNotificationItems.some((item) => item.severity === "critical") ? "red" : "yellow");
  const roleLabel = role === "owner" ? "shop owner" : role;

  return (
    <div className="relative">
      <div className="flex items-center gap-2" aria-label="Header actions" role="group">
        <button
          type="button"
          aria-label="Open notifications"
          aria-expanded={isNotificationsOpen}
          className={iconButtonClass()}
          onClick={() => setIsNotificationsOpen((current) => !current)}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {hasUnreadNotifications ? <Dot tone={effectiveNotificationTone} label={`${effectiveNotificationUnreadCount} unread notifications`} /> : null}
        </button>
        <Link href={messagesHref} aria-label="Open messages" className={iconButtonClass()}>
          <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          {hasUnreadMessages ? <Dot tone="red" label={`${messageUnreadCount} unread messages`} /> : null}
        </Link>
        <Link href={moreHref} aria-label="Open profile" className={iconButtonClass()}>
          <UserRound className="h-5 w-5" aria-hidden="true" />
          {hasAccountAttention ? <Dot tone={accountAttentionTone} label={`${accountAttentionCount} account attention items`} /> : null}
        </Link>
      </div>

      {isNotificationsOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(5,5,5,0.98))] p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C4F24E]">Notifications</p>
              <h2 className="mt-2 text-xl font-black tracking-[-0.035em]">Notifications</h2>
            </div>
            <button
              type="button"
              aria-label="Close notifications"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/70 transition hover:border-[#C4F24E]/28 hover:text-white"
              onClick={() => setIsNotificationsOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <section>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/42">Unread</p>
              {unreadNotificationItems.length ? (
                <div className="mt-2 space-y-2">
                  {unreadNotificationItems.map((item) => (
                    <NotificationRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-[20px] border border-white/8 bg-black/28 p-4 text-sm text-white/62">
                  {hasUnreadNotifications
                    ? `${effectiveNotificationUnreadCount} unread notification${effectiveNotificationUnreadCount === 1 ? "" : "s"} for this ${roleLabel} workspace.`
                    : "No new notifications."}
                </div>
              )}
            </section>
            <section>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/42">Recent</p>
              {recentNotificationItems.length ? (
                <div className="mt-2 space-y-2">
                  {recentNotificationItems.map((item) => (
                    <NotificationRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-[20px] border border-dashed border-white/10 bg-black/18 p-4 text-sm text-white/54">
                  Notification history will appear here as account-level alerts are wired in.
                </div>
              )}
            </section>
            {notificationsHref ? (
              <Link
                href={notificationsHref}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#C4F24E]/30 bg-[#C4F24E]/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-[#C4F24E] transition hover:bg-[#C4F24E]/14"
              >
                Open notification center
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({ item }: { item: DashboardHeaderNotificationItem }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/28 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/42">{item.category}</span>
        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]", severityClass(item.severity))}>
          {item.severity}
        </span>
      </div>
      <p className="mt-3 text-sm font-black text-white">{item.title}</p>
      <p className="mt-1 text-sm leading-5 text-white/58">{item.body}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-white/38">{item.timestamp ?? "Just now"}</span>
        {item.action ? (
          <Link
            href={item.action.href}
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-[#C4F24E]/24 bg-[#C4F24E]/8 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#C4F24E] transition hover:bg-[#C4F24E]/14"
          >
            {item.action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
