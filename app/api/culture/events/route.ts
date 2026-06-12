import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import {
  buildCultureEngagementPayloadForUser,
  buildCultureEventPayloadForUser,
  recordCultureEngagement,
  recordCultureFeedEvent
} from "@/lib/culture/service";

const cultureEventSchema = z.object({
  action: z.enum(["feed_event", "engagement"]),
  eventType: z.string().optional(),
  engagementType: z.string().optional(),
  postId: z.string().uuid().optional().nullable(),
  feedSessionId: z.string().uuid().optional().nullable(),
  surface: z.string().optional(),
  position: z.number().int().optional().nullable(),
  reasonCodes: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional()
});

function unauthenticatedResponse() {
  return NextResponse.json({ error: "A signed-in account is required for Culture events." }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return unauthenticatedResponse();
  }

  const parsed = cultureEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Culture event payload." }, { status: 400 });
  }

  try {
    if (parsed.data.action === "engagement") {
      if (!parsed.data.postId || !parsed.data.engagementType) {
        return NextResponse.json({ error: "Culture engagement requires postId and engagementType." }, { status: 400 });
      }

      const engagement = await recordCultureEngagement(buildCultureEngagementPayloadForUser(session.user, {
        postId: parsed.data.postId,
        engagementType: parsed.data.engagementType,
        metadata: parsed.data.metadata
      }));

      return NextResponse.json({ ok: true, engagement });
    }

    if (!parsed.data.eventType) {
      return NextResponse.json({ error: "Culture feed event requires eventType." }, { status: 400 });
    }

    const event = await recordCultureFeedEvent(buildCultureEventPayloadForUser(session.user, {
      eventType: parsed.data.eventType,
      postId: parsed.data.postId,
      feedSessionId: parsed.data.feedSessionId,
      surface: parsed.data.surface,
      position: parsed.data.position,
      reasonCodes: parsed.data.reasonCodes,
      metadata: parsed.data.metadata
    }));

    return NextResponse.json({ ok: true, event });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to record Culture event."
    }, { status: 400 });
  }
}
