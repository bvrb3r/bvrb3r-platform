import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketplaceActor } from "@/lib/marketplace/auth";
import { type ServiceMutationInput } from "@/lib/marketplace/engine";
import { marketplaceErrorResponse } from "@/lib/marketplace/http";
import { publishBarberMarketplaceReadiness, revalidateMarketplaceSurfaces } from "@/lib/marketplace/publishing";
import { buildServiceCatalogPayload, getMarketplaceProvider } from "@/lib/marketplace/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const createServiceSchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  durationMin: z.number().int().positive(),
  bufferMin: z.number().int().min(0),
  price: z.number().min(0),
  deposit: z.number().min(0),
  fullPrepay: z.boolean(),
  styleTagIds: z.array(z.string()).default([]),
  shopId: z.string().optional(),
  active: z.boolean().default(true),
  bookable: z.boolean().default(true)
});

export async function GET() {
  try {
    const actor = await requireMarketplaceActor(["shop_owner_user", "barber_user"]);
    const marketplaceProvider = await getMarketplaceProvider();
    const runtime = await marketplaceProvider.readRuntime();
    return NextResponse.json(buildServiceCatalogPayload(runtime, actor));
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireMarketplaceActor(["shop_owner_user", "barber_user"]);
    const payload = createServiceSchema.parse(await request.json());
    const marketplaceProvider = await getMarketplaceProvider();
    const result = await marketplaceProvider.createService(actor, payload satisfies ServiceMutationInput);
    const supabase = createSupabaseAdminClient();
    if (supabase && actor.barberId) {
      await publishBarberMarketplaceReadiness(supabase, actor.barberId);
    } else {
      revalidateMarketplaceSurfaces();
    }
    return NextResponse.json({ service: result.service });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid service details." }, { status: 400 });
    }

    return marketplaceErrorResponse(error);
  }
}
