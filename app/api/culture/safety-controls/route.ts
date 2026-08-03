import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  getPr27CultureSafetySnapshot,
  moderatePr27CultureCase,
  ProductPr27ServiceError,
  resolvePr27CultureAppeal,
  setPr27CultureBlock,
  setPr27CultureMute,
  submitPr27CultureAppeal,
  submitPr27CultureReport
} from "@/lib/trust/product-pr27-service";
import {
  buildPr31ReportDetails,
  toPr27CultureCategory
} from "@/lib/trust/product-pr31-report-block";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("report"),
    reportedProfileId: z.string().min(1).max(128),
    postId: z.string().min(1).max(128).optional().nullable(),
    category: z.enum(["spam", "harassment", "stolen_work", "explicit_content", "dangerous_services", "other"]).optional(),
    details: z.string().trim().max(2000).optional().nullable(),
    reason: z.enum(["spam", "harassment", "unsafe_conduct", "fake_profile", "payment_scam", "other"]).optional(),
    evidenceDescription: z.string().trim().max(1600).optional().nullable(),
    sourceSurface: z.enum(["public_profile", "culture_post", "message_thread"]).optional()
  }),
  z.object({
    action: z.literal("block"),
    targetProfileId: z.string().min(1).max(128),
    active: z.boolean(),
    reason: z.string().trim().max(500).optional().nullable()
  }),
  z.object({
    action: z.literal("mute"),
    targetProfileId: z.string().min(1).max(128),
    active: z.boolean()
  }),
  z.object({
    action: z.literal("appeal"),
    caseId: z.string().min(1).max(128),
    reason: z.string().trim().min(12).max(2000)
  }),
  z.object({
    action: z.literal("moderate"),
    caseId: z.string().min(1).max(128),
    decision: z.enum(["keep", "warn", "remove", "escalate"]),
    reasoning: z.string().trim().min(12).max(2000)
  }),
  z.object({
    action: z.literal("resolve_appeal"),
    appealId: z.string().min(1).max(128),
    outcome: z.enum(["upheld", "denied"]),
    reasoning: z.string().trim().min(12).max(2000)
  })
]);

function errorResponse(error: unknown) {
  if (error instanceof ProductPr27ServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "Unable to update Culture safety." }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await getPr27CultureSafetySnapshot(await getSessionUser()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({
        error: parsed.error.issues[0]?.message ?? "Invalid Culture safety action."
      }, { status: 400 });
    }
    if (
      parsed.data.action === "report"
      && !parsed.data.category
      && !(parsed.data.reason && parsed.data.sourceSurface)
    ) {
      return NextResponse.json({ error: "A canonical report reason and source are required." }, { status: 400 });
    }

    switch (parsed.data.action) {
      case "report": {
        const category = parsed.data.reason
          ? toPr27CultureCategory(parsed.data.reason)
          : parsed.data.category!;
        const details = parsed.data.reason && parsed.data.sourceSurface
          ? buildPr31ReportDetails({
              reason: parsed.data.reason,
              source: parsed.data.sourceSurface,
              evidenceDescription: parsed.data.evidenceDescription
            })
          : parsed.data.details;
        return NextResponse.json(await submitPr27CultureReport(user, {
          reportedProfileId: parsed.data.reportedProfileId,
          postId: parsed.data.postId,
          category,
          details
        }), { status: 201 });
      }
      case "block":
        return NextResponse.json(await setPr27CultureBlock(user, parsed.data));
      case "mute":
        return NextResponse.json(await setPr27CultureMute(user, parsed.data));
      case "appeal":
        return NextResponse.json(await submitPr27CultureAppeal(user, parsed.data), { status: 201 });
      case "moderate":
        return NextResponse.json(await moderatePr27CultureCase(user, parsed.data));
      case "resolve_appeal":
        return NextResponse.json(await resolvePr27CultureAppeal(user, parsed.data));
    }
  } catch (error) {
    return errorResponse(error);
  }
}
