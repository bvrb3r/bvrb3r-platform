import { NextResponse } from "next/server";
import { z } from "zod";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/booking/route-auth";
import { resolveSignedInProfile } from "@/lib/profile/current-profile";
import {
  checkPublicUsernameAvailability,
  type PublicUsernameOwnerType
} from "@/lib/profile/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  username: z.string().trim().min(1).max(64),
  ownerType: z.enum(["client", "barber", "shop"]),
  shopId: z.string().trim().min(1).optional()
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function resolveOwnerId(ownerType: PublicUsernameOwnerType, shopId?: string) {
  const user = await getSessionUser();
  const supabase = createSupabaseAdminClient();
  const profileResult = await resolveSignedInProfile<{ id: string; email?: string | null; role?: string | null }>({
    user,
    supabase,
    select: "id, email, role"
  });

  if (ownerType === "client") {
    if (!isClientRole(user.role)) {
      throw new Error("forbidden");
    }
    return profileResult.profileId;
  }

  if (ownerType === "barber") {
    if (!isBarberAccountRole(user.role) || !user.barberId) {
      throw new Error("forbidden");
    }
    return user.barberId;
  }

  if (!isShopOwnerRole(user.role)) {
    throw new Error("forbidden");
  }

  if (!supabase) {
    throw new Error("supabase_unavailable");
  }

  const query = supabase
    .from("shops")
    .select("id")
    .eq("owner_profile_id", profileResult.profileId)
    .limit(1);

  const result = shopId
    ? await query.eq("id", shopId).maybeSingle()
    : await query.maybeSingle();

  if (result.error) {
    throw new Error("shop_lookup_failed");
  }

  const ownedShopId = (result.data as { id?: string | null } | null)?.id;
  if (!ownedShopId) {
    throw new Error("shop_not_found");
  }

  return ownedShopId;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    username: url.searchParams.get("username"),
    ownerType: url.searchParams.get("ownerType"),
    shopId: url.searchParams.get("shopId") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({
      available: false,
      normalizedUsername: "",
      reason: "invalid"
    });
  }

  try {
    const ownerId = await resolveOwnerId(parsed.data.ownerType, parsed.data.shopId);
    const result = await checkPublicUsernameAvailability(parsed.data.username, {
      type: parsed.data.ownerType,
      id: ownerId
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return jsonError("You do not have access to check this username.", 403);
    }

    return NextResponse.json({
      available: false,
      normalizedUsername: parsed.data.username.trim().toLowerCase(),
      reason: "unavailable"
    });
  }
}
