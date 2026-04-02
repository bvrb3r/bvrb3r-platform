import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { MessagingServiceError, sendThreadMessage } from "@/lib/messages/service";

const sendMessageSchema = z.object({
  body: z.string().min(1)
});

function toErrorResponse(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to send the message.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const parsed = sendMessageSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid message payload." }, { status: 400 });
    }

    const params = await context.params;
    const payload = await sendThreadMessage(user, params.id, {
      body: parsed.data.body
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
