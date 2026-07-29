import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import {
  getNotificationCenter,
  NotificationServiceError,
  saveNotificationCenterPreferences
} from "@/lib/notifications/service";

const preferencesSchema = z.object({
  push_enabled: z.boolean().optional(),
  sms_enabled: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
  message_alerts_enabled: z.boolean().optional(),
  rewards_alerts_enabled: z.boolean().optional(),
  creator_alerts_enabled: z.boolean().optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional()
});

function errorResponse(error: unknown) {
  if (error instanceof NotificationServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
}

export async function GET() {
  try {
    const session = await getCurrentUserFromServer();
    if (!session.authenticated || session.user.id === "guest-user") {
      return NextResponse.json({ error: "Sign in to open notifications." }, { status: 401 });
    }
    return NextResponse.json(await getNotificationCenter(session.user), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getCurrentUserFromServer();
    if (!session.authenticated || session.user.id === "guest-user") {
      return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });
    }
    const parsed = preferencesSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notification preference values." }, { status: 400 });
    }
    return NextResponse.json({
      preferences: await saveNotificationCenterPreferences(session.user, parsed.data)
    });
  } catch (error) {
    return errorResponse(error);
  }
}

