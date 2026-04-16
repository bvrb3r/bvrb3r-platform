import { NextResponse } from "next/server";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";
import { ARCHITECT_DEGRADED_WARNING, createEmptyPlatformAdminConsolePayload, normalizePlatformAdminConsolePayload } from "@/lib/platform-admin/payload";
import { getPlatformAdminConsolePayload } from "@/lib/platform-admin/service";

export async function GET() {
  try {
    const access = await requireArchitectAdmin();
    if (!access.ok) {
      return access.response;
    }

    const { user } = access;
    let payload = createEmptyPlatformAdminConsolePayload(user.name);
    try {
      const result = await getPlatformAdminConsolePayload(user);
      if (!result || typeof result !== "object") {
        console.error("[Architect Console] API loader received an invalid payload", result);
      }
      payload = normalizePlatformAdminConsolePayload(result, {
        actorName: user.name
      });
    } catch (error) {
      console.error("[Architect Console] API loader failed", error);
      payload = createEmptyPlatformAdminConsolePayload(user.name, [ARCHITECT_DEGRADED_WARNING]);
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load the Architect Console." },
      { status: 500 }
    );
  }
}
