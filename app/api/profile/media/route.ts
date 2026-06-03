import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  getProfileMediaWorkspacePayload,
  mutateProfileMedia,
  ProfileMediaServiceError
} from "@/lib/profile/service";
import { publishBarberMarketplaceReadiness, revalidateMarketplaceSurfaces } from "@/lib/marketplace/publishing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_viewer_photo"),
    storagePath: z.string().trim().min(1),
    imageUrl: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("remove_viewer_photo")
  }),
  z.object({
    action: z.literal("add_client_gallery_image"),
    storagePath: z.string().trim().min(1),
    imageUrl: z.string().trim().min(1),
    caption: z.string().trim().max(140).optional(),
    featured: z.boolean().optional()
  }),
  z.object({
    action: z.literal("remove_client_gallery_image"),
    assetId: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("set_client_public_username"),
    username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/)
  }),
  z.object({
    action: z.literal("set_client_public_bio"),
    publicBio: z.string().trim().max(300)
  }),
  z.object({
    action: z.literal("set_client_public_location"),
    city: z.string().trim().max(120),
    state: z.string().trim().max(40)
  }),
  z.object({
    action: z.literal("set_barber_photo"),
    storagePath: z.string().trim().min(1),
    imageUrl: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("remove_barber_photo")
  }),
  z.object({
    action: z.literal("add_barber_gallery_image"),
    storagePath: z.string().trim().min(1),
    imageUrl: z.string().trim().min(1),
    caption: z.string().trim().max(140).optional(),
    featured: z.boolean().optional()
  }),
  z.object({
    action: z.literal("remove_barber_gallery_image"),
    assetId: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("set_barber_public_username"),
    username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/)
  }),
  z.object({
    action: z.literal("set_barber_public_bio"),
    publicBio: z.string().trim().max(300)
  }),
  z.object({
    action: z.literal("set_barber_public_location"),
    address: z.string().trim().max(240).optional().nullable(),
    city: z.string().trim().max(120).optional().nullable(),
    state: z.string().trim().max(40).optional().nullable(),
    zip: z.string().trim().max(20).optional().nullable()
  }),
  z.object({
    action: z.literal("set_shop_photo"),
    shopId: z.string().trim().min(1),
    storagePath: z.string().trim().min(1),
    imageUrl: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("remove_shop_photo"),
    shopId: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("add_shop_gallery_image"),
    shopId: z.string().trim().min(1),
    storagePath: z.string().trim().min(1),
    imageUrl: z.string().trim().min(1),
    caption: z.string().trim().max(140).optional(),
    featured: z.boolean().optional()
  }),
  z.object({
    action: z.literal("remove_shop_gallery_image"),
    shopId: z.string().trim().min(1),
    assetId: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("set_shop_public_username"),
    shopId: z.string().trim().min(1),
    username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/)
  }),
  z.object({
    action: z.literal("set_shop_public_bio"),
    shopId: z.string().trim().min(1),
    publicBio: z.string().trim().max(300)
  }),
  z.object({
    action: z.literal("set_shop_public_location"),
    shopId: z.string().trim().min(1),
    address: z.string().trim().max(240).optional().nullable(),
    city: z.string().trim().max(120).optional().nullable(),
    state: z.string().trim().max(40).optional().nullable(),
    zipCode: z.string().trim().max(20).optional().nullable()
  }),
  z.object({
    action: z.literal("update_viewer_notification_preference"),
    inAppEnabled: z.boolean(),
    smsEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    pushEnabled: z.boolean()
  })
]);

function toErrorResponse(error: unknown) {
  if (error instanceof ProfileMediaServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to manage profile media." },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await getProfileMediaWorkspacePayload(user);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid profile media payload." }, { status: 400 });
    }

    const payload = await mutateProfileMedia(user, parsed.data);
    const supabase = createSupabaseAdminClient();
    const action = parsed.data.action;
    const shopId = "shopId" in parsed.data ? parsed.data.shopId : undefined;
    if (supabase && (action === "set_barber_photo" || action === "remove_barber_photo" || action === "add_barber_gallery_image" || action === "remove_barber_gallery_image" || action === "set_barber_public_username" || action === "set_barber_public_bio" || action === "set_barber_public_location") && user.barberId) {
      await publishBarberMarketplaceReadiness(supabase, user.barberId);
    } else if (shopId && (action === "set_shop_photo" || action === "remove_shop_photo" || action === "add_shop_gallery_image" || action === "remove_shop_gallery_image" || action === "set_shop_public_username" || action === "set_shop_public_bio" || action === "set_shop_public_location")) {
      revalidateMarketplaceSurfaces({ shopId });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
