import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { getMarketplaceState, setMarketplaceState } from "@/lib/marketplace/state";
import {
  ensureCanonicalOwnerShopLocation,
  type OwnerShopLocationSource
} from "@/lib/marketplace/owner-shop-location";
import { publishShopMarketplaceReadiness } from "@/lib/marketplace/publishing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

const ownerTimeSchema = z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const hoursSchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: ownerTimeSchema,
  endTime: ownerTimeSchema
}).strict())
  .min(1)
  .max(7)
  .superRefine((hours, context) => {
    const weekdays = new Set<number>();
    hours.forEach((entry, index) => {
      if (weekdays.has(entry.weekday)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each weekday can appear only once.",
          path: [index, "weekday"]
        });
      }
      weekdays.add(entry.weekday);
      if (entry.endTime <= entry.startTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Closing time must be later than opening time.",
          path: [index, "endTime"]
        });
      }
    });
  });

const ownerActivationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_shop_profile"),
    shopId: z.string().trim().optional().nullable(),
    shopName: z.string().trim().min(2),
    city: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    publicDescription: z.string().trim().optional()
  }),
  z.object({
    action: z.literal("update_shop_hours"),
    shopId: z.string().trim().optional().nullable(),
    hours: hoursSchema
  }),
  z.object({
    action: z.literal("set_shop_visibility"),
    shopId: z.string().trim().optional().nullable(),
    publicProfileEnabled: z.boolean()
  })
]);

function assertOwner(user: UserAccount) {
  if (!(user.role === "shop_owner_user" || user.role === "owner" || user.role === "manager")) {
    return null;
  }

  return user;
}

function resolveShopId(user: UserAccount, inputShopId?: string | null) {
  return inputShopId ?? user.ownedShopId ?? user.locationIds[0] ?? null;
}

function formatHours(hours: z.infer<typeof hoursSchema>) {
  if (!hours.length) {
    return "Hours not set";
  }

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return hours
    .map((entry) => `${days[entry.weekday]} ${entry.startTime}-${entry.endTime}`)
    .join(", ");
}

function canonicalOwnerHours(hours: z.infer<typeof hoursSchema>) {
  return {
    version: 1,
    source: "owner_settings",
    weekly: [...hours].sort((left, right) => left.weekday - right.weekday)
  };
}

function updateDemoOwnerActivation(user: UserAccount, input: z.infer<typeof ownerActivationSchema>) {
  const shopId = resolveShopId(user, input.shopId);
  if (!shopId) {
    return null;
  }

  const state = getMarketplaceState();
  const nextShops = state.shops.map((shop) => {
    if (shop.id !== shopId) {
      return shop;
    }

    if (input.action === "update_shop_profile") {
      return {
        ...shop,
        name: input.shopName,
        brandLine: input.publicDescription ?? shop.brandLine,
        phone: input.phone ?? shop.phone
      };
    }

    return shop;
  });
  const nextLocations = state.locations.map((location) => {
    if (location.id !== shopId) {
      return location;
    }

    if (input.action === "update_shop_profile") {
      return {
        ...location,
        name: input.shopName,
        city: input.city ?? location.city,
        phone: input.phone ?? location.phone
      };
    }

    if (input.action === "update_shop_hours") {
      return {
        ...location,
        hours: formatHours(input.hours)
      };
    }

    return location;
  });

  setMarketplaceState({
    ...state,
    shops: nextShops,
    locations: nextLocations
  });

  return { ok: true, shopId };
}

export async function POST(request: Request) {
  try {
    const parsed = ownerActivationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid owner activation payload." }, { status: 400 });
    }

    const user = await getSessionUser();
    if (!assertOwner(user)) {
      return NextResponse.json({ error: "Only shop owners can update shop activation." }, { status: 403 });
    }

    const shopId = resolveShopId(user, parsed.data.shopId);
    if (!shopId) {
      return NextResponse.json({ error: "Create or select a shop before updating activation." }, { status: 409 });
    }

    if (!isSupabaseEnabled()) {
      if (parsed.data.action === "set_shop_visibility") {
        return NextResponse.json({
          ok: true,
          shopId,
          note: "Demo shop visibility is governed by approval and bookable team readiness."
        });
      }

      const result = updateDemoOwnerActivation(user, parsed.data);
      if (!result) {
        return NextResponse.json({ error: "Create or select a shop before updating activation." }, { status: 409 });
      }

      return NextResponse.json(result);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured for owner activation." }, { status: 503 });
    }

    if (parsed.data.action === "set_shop_visibility") {
      return NextResponse.json(
        { error: "Shop public visibility is controlled by approval, profile readiness, and bookable team readiness in this environment." },
        { status: 409 }
      );
    }

    const shopResult = await supabase
      .from("shops")
      .select("id, owner_profile_id, name, neighborhood, city, state, zip_code, phone, address")
      .eq("id", shopId)
      .maybeSingle();
    if (shopResult.error) {
      throw shopResult.error;
    }
    if (
      !shopResult.data
      || (
        (shopResult.data as { owner_profile_id: string }).owner_profile_id !== user.id
        && user.ownedShopId !== shopId
      )
    ) {
      return NextResponse.json({ error: "This shop does not belong to the signed-in owner." }, { status: 403 });
    }
    const location = await ensureCanonicalOwnerShopLocation(
      supabase,
      shopResult.data as OwnerShopLocationSource
    );

    if (parsed.data.action === "update_shop_profile") {
      const shopPatch = {
        name: parsed.data.shopName,
        phone: parsed.data.phone ?? null,
        brand_line: parsed.data.publicDescription ?? null
      };
      const locationPatch = {
        name: parsed.data.shopName,
        city: parsed.data.city ?? null,
        phone: parsed.data.phone ?? null
      };

      const [shopUpdate, locationUpdate] = await Promise.all([
        supabase.from("shops").update(shopPatch).eq("id", shopId),
        supabase.from("locations").update(locationPatch).eq("id", location.id)
      ]);

      if (shopUpdate.error) {
        throw shopUpdate.error;
      }
      if (locationUpdate.error) {
        throw locationUpdate.error;
      }
    }

    if (parsed.data.action === "update_shop_hours") {
      const hours = canonicalOwnerHours(parsed.data.hours);
      const hoursUpdate = await supabase.rpc("pr40_update_owner_hours", {
        p_actor_profile_id: user.id,
        p_shop_id: shopId,
        p_location_id: location.id,
        p_hours: hours
      });

      if (hoursUpdate.error) {
        throw hoursUpdate.error;
      }
    }

    publishShopMarketplaceReadiness({ shopId });

    return NextResponse.json({ ok: true, shopId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update owner activation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
