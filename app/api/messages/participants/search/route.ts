import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { MessagingServiceError, searchMessagingParticipants } from "@/lib/messages/service";

function toErrorResponse(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to search message participants.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const query = request.nextUrl.searchParams.get("query") ?? "";
    const payload = await searchMessagingParticipants(user, query);

    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
