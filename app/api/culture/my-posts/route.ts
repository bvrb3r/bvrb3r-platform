import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { CultureComposerError, listMyCulturePosts } from "@/lib/culture/service";

const roleSchema = z.enum(["barber", "owner"]);

function isAuthenticated(session: Awaited<ReturnType<typeof getCurrentUserFromServer>>) {
  return session.authenticated !== false && session.user.id !== "guest-user";
}

function toErrorResponse(error: unknown) {
  if (error instanceof CultureComposerError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Unable to load Culture posts." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentUserFromServer();
    if (!isAuthenticated(session)) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const parsedRole = roleSchema.safeParse(new URL(request.url).searchParams.get("role"));
    if (!parsedRole.success) {
      return NextResponse.json({ ok: false, error: "Invalid Culture role." }, { status: 400 });
    }

    const posts = await listMyCulturePosts(session.user, parsedRole.data);
    return NextResponse.json({ ok: true, posts });
  } catch (error) {
    return toErrorResponse(error);
  }
}
