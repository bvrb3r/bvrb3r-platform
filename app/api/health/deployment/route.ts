import { NextResponse } from "next/server";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    environment: {
      ...readArchitectDebugEnvironment(),
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? null,
      buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? process.env.BUILD_TIME ?? null
    }
  });
}
