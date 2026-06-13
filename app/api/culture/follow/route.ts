import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { performCultureFollowAction } from "@/lib/culture/service";

const cultureFollowSchema = z.object({
  targetProfileId: z.string().uuid(),
  action: z.enum(["follow", "unfollow"]),
  sourcePostId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional()
});

function unauthenticatedResponse() {
  return NextResponse.json({ ok: false, error: "A signed-in account is required to follow Culture profiles." }, { status: 401 });
}

function errorStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : 400;
}

export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return unauthenticatedResponse();
  }

  const parsed = cultureFollowSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid Culture follow payload." }, { status: 400 });
  }

  try {
    const result = await performCultureFollowAction(session.user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update Culture follow."
    }, { status: errorStatus(error) });
  }
}
