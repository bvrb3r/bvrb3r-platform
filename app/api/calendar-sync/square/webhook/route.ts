import { NextResponse } from "next/server";
import { verifySquareWebhookSignature } from "@/lib/calendar-sync/providers/square";
import { syncSquareMerchantFromWebhook } from "@/lib/calendar-sync/worker";

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySquareWebhookSignature({
    signature: request.headers.get("x-square-hmacsha256-signature"),
    body
  })) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  const payload = await Promise.resolve().then(() => JSON.parse(body) as { merchant_id?: unknown }).catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  if (typeof payload.merchant_id !== "string" || !payload.merchant_id) {
    return NextResponse.json({ accepted: true, matched: false });
  }
  try {
    return NextResponse.json(await syncSquareMerchantFromWebhook(payload.merchant_id));
  } catch {
    return NextResponse.json({ accepted: false }, { status: 500 });
  }
}
