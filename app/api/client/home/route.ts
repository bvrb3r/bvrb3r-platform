import { NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { getClientHomePayload } from "@/lib/booking/platform-service";

export async function GET() {
  try {
    const context = await getClientExperienceContext();
    const payload = await getClientHomePayload(context.clientId || undefined);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[client-home] load failed", {
      reference: "client_home_payload_load_failed",
      message
    });
    return NextResponse.json(
      { error: "Client home could not load profile data. Reference client_home_payload_load_failed.", code: "client_home_payload_load_failed" },
      { status: 500 }
    );
  }
}
