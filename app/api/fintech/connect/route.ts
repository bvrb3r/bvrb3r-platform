import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { ensureStripeConnectSubjectAccount, FintechServiceError } from "@/lib/fintech/service";

const connectSubjectSchema = z.object({
  shopId: z.string().trim().optional().nullable()
});

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to initialize the Stripe connected account.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const parsed = connectSubjectSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Stripe connected account payload." }, { status: 400 });
    }

    const payload = await ensureStripeConnectSubjectAccount(user, parsed.data);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
