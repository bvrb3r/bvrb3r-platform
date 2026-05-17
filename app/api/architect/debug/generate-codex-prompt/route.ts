import { NextResponse } from "next/server";
import { z } from "zod";
import { generateCodexPromptFromDebugPacket } from "@/lib/architect/debug/codex-prompt";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import type { ArchitectDebugPacket } from "@/lib/architect/debug/types";

const promptSchema = z.object({
  packet: z.record(z.unknown())
});

export async function POST(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const parsed = promptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid prompt payload.", safeMessage: "A debug packet is required.", stage: "input" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    codexPrompt: generateCodexPromptFromDebugPacket(parsed.data.packet as ArchitectDebugPacket)
  });
}
