import { NextResponse } from "next/server";
import { getKioskQueueStatus, PriorityOneKioskError } from "@/lib/kiosk/priority1-service";

function errorResponse(error: unknown) {
  if (error instanceof PriorityOneKioskError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the queue status." }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const { reference } = await params;
    return NextResponse.json(await getKioskQueueStatus(reference));
  } catch (error) {
    return errorResponse(error);
  }
}
