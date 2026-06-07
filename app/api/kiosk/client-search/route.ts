import { NextResponse } from "next/server";
import { searchKioskClientProfiles, KioskClientCaptureError } from "@/lib/kiosk/client-capture";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const results = await searchKioskClientProfiles(query);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof KioskClientCaptureError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to search kiosk client profiles." }, { status: 500 });
  }
}
