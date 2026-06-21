import { NextResponse } from "next/server";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    environment: {
      ...readArchitectDebugEnvironment(),
      expectedMainCommit: process.env.BVRB3R_EXPECTED_MAIN_COMMIT
        ?? process.env.NEXT_PUBLIC_EXPECTED_MAIN_COMMIT
        ?? null,
      deploymentUrl: process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : null,
      deploymentStatus: process.env.BVRB3R_DEPLOYMENT_STATUS
        ?? process.env.NEXT_PUBLIC_DEPLOYMENT_STATUS
        ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? null,
      buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? process.env.BUILD_TIME ?? null,
      lastValidatedAt: process.env.BVRB3R_LAST_VALIDATED_AT
        ?? process.env.NEXT_PUBLIC_LAST_VALIDATED_AT
        ?? null
    }
  });
}
