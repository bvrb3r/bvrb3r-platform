import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import {
  listActivity,
  listSavedFavorites,
  updateAppPreferences,
  updateNotificationPreferences,
  updatePrivacyPreferences
} from "@/lib/settings/service";

const saveSchema = z.object({
  action: z.enum([
    "update_notification_preferences",
    "update_app_preferences",
    "update_privacy_preferences"
  ]),
  values: z.record(z.union([z.string(), z.boolean(), z.number(), z.array(z.string()), z.null()])).default({})
});

function unauthenticatedResponse() {
  return NextResponse.json({ error: "A signed-in account is required for More settings." }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return unauthenticatedResponse();
  }

  const kind = request.nextUrl.searchParams.get("kind");

  try {
    if (kind === "saved-favorites") {
      return NextResponse.json({ ok: true, ...(await listSavedFavorites(session.user)) });
    }

    if (kind === "activity") {
      return NextResponse.json({ ok: true, ...(await listActivity(session.user)) });
    }

    return NextResponse.json({ error: "Unsupported More settings load action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to load More setting."
    }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return unauthenticatedResponse();
  }

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid More settings payload." }, { status: 400 });
  }

  try {
    switch (parsed.data.action) {
      case "update_notification_preferences":
        return NextResponse.json({ ok: true, ...(await updateNotificationPreferences(session.user, parsed.data.values)) });
      case "update_app_preferences":
        return NextResponse.json({ ok: true, ...(await updateAppPreferences(session.user, parsed.data.values)) });
      case "update_privacy_preferences":
        return NextResponse.json({ ok: true, ...(await updatePrivacyPreferences(session.user, parsed.data.values)) });
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to save More setting."
    }, { status: 400 });
  }
}
