import { NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { getArchitectSupportInboxPayload, MessagingServiceError } from "@/lib/messages/service";

function toArchitectMessagesError(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load Architect messages.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const payload = await getArchitectSupportInboxPayload(access.actor);
    return NextResponse.json(payload);
  } catch (error) {
    return toArchitectMessagesError(error);
  }
}
