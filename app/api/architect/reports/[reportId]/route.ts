import { NextResponse } from "next/server";
import { z } from "zod";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import {
  ArchitectReportsError,
  getArchitectReportDetail,
  updateArchitectReportStatus
} from "@/lib/architect/reports/service";

const statusSchema = z.object({
  status: z.enum(["received", "under_review", "resolved", "dismissed"])
});

function toReportsError(error: unknown) {
  if (error instanceof ArchitectReportsError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load Architect report.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const params = await context.params;
    return NextResponse.json(await getArchitectReportDetail(access.actor, params.reportId));
  } catch (error) {
    return toReportsError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const parsed = statusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid report status update." }, { status: 400 });
    }

    const params = await context.params;
    return NextResponse.json(await updateArchitectReportStatus(access.actor, params.reportId, parsed.data.status));
  } catch (error) {
    return toReportsError(error);
  }
}
