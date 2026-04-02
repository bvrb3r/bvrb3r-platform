import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketplaceActor } from "@/lib/marketplace/auth";
import { marketplaceErrorResponse } from "@/lib/marketplace/http";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const updateServiceSchema = z.object({
  category: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  durationMin: z.number().int().min(15).optional(),
  bufferMin: z.number().int().min(0).optional(),
  price: z.number().positive().optional(),
  deposit: z.number().min(0).optional(),
  fullPrepay: z.boolean().optional(),
  styleTagIds: z.array(z.string()).optional(),
  shopId: z.string().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ serviceId: string }> }) {
  try {
    const actor = await requireMarketplaceActor(["owner", "booth_rent_barber"]);
    const { serviceId } = await context.params;
    const payload = updateServiceSchema.parse(await request.json());
    const marketplaceProvider = await getMarketplaceProvider();
    const result = await marketplaceProvider.updateService(actor, serviceId, payload);
    return NextResponse.json({ service: result.service });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid service update." }, { status: 400 });
    }

    return marketplaceErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ serviceId: string }> }) {
  try {
    const actor = await requireMarketplaceActor(["owner", "booth_rent_barber"]);
    const { serviceId } = await context.params;
    const marketplaceProvider = await getMarketplaceProvider();
    const result = await marketplaceProvider.deleteService(actor, serviceId);
    return NextResponse.json({ service: result.service });
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}
