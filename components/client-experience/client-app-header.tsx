"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CLIENT_PRIMARY_TAB_HREFS,
  type ClientAppMode
} from "@/components/client-experience/client-tab-config";
import {
  DashboardHeaderActions,
  type DashboardHeaderNotificationItem
} from "@/components/dashboard/dashboard-header-actions";
import { ThemeToggle } from "@/design/components";

type HeaderNotificationResponse = {
  items?: Array<{
    id: string;
    title: string;
    body: string;
    category: string;
    status: string;
    operational: boolean;
    unread: boolean;
    createdAt: string | null;
    deepLink: string | null;
  }>;
};

function headerSeverity(item: NonNullable<HeaderNotificationResponse["items"]>[number]) {
  const status = item.status.toLowerCase();
  if (item.operational && ["failed", "blocked", "degraded"].includes(status)) return "critical" as const;
  if (item.operational) return "warning" as const;
  return "info" as const;
}

export function ClientAppHeader({ mode = "client" }: { mode?: ClientAppMode }) {
  const isGuest = mode === "guest";
  const homeHref = isGuest ? "/discover?entry=guest" : CLIENT_PRIMARY_TAB_HREFS.home;
  const [notificationItems, setNotificationItems] = useState<DashboardHeaderNotificationItem[]>([]);

  useEffect(() => {
    if (isGuest) return;
    const controller = new AbortController();
    void fetch("/api/notifications", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json() as HeaderNotificationResponse;
        if (!Array.isArray(body.items)) return;
        setNotificationItems(body.items.slice(0, 8).map((item) => ({
          id: item.id,
          category: item.category.replaceAll("_", " "),
          severity: headerSeverity(item),
          title: item.title,
          body: item.body,
          timestamp: item.createdAt,
          read: !item.unread,
          action: item.deepLink
            ? { label: "Open", href: item.deepLink as Route }
            : undefined
        })));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isGuest]);

  return (
    <header className="bvr-glass-card rounded-[28px] px-4 py-3.5 sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <Link href={homeHref} className="flex min-w-0 items-center gap-3 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#C4F24E]/20 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.18),rgba(15,15,15,0.96))] text-sm font-semibold tracking-[0.22em] text-[#e4f9b8] shadow-[0_16px_34px_rgba(196, 242, 78,0.14)]">
            BV
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white">BVRB3R</p>
        </Link>
        {isGuest ? (
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-full border border-white/10 bg-black/25 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#C4F24E]/20 hover:text-white">
              Log in
            </Link>
            <Link href="/signup?lane=client" className="hidden rounded-full bg-[#c4f24e] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-[#d4f97a] sm:inline-flex">
              Join BVRB3R
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <DashboardHeaderActions
              role="client"
              notificationsHref="/notifications"
              notificationItems={notificationItems}
              notificationUnreadCount={notificationItems.filter((item) => !item.read).length}
              messagesHref={CLIENT_PRIMARY_TAB_HREFS.messages}
              moreHref={CLIENT_PRIMARY_TAB_HREFS.more}
            />
          </div>
        )}
      </div>
    </header>
  );
}
