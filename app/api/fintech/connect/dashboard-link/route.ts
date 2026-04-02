import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { createStripeConnectDashboardSession, FintechServiceError } from "@/lib/fintech/service";

const connectSubjectSchema = z.object({
  shopId: z.string().trim().optional().nullable()
});

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to create the Stripe dashboard link.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const parsed = connectSubjectSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Stripe dashboard payload." }, { status: 400 });
    }

    const payload = await createStripeConnectDashboardSession(user, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
