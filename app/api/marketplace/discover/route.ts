import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isClientRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { readPublicDiscovery } from "@/lib/marketplace/public-read-service";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const filterSchema = z.object({
  query: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  locationId: z.string().trim().max(120).optional(),
  styleTagId: z.string().trim().max(120).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxPrice: z.coerce.number().min(0).max(10_000).optional(),
  availability: z.enum(["any", "today", "now"]).optional(),
  specialty: z.string().trim().max(120).optional(),
  maxDistanceMiles: z.coerce.number().min(0).max(500).optional()
});

const DISCOVERY_TIMEOUT_MS = 5_000;
const DISCOVERY_IMPRESSION_TIMEOUT_MS = 1_500;

type DiscoveryError = Error & { code?: string };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, reference: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`Operation timed out. Reference ${reference}.`) as DiscoveryError;
      error.code = reference;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function getSafeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

async function getSessionAudience() {
  try {
    const session = await getCurrentUserFromServer();
    const authenticated = session.authenticated !== false && session.user.id !== "guest-user";
    return {
      clientId: authenticated && isClientRole(session.user.role) ? session.user.clientId : undefined,
      profileId: authenticated && session.user.id ? session.user.id : undefined
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/no active session|no session/i.test(message)) return {};
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const parsed = filterSchema.safeParse({
    query: request.nextUrl.searchParams.get("query") ?? undefined,
    category: request.nextUrl.searchParams.get("category") ?? undefined,
    locationId: request.nextUrl.searchParams.get("locationId") ?? undefined,
    styleTagId: request.nextUrl.searchParams.get("styleTagId") ?? undefined,
    minRating: request.nextUrl.searchParams.get("minRating") ?? undefined,
    maxPrice: request.nextUrl.searchParams.get("maxPrice") ?? undefined,
    availability: request.nextUrl.searchParams.get("availability") ?? undefined,
    specialty: request.nextUrl.searchParams.get("specialty") ?? undefined,
    maxDistanceMiles: request.nextUrl.searchParams.get("maxDistanceMiles") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid discovery filters." }, { status: 400 });
  }

  const filters = parsed.data;
  const { clientId, profileId } = await getSessionAudience();

  try {
    const discoveryPromise = profileId
      ? readPublicDiscovery(filters, profileId)
      : readPublicDiscovery(filters);
    const results = await withTimeout(
      discoveryPromise,
      DISCOVERY_TIMEOUT_MS,
      "client_search_timeout"
    );

    void withTimeout(
      getMarketplaceProvider().then((provider) =>
        provider.recordDiscoveryImpression({ filters, results, clientId })
      ),
      DISCOVERY_IMPRESSION_TIMEOUT_MS,
      "client_search_impression_timeout"
    ).catch((error) => {
      console.warn("[marketplace/discover] impression unavailable", {
        reference: "client_search_impression_failed",
        code: getSafeErrorCode(error),
        resultCount: results.length,
        authenticatedClient: Boolean(clientId)
      });
    });

    return NextResponse.json({ results, degraded: false });
  } catch (error) {
    const code = getSafeErrorCode(error);

    if (code === "client_search_timeout") {
      console.warn("[marketplace/discover] bounded fallback", {
        reference: "client_search_timeout",
        authenticatedClient: Boolean(clientId)
      });
      return NextResponse.json({ results: [], degraded: true, code: "client_search_timeout" });
    }

    console.error("[marketplace/discover] discovery unavailable", {
      reference: "client_search_load_failed",
      code,
      authenticatedClient: Boolean(clientId)
    });
    return NextResponse.json(
      { error: "Marketplace discovery is temporarily unavailable.", code: "client_search_load_failed" },
      { status: 500 }
    );
  }
}
