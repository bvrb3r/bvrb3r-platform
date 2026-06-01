import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { getMarketplaceState, setMarketplaceState } from "@/lib/marketplace/state";
import { resolveSignedInProfile, CurrentProfileResolverError } from "@/lib/profile/current-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

const shopProfileSchema = z.object({
  shopId: z.string().trim().optional().nullable(),
  name: z.string().trim().min(2).max(120).optional(),
  brandLine: z.string().trim().max(240).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  neighborhood: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(40).optional().nullable(),
  profilePhotoPath: z.string().trim().max(500).optional().nullable(),
  profilePhotoUrl: z.string().trim().max(1000).optional().nullable(),
  coverPhotoUrl: z.string().trim().max(1000).optional().nullable(),
  publicBio: z.string().trim().max(2000).optional().nullable(),
  publicHours: z.union([z.record(z.unknown()), z.string().trim().max(2000)]).optional().nullable(),
  policies: z.string().trim().max(2000).optional().nullable(),
  shopUsername: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9._-]+$/).optional().nullable()
});

const ownerShopSelect = "id, name, brand_line, public_bio, cover_photo_url, public_hours, policies, shop_username, neighborhood, city, state, phone, address, profile_photo_path, profile_photo_url, owner_profile_id, app_approval_status";

function isOwnerScoped(user: UserAccount) {
  return user.role === "shop_owner_user" || user.role === "owner" || user.role === "manager";
}

function cleanNullable(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function resolveDemoShopId(user: UserAccount, requestedShopId?: string | null) {
  return requestedShopId ?? user.ownedShopId ?? user.locationIds[0] ?? null;
}

function updateDemoShopProfile(user: UserAccount, input: z.infer<typeof shopProfileSchema>) {
  const shopId = resolveDemoShopId(user, input.shopId);
  if (!shopId) {
    return null;
  }

  const state = getMarketplaceState();
  const nextShops = state.shops.map((shop) => {
    if (shop.id !== shopId) {
      return shop;
    }

    return {
      ...shop,
      name: input.name ?? shop.name,
      brandLine: cleanNullable(input.brandLine) ?? shop.brandLine,
      phone: cleanNullable(input.phone) ?? shop.phone,
      address: cleanNullable(input.address) ?? shop.address,
      neighborhood: cleanNullable(input.neighborhood) ?? shop.neighborhood,
      city: cleanNullable(input.city) ?? shop.city,
      state: cleanNullable(input.state) ?? shop.state,
      profilePhotoUrl: cleanNullable(input.profilePhotoUrl) ?? shop.profilePhotoUrl,
      coverPhotoUrl: cleanNullable(input.coverPhotoUrl) ?? shop.coverPhotoUrl,
      publicBio: cleanNullable(input.publicBio) ?? shop.publicBio,
      publicHours: input.publicHours ?? shop.publicHours,
      policies: cleanNullable(input.policies) ?? shop.policies,
      shopUsername: cleanNullable(input.shopUsername) ?? shop.shopUsername
    };
  });

  setMarketplaceState({ ...state, shops: nextShops });
  const shop = nextShops.find((entry) => entry.id === shopId);
  return shop ? { shop } : null;
}

async function getOwnerProfileIds(supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, user: UserAccount) {
  try {
    const result = await resolveSignedInProfile<{ id: string; email?: string | null; role?: string | null }>({
      user,
      supabase,
      select: "id, email, role"
    });
    return [...new Set([result.profileId, user.id].filter(Boolean))];
  } catch (error) {
    if (error instanceof CurrentProfileResolverError) {
      console.error("[owner-shop-profile] owner profile resolver failed", {
        code: error.code,
        status: error.status,
        userId: user.id,
        email: user.email
      });
      return user.id && user.id !== "guest-user" ? [user.id] : [];
    }
    throw error;
  }
}

async function readOwnerScopedShop(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  user: UserAccount,
  requestedShopId?: string | null
) {
  if (requestedShopId) {
    const ownerIds = await getOwnerProfileIds(supabase, user);
    const scopedRequestedQuery = supabase
      .from("shops")
      .select(ownerShopSelect)
      .eq("id", requestedShopId)
      .limit(1);
    const scopedRequested = ownerIds.length === 1
      ? await scopedRequestedQuery.eq("owner_profile_id", ownerIds[0]).maybeSingle()
      : await scopedRequestedQuery.in("owner_profile_id", ownerIds).maybeSingle();

    if (scopedRequested.error || scopedRequested.data) {
      return scopedRequested;
    }

    if (user.ownedShopId === requestedShopId) {
      return supabase
        .from("shops")
        .select(ownerShopSelect)
        .eq("id", requestedShopId)
        .limit(1)
        .maybeSingle();
    }

    return { data: null, error: null };
  }

  const ownerIds = await getOwnerProfileIds(supabase, user);
  if (!ownerIds.length) {
    if (user.ownedShopId) {
      return supabase
        .from("shops")
        .select(ownerShopSelect)
        .eq("id", user.ownedShopId)
        .limit(1)
        .maybeSingle();
    }
    return { data: null, error: null };
  }
  const ownerQuery = supabase
    .from("shops")
    .select(ownerShopSelect)
    .order("updated_at", { ascending: false })
    .limit(1);
  const byOwner = ownerIds.length === 1
    ? await ownerQuery.eq("owner_profile_id", ownerIds[0]).maybeSingle()
    : await ownerQuery.in("owner_profile_id", ownerIds).maybeSingle();

  if (byOwner.error || byOwner.data) {
    return byOwner;
  }

  if (user.ownedShopId) {
    return supabase
      .from("shops")
      .select(ownerShopSelect)
      .eq("id", user.ownedShopId)
      .limit(1)
      .maybeSingle();
  }

  return byOwner;
}

export async function PATCH(request: Request) {
  try {
    const parsed = shopProfileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid shop profile payload." }, { status: 400 });
    }

    const user = await getSessionUser();
    if (!isOwnerScoped(user)) {
      return NextResponse.json({ error: "Only shop owners can update shop profile details." }, { status: 403 });
    }

    if (!isSupabaseEnabled()) {
      const updated = updateDemoShopProfile(user, parsed.data);
      if (!updated) {
        return NextResponse.json({ error: "Owner shop not found." }, { status: 404 });
      }
      return NextResponse.json(updated);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured for owner shop profile updates." }, { status: 503 });
    }

    const scopedShopResult = await readOwnerScopedShop(supabase, user, parsed.data.shopId);

    if (scopedShopResult.error) {
      throw scopedShopResult.error;
    }
    const shop = scopedShopResult.data as { id: string } | null;
    if (!shop) {
      return NextResponse.json({ error: "Owner shop not found." }, { status: 404 });
    }

    const patch = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.brandLine !== undefined ? { brand_line: cleanNullable(parsed.data.brandLine) } : {}),
      ...(parsed.data.phone !== undefined ? { phone: cleanNullable(parsed.data.phone) } : {}),
      ...(parsed.data.address !== undefined ? { address: cleanNullable(parsed.data.address) } : {}),
      ...(parsed.data.neighborhood !== undefined ? { neighborhood: cleanNullable(parsed.data.neighborhood) } : {}),
      ...(parsed.data.city !== undefined ? { city: cleanNullable(parsed.data.city) } : {}),
      ...(parsed.data.state !== undefined ? { state: cleanNullable(parsed.data.state) } : {}),
      ...(parsed.data.profilePhotoPath !== undefined ? { profile_photo_path: cleanNullable(parsed.data.profilePhotoPath) } : {}),
      ...(parsed.data.profilePhotoUrl !== undefined ? { profile_photo_url: cleanNullable(parsed.data.profilePhotoUrl) } : {}),
      ...(parsed.data.coverPhotoUrl !== undefined ? { cover_photo_url: cleanNullable(parsed.data.coverPhotoUrl) } : {}),
      ...(parsed.data.publicBio !== undefined ? { public_bio: cleanNullable(parsed.data.publicBio) } : {}),
      ...(parsed.data.publicHours !== undefined ? { public_hours: typeof parsed.data.publicHours === "string" ? cleanNullable(parsed.data.publicHours) : parsed.data.publicHours } : {}),
      ...(parsed.data.policies !== undefined ? { policies: cleanNullable(parsed.data.policies) } : {}),
      ...(parsed.data.shopUsername !== undefined ? { shop_username: cleanNullable(parsed.data.shopUsername)?.toLowerCase() ?? null } : {}),
      updated_at: new Date().toISOString()
    };

    const updateResult = await supabase
      .from("shops")
      .update(patch)
      .eq("id", shop.id)
      .select(ownerShopSelect)
      .single();

    if (updateResult.error) {
      throw updateResult.error;
    }

    return NextResponse.json({ shop: updateResult.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update shop profile." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!isOwnerScoped(user)) {
      return NextResponse.json({ error: "Only shop owners can view shop profile details." }, { status: 403 });
    }

    if (!isSupabaseEnabled()) {
      const state = getMarketplaceState();
      const shopId = resolveDemoShopId(user);
      const shop = state.shops.find((entry) => entry.id === shopId) ?? null;
      if (!shop) {
        return NextResponse.json({ error: "Owner shop not found." }, { status: 404 });
      }
      return NextResponse.json({ shop });
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured for owner shop profile reads." }, { status: 503 });
    }

    const result = await readOwnerScopedShop(supabase, user);

    if (result.error) {
      throw result.error;
    }

    if (!result.data) {
      return NextResponse.json({ error: "Owner shop not found." }, { status: 404 });
    }

    return NextResponse.json({ shop: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load shop profile." },
      { status: 500 }
    );
  }
}
