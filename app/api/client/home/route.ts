import { NextResponse } from "next/server";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { getClientHomePayload } from "@/lib/booking/platform-service";

export async function GET() {
  try {
    const context = await getClientExperienceContext();
    const payload = await getClientHomePayload(context.clientId || undefined);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[client-home] load failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { error: "Client home could not load marketplace data. Reference client_home_load_failed." },
      { status: 500 }
    );
  }
}
