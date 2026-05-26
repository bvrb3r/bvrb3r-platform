import { NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { FintechServiceError, getArchitectStripePlatformDiagnostics } from "@/lib/fintech/service";

function toStripePlatformDiagnosticsError(error: unknown) {
  if (error instanceof FintechServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load Stripe platform diagnostics.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(await getArchitectStripePlatformDiagnostics());
  } catch (error) {
    return toStripePlatformDiagnosticsError(error);
  }
}
