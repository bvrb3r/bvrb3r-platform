import { NextResponse } from "next/server";
import { z } from "zod";
import { parseArchitectRuntimeLog } from "@/lib/architect/debug/log-parser";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";

const parseLogSchema = z.object({
  log: z.string().min(1).max(40_000)
});

export async function POST(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const parsed = parseLogSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid log payload.", safeMessage: "Paste a runtime log before parsing.", stage: "input" }, { status: 400 });
  }

  return NextResponse.json(parseArchitectRuntimeLog(parsed.data.log));
}
