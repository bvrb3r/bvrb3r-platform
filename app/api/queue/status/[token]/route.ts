import { NextResponse } from "next/server";
import { rentErrorResponse } from "@/lib/rent/http";
import { getPublicQueueStatus } from "@/lib/rent/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const status = await getPublicQueueStatus(token);
    if (!status) {
      return NextResponse.json(
        { error: "Queue status not found." },
        {
          status: 404,
          headers: {
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex, nofollow"
          }
        }
      );
    }
    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  } catch (error) {
    return rentErrorResponse(error, "Unable to load this queue status.");
  }
}
