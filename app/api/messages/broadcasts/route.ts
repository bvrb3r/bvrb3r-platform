import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { sendMessagingBroadcast, MessagingServiceError } from "@/lib/messages/service";

const broadcastSchema = z.object({
  locationId: z.string().trim().min(1),
  audience: z.enum(["clients", "barbers", "all"]),
  body: z.string().trim().min(1).max(1000)
});

function toErrorResponse(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to send the broadcast.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = broadcastSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid broadcast payload." }, { status: 400 });
    }

    const broadcast = await sendMessagingBroadcast(user, parsed.data);
    return NextResponse.json({ broadcast }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
