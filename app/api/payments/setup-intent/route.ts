import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getPaymentProvider } from "@/lib/payments/provider";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (user.role !== "client") {
    return NextResponse.json({ error: "Only clients can initialize saved payment method setup." }, { status: 403 });
  }

  await request.json().catch(() => null);
  const provider = await getPaymentProvider();
  const intent = await provider.createSavedPaymentMethodSetup({
    customerEmail: user.email,
    customerName: user.name
  });

  return NextResponse.json(intent);
}
