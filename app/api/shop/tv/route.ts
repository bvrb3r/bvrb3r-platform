import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { readWaitingRoomTvSnapshot, WaitingRoomTvError } from "@/lib/tv/waiting-room-service";

export async function GET(request: Request) {
  try {
    const shopId = new URL(request.url).searchParams.get("shopId");
    return NextResponse.json(await readWaitingRoomTvSnapshot(await getSessionUser(), shopId));
  } catch (error) {
    if (error instanceof WaitingRoomTvError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "The waiting-room TV is temporarily unavailable." }, { status: 500 });
  }
}
