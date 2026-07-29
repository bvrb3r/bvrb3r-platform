import { NextResponse } from "next/server";
import { z } from "zod";
import { rentErrorResponse } from "@/lib/rent/http";
import { rejoinPublicQueue } from "@/lib/rent/service";

const rejoinSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const parsed = rejoinSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid queue rejoin key is required." }, { status: 400 });
    }
    const result = await rejoinPublicQueue(token, parsed.data.idempotencyKey);
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  } catch (error) {
    return rentErrorResponse(error, "Unable to rejoin the queue.");
  }
}
