import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTrustActor } from "@/lib/trust/auth";
import { trustErrorResponse } from "@/lib/trust/http";
import { getTrustProvider } from "@/lib/trust/provider";

const disputeSchema = z.object({ disputeType: z.enum(["refund_request", "payment_dispute", "chargeback", "no_show", "service_quality"]), involvedPartyType: z.enum(["client", "barber", "shop", "booking"]), involvedPartyId: z.string().min(1), summary: z.string().min(12), appointmentId: z.string().optional(), locationId: z.string().optional() });
export async function POST(request: Request) { try { const actor = await requireTrustActor(["client_user", "barber_user", "shop_owner_user"]); const payload = disputeSchema.parse(await request.json()); const trustProvider = await getTrustProvider(); const result = await trustProvider.submitDispute(actor, payload); return NextResponse.json({ dispute: result.dispute }); } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid dispute request." }, { status: 400 }); return trustErrorResponse(error); } }
