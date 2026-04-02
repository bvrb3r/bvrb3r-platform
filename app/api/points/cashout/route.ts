import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getPointsScopeForUser, requestPointsCashout } from "@/lib/points/engine";

const cashoutSchema = z.object({
  requestedPoints: z.number().int().positive()
});

export async function POST(request: Request) {
  const { user } = await getCurrentUserFromServer();
  const scope = getPointsScopeForUser(user);

  if (!scope || !(scope.role === "barber" || scope.role === "owner")) {
    return NextResponse.json({ error: "Only barbers and owners can request BVR Points cash-out." }, { status: 403 });
  }

  const parsed = cashoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid BVR Points cash-out payload." }, { status: 400 });
  }

  try {
    const cashout = await requestPointsCashout({
      userId: scope.userId,
      role: scope.role,
      requestedPoints: parsed.data.requestedPoints,
      metadata: {
        requestedBy: user.email
      }
    });
    return NextResponse.json({ cashout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to request BVR Points cash-out.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
