import { NextResponse } from "next/server";
import { z } from "zod";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import {
  getArchitectSupportThreadPayload,
  MessagingServiceError,
  sendArchitectSupportThreadReply
} from "@/lib/messages/service";

const replySchema = z.object({
  body: z.string().min(1)
});

function toArchitectMessagesError(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load Architect messages.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ threadId: string }> }) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const params = await context.params;
    const payload = await getArchitectSupportThreadPayload(access.actor, params.threadId);
    return NextResponse.json(payload);
  } catch (error) {
    return toArchitectMessagesError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const params = await context.params;
    const parsed = replySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid support reply payload." }, { status: 400 });
    }

    const payload = await sendArchitectSupportThreadReply(access.actor, params.threadId, {
      body: parsed.data.body
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toArchitectMessagesError(error);
  }
}
