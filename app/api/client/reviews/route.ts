import { NextResponse } from "next/server";
import { z } from "zod";
import { ClientReviewError, submitClientReview } from "@/lib/booking/platform-service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

const clientReviewSchema = z.object({
  appointmentId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  message: z.string().max(500).optional().default("")
});

export async function POST(request: Request) {
  const context = await getClientExperienceContext();

  if (!context.isSignedInClient || !context.clientId || context.viewer.role !== "client") {
    return NextResponse.json({ error: "Only signed-in clients can submit appointment reviews." }, { status: 403 });
  }

  const parsed = clientReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review payload." }, { status: 400 });
  }

  try {
    const result = await submitClientReview({
      clientId: context.clientId,
      appointmentId: parsed.data.appointmentId,
      rating: parsed.data.rating,
      message: parsed.data.message ?? ""
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ClientReviewError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to submit review right now." }, { status: 500 });
  }
}
