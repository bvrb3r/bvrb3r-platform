import { NextResponse } from "next/server";
import {
  executeArchitectOperation,
  parseArchitectOperationCommand,
  readArchitectOperations
} from "@/lib/architect/city-map/operations.server";
import { buildArchitectCityManifest } from "@/lib/architect/city-map/manifest.server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { readDeploymentRuntimeEvidence } from "@/lib/architect/mission-control/deployment-evidence.server";
import { buildMissionControlSnapshot } from "@/lib/architect/mission-control/incident-detection";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function context() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { response: NextResponse.json({ error: "Operations storage is unavailable." }, { status: 503 }) };
  return { access, supabase };
}

export async function GET() {
  const resolved = await context();
  if ("response" in resolved) return resolved.response;
  return NextResponse.json(await readArchitectOperations(resolved.supabase, resolved.access.actor.id), {
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

export async function POST(request: Request) {
  const resolved = await context();
  if ("response" in resolved) return resolved.response;
  let command;
  try {
    command = parseArchitectOperationCommand(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The operation command is invalid." }, { status: 400 });
  }

  try {
    const deploymentEvidence = await readDeploymentRuntimeEvidence();
    const snapshot = await buildMissionControlSnapshot(resolved.supabase, resolved.access.actor, deploymentEvidence);
    const manifest = await buildArchitectCityManifest({ snapshot, supabase: resolved.supabase });
    if (manifest.controlsBlocked) {
      return NextResponse.json({ error: manifest.controlBlockReason ?? "Operations are blocked by connection verification." }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      ...await executeArchitectOperation({
        supabase: resolved.supabase,
        actorUserId: resolved.access.actor.id,
        command
      })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The operation could not be completed." }, { status: 409 });
  }
}
