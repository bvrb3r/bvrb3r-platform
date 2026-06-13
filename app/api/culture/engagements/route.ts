import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { performCulturePostEngagementAction } from "@/lib/culture/service";

const cultureEngagementActionSchema = z.object({
  postId: z.string().uuid(),
  action: z.enum(["like", "unlike", "save", "unsave", "share", "report", "profile_click", "book_click", "shop_click"]),
  reason: z.string().trim().min(1).max(120).optional(),
  metadata: z.record(z.unknown()).optional()
});

function unauthenticatedResponse() {
  return NextResponse.json({ ok: false, error: "A signed-in account is required for Culture engagement." }, { status: 401 });
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

  const parsed = cultureEngagementActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid Culture engagement payload." }, { status: 400 });
  }

  try {
    const result = await performCulturePostEngagementAction(session.user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update Culture engagement."
    }, { status: errorStatus(error) });
  }
}
