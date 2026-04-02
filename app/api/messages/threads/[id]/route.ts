import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getMessagingThreadPayload, MessagingServiceError } from "@/lib/messages/service";

function toErrorResponse(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load the thread.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const params = await context.params;
    const payload = await getMessagingThreadPayload(user, params.id);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
