import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getPaymentProvider } from "@/lib/payments/provider";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (user.role !== "client") {
    return NextResponse.json({ error: "Only clients can initialize deposit payment intents." }, { status: 403 });
  }

  const body = await request.json();
  const provider = await getPaymentProvider();
  const intent = await provider.createDepositIntent({
    appointmentId: body.appointmentId,
    amount: body.amount,
    customerEmail: user.email,
    customerName: user.name
  });

  return NextResponse.json(intent);
}
