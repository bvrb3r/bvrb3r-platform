import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  createOwnerChair,
  OwnerOperationsServiceError,
  retireOwnerChair
} from "@/lib/owner-operations/service";

const createSchema = z.object({
  shopId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(999).default(0),
  assignedBarberId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3).max(500)
}).strict();

const retireSchema = z.object({
  shopId: z.string().trim().min(1),
  chairId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500)
}).strict();

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof OwnerOperationsServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid chair creation request." }, { status: 400 });
    }
    return NextResponse.json(
      await createOwnerChair(await getSessionUser(), parsed.data),
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "Unable to add this chair.");
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = retireSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid chair retirement request." }, { status: 400 });
    }
    return NextResponse.json(
      await retireOwnerChair(await getSessionUser(), parsed.data)
    );
  } catch (error) {
    return errorResponse(error, "Unable to retire this chair.");
  }
}
