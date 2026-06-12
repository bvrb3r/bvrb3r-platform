import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { attachCulturePostImageMedia, CultureComposerError } from "@/lib/culture/service";

const mediaRoleSchema = z.enum(["barber", "owner"]);

function isAuthenticated(session: Awaited<ReturnType<typeof getCurrentUserFromServer>>) {
  return session.authenticated !== false && session.user.id !== "guest-user";
}

function toErrorResponse(error: unknown) {
  if (error instanceof CultureComposerError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Unable to attach Culture media." },
    { status: 500 }
  );
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object"
    && value !== null
    && "arrayBuffer" in value
    && typeof value.arrayBuffer === "function"
    && "name" in value
    && typeof value.name === "string"
    && "type" in value
    && typeof value.type === "string"
    && "size" in value
    && typeof value.size === "number";
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

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ ok: false, error: "Invalid Culture media payload." }, { status: 400 });
    }

    const role = mediaRoleSchema.safeParse(formData.get("role"));
    if (!role.success) {
      return NextResponse.json({ ok: false, error: "Invalid Culture media role." }, { status: 400 });
    }

    const file = formData.get("file");
    if (!isUploadFile(file)) {
      return NextResponse.json({ ok: false, error: "Choose an image to upload." }, { status: 400 });
    }

    const { postId } = await params;
    const result = await attachCulturePostImageMedia(session.user, {
      role: role.data,
      postId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      bytes: await file.arrayBuffer()
    });

    return NextResponse.json({ ok: true, media: result.media });
  } catch (error) {
    return toErrorResponse(error);
  }
}
