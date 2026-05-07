import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { searchBarbersAndShopsPayload } from "@/lib/booking/platform-service";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const filterSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  locationId: z.string().optional(),
  styleTagId: z.string().optional(),
  minRating: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  availability: z.enum(["any", "today", "now"]).optional(),
  specialty: z.string().optional(),
  maxDistanceMiles: z.coerce.number().optional(),
  clientId: z.string().optional()
});

function getErrorMetadata(error: unknown) {
  const record = typeof error === "object" && error ? error as Record<string, unknown> : {};

  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    code: typeof record.code === "string" ? record.code : undefined,
    details: typeof record.details === "string" ? record.details : undefined,
    hint: typeof record.hint === "string" ? record.hint : undefined,
    supabaseMessage: typeof record.message === "string" ? record.message : undefined
  };
}

export async function GET(request: NextRequest) {
  let parsedFilters: z.infer<typeof filterSchema> | null = null;
  let sessionUserId: string | undefined;
  let sessionClientId: string | undefined;
  let sessionRole: string | undefined;

  try {
    const parsed = filterSchema.safeParse({
      query: request.nextUrl.searchParams.get("query") ?? undefined,
      category: request.nextUrl.searchParams.get("category") ?? undefined,
      locationId: request.nextUrl.searchParams.get("locationId") ?? undefined,
      styleTagId: request.nextUrl.searchParams.get("styleTagId") ?? undefined,
      minRating: request.nextUrl.searchParams.get("minRating") ?? undefined,
      maxPrice: request.nextUrl.searchParams.get("maxPrice") ?? undefined,
      availability: request.nextUrl.searchParams.get("availability") ?? undefined,
      specialty: request.nextUrl.searchParams.get("specialty") ?? undefined,
      maxDistanceMiles: request.nextUrl.searchParams.get("maxDistanceMiles") ?? undefined,
      clientId: request.nextUrl.searchParams.get("clientId") ?? undefined
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid discovery filters." }, { status: 400 });
    parsedFilters = parsed.data;

    const session = await getCurrentUserFromServer();
    sessionUserId = session.user.id;
    sessionClientId = session.user.clientId;
    sessionRole = session.user.role;
    const clientId = parsed.data.clientId ?? (session.user.role === "client" ? session.user.clientId : undefined);
    const filters = {
      query: parsed.data.query,
      category: parsed.data.category,
      locationId: parsed.data.locationId,
      styleTagId: parsed.data.styleTagId,
      minRating: parsed.data.minRating,
      maxPrice: parsed.data.maxPrice,
      availability: parsed.data.availability,
      specialty: parsed.data.specialty,
      maxDistanceMiles: parsed.data.maxDistanceMiles
    };
    const payload = await searchBarbersAndShopsPayload({
      ...filters,
      clientId
    });
    const results = payload.barbers;

    try {
      const marketplaceProvider = await getMarketplaceProvider();
      await marketplaceProvider.recordDiscoveryImpression({ filters, results, clientId });
    } catch {}

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[marketplace/discover] discovery failed", {
      reference: "client_search_load_failed",
      ...getErrorMetadata(error),
      url: request.nextUrl.pathname,
      search: request.nextUrl.search,
      queryParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
      parsedFilters,
      sessionUserId,
      sessionClientId,
      sessionRole
    });
    return NextResponse.json(
      { error: "Marketplace discovery failed. Reference client_search_load_failed.", code: "client_search_load_failed" },
      { status: 500 }
    );
  }
}
