import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { CultureComposerError, submitCulturePostForReview } from "@/lib/culture/service";

const submitSchema = z.object({
  role: z.enum(["barber", "owner"])
});

function isAuthenticated(session: Awaited<ReturnType<typeof getCurrentUserFromServer>>) {
  return session.authenticated !== false && session.user.id !== "guest-user";
}

function toErrorResponse(error: unknown) {
  if (error instanceof CultureComposerError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Unable to submit Culture post." },
    { status: 500 }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getCurrentUserFromServer();
    if (!isAuthenticated(session)) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const parsed = submitSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid Culture submit payload." }, { status: 400 });
    }

    const { postId } = await params;
    const result = await submitCulturePostForReview(session.user, { role: parsed.data.role, postId });
    return NextResponse.json({ ok: true, post: result.summary, message: result.message });
  } catch (error) {
    return toErrorResponse(error);
  }
}
