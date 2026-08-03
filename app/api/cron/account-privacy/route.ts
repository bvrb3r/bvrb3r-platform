import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runPr31AccountPrivacyWorker } from "@/lib/trust/account-privacy-worker";

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, result: await runPr31AccountPrivacyWorker() });
  } catch {
    return NextResponse.json({ ok: false, error: "Account privacy worker failed." }, { status: 500 });
  }
}
