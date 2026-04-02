import { NextResponse } from "next/server";
import { requireTrustActor } from "@/lib/trust/auth";
import { getOwnerTrustSummary } from "@/lib/trust/engine";
import { trustErrorResponse } from "@/lib/trust/http";
import { getTrustProvider } from "@/lib/trust/provider";

export async function GET() { try { const actor = await requireTrustActor(["owner"]); const trustProvider = await getTrustProvider(); const state = await trustProvider.readState(); return NextResponse.json({ summary: getOwnerTrustSummary(state, actor.locationIds ?? []) }); } catch (error) { return trustErrorResponse(error); } }
