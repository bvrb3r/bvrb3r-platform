import { NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { getArchitectRentMonitorPayload } from "@/lib/rent/monitors";

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  return NextResponse.json(await getArchitectRentMonitorPayload(), {
    headers: {
      "Cache-Control": "private, no-store"
    }
  });
}
