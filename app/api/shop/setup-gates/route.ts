import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { RENT_SETUP_GATE_KEYS } from "@/lib/rent/domain";
import { rentErrorResponse } from "@/lib/rent/http";
import {
  getShopSetupSnapshot,
  updateShopSetupGate
} from "@/lib/rent/service";

const schema = z.object({
  shopId: z.string().min(1),
  locationId: z.string().uuid(),
  gateKey: z.enum(RENT_SETUP_GATE_KEYS),
  status: z.enum(["pending", "passed", "approved_exception"]),
  evidence: z.record(z.unknown()).optional(),
  exceptionReason: z.string().trim().min(3).max(500).optional()
});

export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json(await getShopSetupSnapshot(user));
  } catch (error) {
    return rentErrorResponse(error, "Unable to load shop setup.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const current = await getShopSetupSnapshot(user);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid setup gate." },
        { status: 400 }
      );
    }
    if (parsed.data.shopId !== current.shopId || parsed.data.locationId !== current.locationId) {
      return NextResponse.json({ error: "The setup gate is outside this shop." }, { status: 403 });
    }
    const gate = await updateShopSetupGate(parsed.data);
    return NextResponse.json({ gate });
  } catch (error) {
    return rentErrorResponse(error, "Unable to update shop setup.");
  }
}
