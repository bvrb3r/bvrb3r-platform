import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isClientRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { buildHaircutNowPayload, getMarketplaceProvider } from "@/lib/marketplace/provider";
import { getTrustProvider } from "@/lib/trust/provider";

const requestSchema = z.object({
  locationId: z.string().trim().max(120).optional()
});

async function getSessionClientId() {
  try {
    const session = await getCurrentUserFromServer();
    return isClientRole(session.user.role) ? session.user.clientId : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const parsed = requestSchema.safeParse({
    locationId: request.nextUrl.searchParams.get("locationId") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid instant-book request." }, { status: 400 });
  }

  try {
    const [marketplaceProvider, trustProvider, clientId] = await Promise.all([
      getMarketplaceProvider(),
      getTrustProvider(),
      getSessionClientId()
    ]);
    const [runtime, trustState] = await Promise.all([
      marketplaceProvider.readRuntime(),
      trustProvider.readState()
    ]);
    const match = buildHaircutNowPayload(runtime, clientId, parsed.data.locationId, trustState);

    void marketplaceProvider.recordHaircutNowImpression({ match, clientId }).catch(() => undefined);

    return NextResponse.json({ match });
  } catch {
    console.error("[marketplace/haircut-now] matching unavailable", {
      reference: "haircut_now_load_failed"
    });
    return NextResponse.json(
      { error: "Instant matching is temporarily unavailable.", code: "haircut_now_load_failed" },
      { status: 500 }
    );
  }
}
