import { NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { getClientHomePayload } from "@/lib/booking/platform-service";

export async function GET() {
  const context = await getClientExperienceContext();
  const payload = await getClientHomePayload(context.clientId || undefined);
  return NextResponse.json(payload);
}
