import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  OwnerOperationsServiceError,
  setOwnerKioskEmergencyState
} from "@/lib/owner-operations/service";

const schema = z.object({
  shopId: z.string().trim().min(1),
  disabled: z.boolean(),
  reason: z.string().trim().min(3).max(500)
}).strict();

export async function PATCH(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk emergency change." }, { status: 400 });
    }
    return NextResponse.json(
      await setOwnerKioskEmergencyState(await getSessionUser(), parsed.data)
    );
  } catch (error) {
    if (error instanceof OwnerOperationsServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to change kiosk emergency state." }, { status: 500 });
  }
}
