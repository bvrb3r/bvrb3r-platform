import { getShopDashboardPayload } from "@/lib/booking/platform-service";
import { demoShops } from "@/lib/data/marketplace";
import { getOwnerIntelligenceSummary } from "@/lib/engagement/engine";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { readPlatformShopControlState } from "@/lib/platform-admin/service";
import { getQueueWorkspacePayload } from "@/lib/queue/service";
import type { LiveOperationsViewer } from "@/lib/operations/live-state";
import type { UserAccount } from "@/types/domain";
import type { ShopManagerPayload, ShopManagerSuggestion } from "@/types/shop-manager";

type ShopDashboardPayload = Awaited<ReturnType<typeof getShopDashboardPayload>>;

function toViewer(user: UserAccount): LiveOperationsViewer {
  return {
    role: user.role,
    locationIds: user.locationIds,
    barberId: user.barberId,
    clientId: user.clientId,
    email: user.email
  };
}

function isShopManagerRole(role: UserAccount["role"]): role is "owner" | "manager" | "front_desk" {
  return role === "owner" || role === "manager" || role === "front_desk";
}

function formatClock(iso: string | null | undefined) {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function isWithinNextMinutes(iso: string, minutes: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const deltaMinutes = (date.getTime() - Date.now()) / 60_000;
  return deltaMinutes >= 0 && deltaMinutes <= minutes;
}

function pushSuggestion(list: ShopManagerSuggestion[], suggestion: ShopManagerSuggestion | null) {
  if (!suggestion) {
    return;
  }

  list.push(suggestion);
}

function buildOperationalSuggestions(input: {
  role: "owner" | "manager" | "front_desk";
  dashboard: ShopDashboardPayload;
  queuePayload: Awaited<ReturnType<typeof getQueueWorkspacePayload>>;
  ownerIntelligence?: ReturnType<typeof getOwnerIntelligenceSummary> | null;
}) {
  const suggestions: ShopManagerSuggestion[] = [];
  const hasOperationalBaseline = Boolean(
    input.dashboard.appointments.length
    || input.dashboard.walkIns.length
    || input.dashboard.barbers.length
    || input.dashboard.ownerAnalytics.length
  );
  const businessDate = "businessDate" in input.dashboard.summary
    ? input.dashboard.summary.businessDate
    : input.dashboard.summary.latestDate;
  const readyForCheckoutCount = "readyForCheckoutCount" in input.dashboard.summary
    ? input.dashboard.summary.readyForCheckoutCount
    : input.dashboard.appointments.filter((appointment) => appointment.status === "completed" && appointment.balanceDue > 0).length;
  const openChairs = input.dashboard.barbers.filter((barber) => barber.activeAppointmentCount === 0);
  const nextWalkIn = input.queuePayload.entries.find((entry) => entry.status === "active" && entry.bestAvailableBarber);
  const droppedAppointment = input.dashboard.appointments.find((appointment) => {
    if (!(appointment.status === "cancelled" || appointment.status === "no_show")) {
      return false;
    }

    return appointment.start.slice(0, 10) === businessDate && isWithinNextMinutes(appointment.start, 120);
  });

  pushSuggestion(suggestions, nextWalkIn && nextWalkIn.bestAvailableBarber ? {
    id: `walk-in-${nextWalkIn.id}`,
    type: "walk_in_assignment",
    priority: "high",
    title: `Route ${nextWalkIn.clientName} to ${nextWalkIn.bestAvailableBarber.barberName}`,
    detail: `${nextWalkIn.clientName} has waited ${nextWalkIn.waitMinutes} minutes. ${nextWalkIn.bestAvailableBarber.barberName} is the fastest chair for ${nextWalkIn.serviceName}.`,
    audience: input.role,
    safeAutomation: true,
    action: {
      kind: "assign_queue",
      label: "Assign next walk-in",
      entryId: nextWalkIn.id,
      barberId: nextWalkIn.bestAvailableBarber.barberId
    }
  } : null);

  pushSuggestion(suggestions, openChairs[0] ? {
    id: `capacity-${openChairs[0].id}`,
    type: "capacity_gap",
    priority: input.queuePayload.entries.length ? "high" : "medium",
    title: `${openChairs[0].name} has an open chair now`,
    detail: input.queuePayload.entries.length
      ? `Use the open chair to absorb live queue pressure before wait times rise.`
      : `There is live capacity right now. Use it for a walk-in or quick booking recovery.`,
    audience: input.role,
    safeAutomation: false,
    action: {
      kind: "link",
      label: "Open queue board",
      href: "/queue"
    }
  } : null);

  pushSuggestion(suggestions, droppedAppointment ? {
    id: `recovery-${droppedAppointment.id}`,
    type: "fill_slot_recovery",
    priority: "high",
    title: `Recover ${formatClock(droppedAppointment.start) ?? "the next"} revenue window`,
    detail: `${droppedAppointment.display.serviceName} with ${droppedAppointment.display.barberName} dropped off the schedule. Use the open slot before it turns into lost chair time.`,
    audience: input.role,
    safeAutomation: false,
    action: {
      kind: "link",
      label: input.role === "front_desk" ? "Open schedule" : "Open growth view",
      href: input.role === "front_desk" ? "/appointments" : "/reports?view=growth"
    }
  } : null);

  pushSuggestion(suggestions, readyForCheckoutCount ? {
    id: "checkout-risk",
    type: "checkout_risk",
    priority: "medium",
    title: `${readyForCheckoutCount} completed ticket${readyForCheckoutCount === 1 ? "" : "s"} still need handoff`,
    detail: "Completed services that are still waiting on checkout slow down trust, tips, and the next guest handoff.",
    audience: input.role,
    safeAutomation: false,
    action: {
      kind: "link",
      label: "Open front desk board",
      href: "/dashboard/front-desk"
    }
  } : null);

  if (input.role !== "front_desk" && input.ownerIntelligence) {
    const topBarber = input.ownerIntelligence.topBarbers[0];
    pushSuggestion(suggestions, topBarber ? {
      id: `top-performer-${topBarber.barberId}`,
      type: "top_performer",
      priority: "medium",
      title: `${topBarber.barberName} is leading the shop today`,
      detail: `${topBarber.barberName} is pacing ${topBarber.revenue.toFixed(0)} in tracked revenue with the strongest live performance signal in scope.`,
      audience: input.role,
      safeAutomation: false,
      action: {
        kind: "link",
        label: "Open team",
        href: "/team"
      }
    } : null);

    pushSuggestion(suggestions, input.ownerIntelligence.retention.rebookingOpportunities ? {
      id: "retention-opportunity",
      type: "retention_opportunity",
      priority: "medium",
      title: `${input.ownerIntelligence.retention.rebookingOpportunities} repeat clients are due back`,
      detail: "There is a live retention opportunity in the shop right now. Use campaigns or outreach to fill future chair demand before it softens.",
      audience: input.role,
      safeAutomation: false,
      action: {
        kind: "link",
        label: "Open growth",
        href: "/reports?view=growth"
      }
    } : null);
  }

  if (!suggestions.length && hasOperationalBaseline) {
    suggestions.push({
      id: "coverage-watch",
      type: "coverage_watch",
      priority: "low",
      title: "Shop flow is stable right now",
      detail: "No urgent queue, recovery, or payout-hand-off signals are competing for attention. The floor can stay in assist mode.",
      audience: input.role,
      safeAutomation: false,
      action: {
        kind: "link",
        label: "Open dashboard",
        href: input.role === "owner" ? "/dashboard/owner" : input.role === "manager" ? "/dashboard/manager" : "/dashboard/front-desk"
      }
    });
  }

  return {
    openChairs: openChairs.length,
    recoveryOpportunities: suggestions.filter((suggestion) => suggestion.type === "fill_slot_recovery" || suggestion.type === "retention_opportunity").length,
    suggestions: suggestions.slice(0, 5)
  };
}

export async function getShopManagerPayload(user: UserAccount): Promise<ShopManagerPayload> {
  if (!isShopManagerRole(user.role)) {
    throw new Error("Only owner, manager, or front desk can use the shop manager.");
  }

  const shopIds = demoShops
    .filter((shop) => shop.locationIds.some((locationId) => user.locationIds.includes(locationId)))
    .map((shop) => shop.id);
  const shopControls = await Promise.all(shopIds.map((shopId) => readPlatformShopControlState(shopId).catch(() => null)));
  const aiManagerEnabled = !shopControls.length || shopControls.some((control) => control?.shopStatus === "active" && control.aiManagerEnabled);

  if (!aiManagerEnabled) {
    return {
      mode: "assist",
      autoModeAvailable: false,
      autoModeReason: "AI shop manager is disabled for this shop by platform control.",
      generatedAt: new Date().toISOString(),
      summary: {
        queueEntries: 0,
        openChairs: 0,
        recoveryOpportunities: 0
      },
      suggestions: []
    };
  }

  const [dashboard, queuePayload] = await Promise.all([
    getShopDashboardPayload(toViewer(user)),
    getQueueWorkspacePayload(user)
  ]);

  let ownerIntelligence: ReturnType<typeof getOwnerIntelligenceSummary> | null = null;
  if (user.role === "owner" || user.role === "manager") {
    const [engagementProvider, operationsProvider] = await Promise.all([
      getEngagementProvider(),
      getLiveOperationsProvider()
    ]);
    const [state, snapshot] = await Promise.all([
      engagementProvider.readState(),
      operationsProvider.readSnapshot(toViewer(user))
    ]);
    ownerIntelligence = getOwnerIntelligenceSummary(state, snapshot, user.locationIds, {
      role: user.role,
      userEmail: user.email
    });
  }

  const operational = buildOperationalSuggestions({
    role: user.role,
    dashboard,
    queuePayload,
    ownerIntelligence
  });

  return {
    mode: "assist",
    autoModeAvailable: false,
    autoModeReason: "Auto mode stays off until staff-approved actions can run without risk to live guest flow.",
    generatedAt: new Date().toISOString(),
    summary: {
      queueEntries: queuePayload.entries.length,
      openChairs: operational.openChairs,
      recoveryOpportunities: operational.recoveryOpportunities
    },
    suggestions: operational.suggestions
  };
}
