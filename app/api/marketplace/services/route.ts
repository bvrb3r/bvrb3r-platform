import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketplaceActor } from "@/lib/marketplace/auth";
import { type ServiceMutationInput } from "@/lib/marketplace/engine";
import { marketplaceErrorResponse } from "@/lib/marketplace/http";
import { buildServiceCatalogPayload, getMarketplaceProvider } from "@/lib/marketplace/provider";

const createServiceSchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  durationMin: z.number().int().min(15),
  bufferMin: z.number().int().min(0),
  price: z.number().positive(),
  deposit: z.number().min(0),
  fullPrepay: z.boolean(),
  styleTagIds: z.array(z.string()).default([]),
  shopId: z.string().optional()
});

export async function GET() {
  try {
    const actor = await requireMarketplaceActor(["owner", "commission_barber", "booth_rent_barber"]);
    const marketplaceProvider = await getMarketplaceProvider();
    const runtime = await marketplaceProvider.readRuntime();
    return NextResponse.json(buildServiceCatalogPayload(runtime, actor));
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireMarketplaceActor(["owner", "booth_rent_barber"]);
    const payload = createServiceSchema.parse(await request.json());
    const marketplaceProvider = await getMarketplaceProvider();
    const result = await marketplaceProvider.createService(actor, payload satisfies ServiceMutationInput);
    return NextResponse.json({ service: result.service });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid service details." }, { status: 400 });
    }

    return marketplaceErrorResponse(error);
  }
}
