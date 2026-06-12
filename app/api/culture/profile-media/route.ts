import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { createCulturePostFromProfileMedia, CultureComposerError } from "@/lib/culture/service";

const profileMediaSchema = z.object({
  role: z.enum(["client", "barber", "owner"]),
  sourceType: z.enum(["client_profile_post", "barber_portfolio", "shop_media_asset"]),
  sourceId: z.string().trim().min(1),
  caption: z.string().trim().max(2200).optional().nullable(),
  submitForReview: z.boolean().optional()
});

function isAuthenticated(session: Awaited<ReturnType<typeof getCurrentUserFromServer>>) {
  return session.authenticated !== false && session.user.id !== "guest-user";
}

function toErrorResponse(error: unknown) {
  if (error instanceof CultureComposerError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Unable to share Profile Studio media to Culture." },
    { status: 500 }
  );
}

function composerHrefForRole(role: "barber" | "owner") {
  return role === "barber" ? "/dashboard/barber/culture/new" : "/dashboard/owner/culture/new";
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentUserFromServer();
    if (!isAuthenticated(session)) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const parsed = profileMediaSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid Profile Studio Culture share payload." }, { status: 400 });
    }

    const result = await createCulturePostFromProfileMedia(session.user, parsed.data);
    const composerHref = parsed.data.role === "client"
      ? null
      : `${composerHrefForRole(parsed.data.role)}?draft=${encodeURIComponent(result.post.id)}`;

    return NextResponse.json({
      ok: true,
      post: result.summary,
      postId: result.post.id,
      media: result.media,
      message: result.message,
      composerHref
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
