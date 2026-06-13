import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { createCultureComment, listCultureComments } from "@/lib/culture/service";

const cultureCommentsPostSchema = z.object({
  postId: z.string().uuid(),
  body: z.string()
});

function errorStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : 400;
}

export async function GET(request: NextRequest) {
  const postId = request.nextUrl.searchParams.get("postId");
  if (!postId) {
    return NextResponse.json({ ok: false, error: "Culture comments require a post id." }, { status: 400 });
  }

  const session = await getCurrentUserFromServer().catch(() => null);
  const viewerProfileId = session?.authenticated && session.user.id !== "guest-user" ? session.user.id : null;

  try {
    const result = await listCultureComments({ postId, viewerProfileId });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to load Culture comments."
    }, { status: errorStatus(error) });
  }
}

export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return NextResponse.json({ ok: false, error: "A signed-in account is required for Culture comments." }, { status: 401 });
  }

  const parsed = cultureCommentsPostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid Culture comment payload." }, { status: 400 });
  }

  try {
    const result = await createCultureComment(session.user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Comment could not be posted."
    }, { status: errorStatus(error) });
  }
}
