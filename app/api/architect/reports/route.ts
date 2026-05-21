import { NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { ArchitectReportsError, listArchitectReports } from "@/lib/architect/reports/service";

function toReportsError(error: unknown) {
  if (error instanceof ArchitectReportsError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load Architect reports.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(await listArchitectReports(access.actor));
  } catch (error) {
    return toReportsError(error);
  }
}
