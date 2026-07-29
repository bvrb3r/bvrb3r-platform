import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getBarberQueuePayload, QueueServiceError } from "@/lib/queue/service";

export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json(await getBarberQueuePayload(user));
  } catch (error) {
    if (error instanceof QueueServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to load the barber command queue." },
      { status: 500 }
    );
  }
}
