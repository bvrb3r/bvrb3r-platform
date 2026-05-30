"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Bell, MessageSquareText, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

type HeaderRole = "client" | "barber" | "owner" | "architect";

type AttentionTone = "yellow" | "red";

type DashboardHeaderActionsProps = {
  role: HeaderRole;
  notificationsHref?: ComponentProps<typeof Link>["href"];
  messagesHref: ComponentProps<typeof Link>["href"];
  moreHref: ComponentProps<typeof Link>["href"];
  notificationUnreadCount?: number;
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
  return "relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/74 transition hover:border-[#7CFF00]/28 hover:bg-[#7CFF00]/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CFF00]/50";
}

export function DashboardHeaderActions({
  role,
  notificationsHref,
  messagesHref,
  moreHref,
  notificationUnreadCount = 0,
  messageUnreadCount = 0,
  accountAttentionCount = 0,
  accountAttentionTone = "yellow"
}: DashboardHeaderActionsProps) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const hasUnreadNotifications = notificationUnreadCount > 0;
  const hasUnreadMessages = messageUnreadCount > 0;
  const hasAccountAttention = accountAttentionCount > 0;
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
          {hasUnreadNotifications ? <Dot tone="red" label={`${notificationUnreadCount} unread notifications`} /> : null}
        </button>
        <Link href={messagesHref} aria-label="Open messages" className={iconButtonClass()}>
          <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          {hasUnreadMessages ? <Dot tone="red" label={`${messageUnreadCount} unread messages`} /> : null}
        </Link>
        <Link href={moreHref} aria-label="Open account" className={iconButtonClass()}>
          <UserRound className="h-5 w-5" aria-hidden="true" />
          {hasAccountAttention ? <Dot tone={accountAttentionTone} label={`${accountAttentionCount} account attention items`} /> : null}
        </Link>
      </div>

      {isNotificationsOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(5,5,5,0.98))] p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#A3FF12]">Notifications</p>
              <h2 className="mt-2 text-xl font-black tracking-[-0.035em]">Notifications</h2>
            </div>
            <button
              type="button"
              aria-label="Close notifications"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/70 transition hover:border-[#7CFF00]/28 hover:text-white"
              onClick={() => setIsNotificationsOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <section>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/42">Unread</p>
              <div className="mt-2 rounded-[20px] border border-white/8 bg-black/28 p-4 text-sm text-white/62">
                {hasUnreadNotifications
                  ? `${notificationUnreadCount} unread notification${notificationUnreadCount === 1 ? "" : "s"} for this ${roleLabel} workspace.`
                  : "No new notifications."}
              </div>
            </section>
            <section>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/42">Recent</p>
              <div className="mt-2 rounded-[20px] border border-dashed border-white/10 bg-black/18 p-4 text-sm text-white/54">
                Notification history will appear here as account-level alerts are wired in.
              </div>
            </section>
            {notificationsHref ? (
              <Link
                href={notificationsHref}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#A3FF12]/30 bg-[#A3FF12]/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3FF12] transition hover:bg-[#A3FF12]/14"
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
