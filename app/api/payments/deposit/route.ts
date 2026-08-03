import { NextRequest, NextResponse } from "next/server";
import { getCanonicalAccountRole, isClientRole } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/booking/route-auth";
import { AppointmentPaymentGuardError } from "@/lib/payments/appointment-payment-guard";
import { getPaymentProvider } from "@/lib/payments/provider";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!isClientRole(getCanonicalAccountRole(user.role))) {
    return NextResponse.json({ error: "Only clients can initialize deposit payment intents." }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (typeof body?.appointmentId !== "string") {
      return NextResponse.json({ error: "A valid appointment is required." }, { status: 400 });
    }
    const provider = await getPaymentProvider();
    const intent = await provider.createDepositIntent({
      appointmentId: body.appointmentId,
      clientProfileId: user.id,
      customerEmail: user.email,
      customerName: user.name
    });

    return NextResponse.json(intent);
  } catch (error) {
    if (error instanceof AppointmentPaymentGuardError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deposit payment is unavailable." }, { status: 500 });
  }
}
