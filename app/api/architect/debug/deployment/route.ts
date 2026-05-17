import { NextResponse } from "next/server";
import { buildDeploymentDebugPacket } from "@/lib/architect/debug/deployment-debug";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  return NextResponse.json(buildDeploymentDebugPacket());
}
