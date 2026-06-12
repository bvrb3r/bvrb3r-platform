import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { createCulturePostDraft, CultureComposerError } from "@/lib/culture/service";

const createPostSchema = z.object({
  role: z.enum(["barber", "owner"]),
  postType: z.string().trim().min(1),
  caption: z.string().trim().max(2200).optional().nullable(),
  barberId: z.string().trim().min(1).optional().nullable(),
  shopId: z.string().trim().min(1).optional().nullable(),
  serviceId: z.string().trim().min(1).optional().nullable(),
  isBookable: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  cta: z.string().trim().max(80).optional().nullable()
});

function isAuthenticated(session: Awaited<ReturnType<typeof getCurrentUserFromServer>>) {
  return session.authenticated !== false && session.user.id !== "guest-user";
}

function toErrorResponse(error: unknown) {
  if (error instanceof CultureComposerError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Unable to create Culture post." },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentUserFromServer();
    if (!isAuthenticated(session)) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const parsed = createPostSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid Culture post payload." }, { status: 400 });
    }

    const result = await createCulturePostDraft(session.user, parsed.data);
    return NextResponse.json({ ok: true, post: result.summary, postId: result.post.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
