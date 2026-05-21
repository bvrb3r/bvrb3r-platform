import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { isClientRole } from "@/lib/auth/roles";
import { appendTrustReportToSupportThread } from "@/lib/messages/service";
import { requireTrustActor } from "@/lib/trust/auth";
import { trustErrorResponse } from "@/lib/trust/http";
import { getTrustProvider } from "@/lib/trust/provider";
import { resolveBarberReportTarget } from "@/lib/trust/report-targets";

const reportSchema = z.object({ subjectType: z.enum(["client", "barber", "shop", "review", "booking"]), subjectId: z.string().min(1), category: z.enum(["no_show_abuse", "harassment", "fraud", "unsafe_conduct", "fake_profile", "fake_review", "payment_dispute", "inappropriate_behavior"]), details: z.string().min(12), locationId: z.string().optional() });

async function canonicalizeReportPayload(payload: z.infer<typeof reportSchema>): Promise<z.infer<typeof reportSchema>> {
  if (payload.subjectType !== "barber") {
    return payload;
  }

  try {
    const target = await resolveBarberReportTarget(payload.subjectId);
    if (target.warnings.length) {
      console.warn("[trust-report] barber_subject_resolution_warnings", {
        subjectId: payload.subjectId,
        resolution: target.resolution,
        warnings: target.warnings
      });
    }

    if (target.resolution === "resolved" && target.subjectId !== payload.subjectId) {
      console.info("[trust-report] barber_subject_canonicalized", {
        rawSubjectId: payload.subjectId,
        canonicalSubjectId: target.subjectId,
        publicReference: target.publicReference,
        username: target.username
      });
      return {
        ...payload,
        subjectId: target.subjectId
      };
    }
  } catch (error) {
    console.warn("[trust-report] barber_subject_resolution_failed", {
      subjectId: payload.subjectId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "unknown barber resolution error"
    });
  }

  return payload;
}

export async function POST(request: Request) {
  try {
    const actor = await requireTrustActor(["client_user", "barber_user", "shop_owner_user"]);
    const payload = reportSchema.parse(await request.json());
    const reportPayload = await canonicalizeReportPayload(payload);
    const trustProvider = await getTrustProvider();
    const result = await trustProvider.submitSafetyReport(actor, reportPayload);
    let supportMessage: Awaited<ReturnType<typeof appendTrustReportToSupportThread>> | null = null;
    let supportWarning: string | null = null;

    if (isClientRole(actor.role)) {
      try {
        const user = await getSessionUser();
        supportMessage = await appendTrustReportToSupportThread(user, {
          reportId: result.report.id,
          subjectType: reportPayload.subjectType,
          subjectId: reportPayload.subjectId,
          category: reportPayload.category,
          details: reportPayload.details,
          createdAt: result.report.createdAt
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown support messaging error";
        console.warn("[trust-report] support_thread_write_failed", {
          reportId: result.report.id,
          subjectType: reportPayload.subjectType,
          subjectId: reportPayload.subjectId,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: message
        });
        supportWarning = "Report received. Support thread update requires review.";
      }
    }

    return NextResponse.json({
      report: result.report,
      supportThread: supportMessage
        ? {
            id: supportMessage.threadId
          }
        : null,
      supportMessage: supportMessage
        ? {
            id: supportMessage.messageId,
            createdAt: supportMessage.createdAt
          }
        : null,
      warning: supportWarning
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid safety report request." }, { status: 400 });
    return trustErrorResponse(error);
  }
}
