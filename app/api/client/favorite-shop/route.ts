import { NextResponse } from "next/server";
import { z } from "zod";
import { saveClientFavoriteShop } from "@/lib/booking/platform-service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

const favoriteShopSchema = z.object({
  shopReference: z.string().min(1)
});

export async function POST(request: Request) {
  const context = await getClientExperienceContext();

  if (!context.isSignedInClient || !context.clientId || context.viewer.role !== "client") {
    return NextResponse.json({ error: "Only signed-in clients can save a favorite shop." }, { status: 403 });
  }

  const parsed = favoriteShopSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid favorite shop payload." }, { status: 400 });
  }

  try {
    const result = await saveClientFavoriteShop({
      clientId: context.clientId,
      shopReference: parsed.data.shopReference
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save favorite shop.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
