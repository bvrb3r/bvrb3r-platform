import "server-only";

import { isShopOwnerRole } from "@/lib/auth/roles";
import { getShopDashboardPayload } from "@/lib/booking/platform-service";
import { isDemoMode, isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildOwnerOperationsPayload,
  createDefaultOwnerOperationsControlState,
  resolveOwnerOperationsShopId
} from "@/lib/owner-operations/domain";
import { readOwnerOperationsControlState } from "@/lib/owner-operations/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";
import type { WaitingRoomMenuGroup, WaitingRoomTvSnapshot } from "./waiting-room";

type ServiceRow = {
  id: string;
  name: string | null;
  price: number | string | null;
  duration_min: number | null;
  barber_reference: string | null;
};

export class WaitingRoomTvError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

function toPriceCents(value: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

async function readMenu(shopId: string, team: WaitingRoomTvSnapshot["team"]): Promise<WaitingRoomMenuGroup[]> {
  if (!isSupabaseEnabled()) return [];
  const admin = createSupabaseAdminClient();
  if (!admin) throw new WaitingRoomTvError("The TV menu source is unavailable.", 503, "tv_menu_unavailable");

  const result = await admin
    .from("services")
    .select("id, name, price, duration_min, barber_reference")
    .eq("location_id", shopId)
    .eq("active", true)
    .eq("is_bookable", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (result.error) {
    throw new WaitingRoomTvError("The TV menu could not be verified.", 503, "tv_menu_query_failed");
  }

  const teamById = new Map(team.map((barber) => [barber.barberId, barber.name]));
  const groups = new Map<string, WaitingRoomMenuGroup>();
  for (const row of (result.data ?? []) as ServiceRow[]) {
    const barberId = row.barber_reference?.trim();
    const serviceName = row.name?.trim();
    const priceCents = toPriceCents(row.price);
    if (!barberId || !serviceName || priceCents <= 0 || !teamById.has(barberId)) continue;

    const group = groups.get(barberId) ?? {
      barberId,
      barberName: teamById.get(barberId)!,
      services: []
    };
    group.services.push({
      id: row.id,
      name: serviceName,
      priceCents,
      durationMinutes: Math.max(0, Number(row.duration_min ?? 0))
    });
    groups.set(barberId, group);
  }

  return [...groups.values()].filter((group) => group.services.length > 0);
}

export async function readWaitingRoomTvSnapshot(user: UserAccount, requestedShopId?: string | null): Promise<WaitingRoomTvSnapshot> {
  if (!isShopOwnerRole(user.role)) {
    throw new WaitingRoomTvError("Only a shop owner can open the waiting-room TV.", 403, "tv_owner_required");
  }

  const shopId = resolveOwnerOperationsShopId(user, requestedShopId);
  if (!shopId) {
    throw new WaitingRoomTvError("Choose a shop before opening the waiting-room TV.", 400, "tv_shop_required");
  }

  const [dashboard, controls] = await Promise.all([
    getShopDashboardPayload({ role: "owner", locationIds: [shopId], email: user.email }),
    isDemoMode()
      ? Promise.resolve(createDefaultOwnerOperationsControlState())
      : readOwnerOperationsControlState(user, shopId)
  ]);
  const operations = buildOwnerOperationsPayload({ shopId, dashboard, controls });
  const team = operations.team.map((barber) => ({
    barberId: barber.barberId,
    name: barber.name,
    floorState: barber.floorState,
    booked: barber.booked,
    completed: barber.completed,
    liveAppointments: barber.liveAppointments,
    nextAppointmentStart: barber.nextAppointmentStart
  }));
  const menu = await readMenu(shopId, team);

  return {
    shopId,
    shopName: operations.scope.shopName,
    generatedAt: operations.generatedAt,
    team,
    menu,
    status: team.length || menu.length ? "live" : "empty"
  };
}
