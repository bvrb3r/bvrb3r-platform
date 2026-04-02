import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { FintechServiceError, updateConnectedAccountStatus } from "@/lib/fintech/service";

const connectedAccountStatusSchema = z.object({
  provider: z.enum(["stripe_connect", "manual"]).optional(),
  providerAccountId: z.string().trim().optional().nullable(),
  onboardingStatus: z.enum(["not_started", "invited", "pending", "submitted", "restricted", "verified"]),
  taxReadinessStatus: z.enum(["pending", "submitted", "verified"]),
  chargesEnabled: z.boolean().optional(),
  payoutsEnabled: z.boolean().optional(),
  requirementsCurrentlyDue: z.union([z.array(z.string().trim()), z.string().trim()]).optional().nullable(),
  requirementsEventuallyDue: z.union([z.array(z.string().trim()), z.string().trim()]).optional().nullable(),
  requirementsPastDue: z.union([z.array(z.string().trim()), z.string().trim()]).optional().nullable(),
  disabledReason: z.string().trim().optional().nullable()
});

function toErrorResponse(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to update the connected account.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const parsed = connectedAccountStatusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid connected account payload." }, { status: 400 });
    }

    const { id } = await params;
    const payload = await updateConnectedAccountStatus(user, id, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
