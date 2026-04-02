import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  getProfileMediaWorkspacePayload,
  mutateProfileMedia,
  ProfileMediaServiceError
} from "@/lib/profile/service";

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
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
