import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ClientReviewError,
  getBarberDetailsPayload,
  getPublicBarberReviewsPayload,
  submitPublicBarberReview
} from "@/lib/booking/platform-service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

const publicBarberReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  message: z.string().max(500).optional().default("")
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const payload = await getPublicBarberReviewsPayload(id);
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof ClientReviewError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to load reviews right now." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const [{ id }, clientContext] = await Promise.all([
    context.params,
    getClientExperienceContext()
  ]);

  if (!clientContext.isSignedInClient || !clientContext.clientId) {
    return NextResponse.json({ ok: false, error: "Only signed-in clients can leave reviews." }, { status: 403 });
  }

  const parsed = publicBarberReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid review payload." }, { status: 400 });
  }

  try {
    const profile = await getBarberDetailsPayload(id);

    if (!profile) {
      return NextResponse.json({ ok: false, error: "Barber could not be found.", code: "barber_not_found" }, { status: 404 });
    }

    const barberAliases = Array.from(new Set([
      id,
      profile.barber.userId,
      profile.profile.username
    ].filter(Boolean)));

    const result = await submitPublicBarberReview({
      clientId: clientContext.clientId,
      barberId: profile.barber.id,
      barberAliases,
      rating: parsed.data.rating,
      message: parsed.data.message ?? ""
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ClientReviewError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to submit review right now." }, { status: 500 });
  }
}
