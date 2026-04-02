import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTrustActor } from "@/lib/trust/auth";
import { trustErrorResponse } from "@/lib/trust/http";
import { getTrustProvider } from "@/lib/trust/provider";

const reportSchema = z.object({ subjectType: z.enum(["client", "barber", "shop", "review", "booking"]), subjectId: z.string().min(1), category: z.enum(["no_show_abuse", "harassment", "fraud", "unsafe_conduct", "fake_profile", "fake_review", "payment_dispute", "inappropriate_behavior"]), details: z.string().min(12), locationId: z.string().optional() });
export async function POST(request: Request) { try { const actor = await requireTrustActor(["client", "commission_barber", "booth_rent_barber", "owner"]); const payload = reportSchema.parse(await request.json()); const trustProvider = await getTrustProvider(); const result = await trustProvider.submitSafetyReport(actor, payload); return NextResponse.json({ report: result.report }); } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid safety report request." }, { status: 400 }); return trustErrorResponse(error); } }
