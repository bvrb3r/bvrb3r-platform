import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  OwnerOperationsServiceError,
  updateOwnerFloorControls
} from "@/lib/owner-operations/service";

const schema = z.object({
  shopId: z.string().trim().min(1),
  intakeOpen: z.boolean().optional(),
  floorNote: z.string().trim().min(3).max(500).nullable().optional(),
  rotationOverrideBarberId: z.string().trim().min(1).nullable().optional(),
  rotationOverrideExpiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(3).max(500)
}).strict().refine(
  (value) => value.intakeOpen !== undefined
    || value.floorNote !== undefined
    || value.rotationOverrideBarberId !== undefined,
  "At least one floor control is required."
).refine(
  (value) => !value.rotationOverrideBarberId || Boolean(value.rotationOverrideExpiresAt),
  "Rotation overrides need an expiration time."
);

export async function PATCH(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid floor-control change." }, { status: 400 });
    }
    return NextResponse.json(
      await updateOwnerFloorControls(await getSessionUser(), parsed.data)
    );
  } catch (error) {
    if (error instanceof OwnerOperationsServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to change floor controls." }, { status: 500 });
  }
}
