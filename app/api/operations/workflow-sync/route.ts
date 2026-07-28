import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOperationsPersistenceProvider } from "@/lib/operations/persistence-provider";

const workflowSyncSchema = z.object({
  workflowEvent: z.object({
    appointmentReference: z.string().min(1),
    locationReference: z.string().min(1),
    barberReference: z.string().min(1),
    barberUserReference: z.string().min(1),
    barberEmail: z.string().email(),
    clientReference: z.string().min(1),
    clientEmail: z.string().email(),
    actorRole: z.string().min(1),
    eventType: z.enum(["booking", "check_in", "service_start", "service_complete", "checkout"]),
    title: z.string().min(1),
    detail: z.string().min(1),
    eventPayload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    createdAt: z.string().min(1)
  }),
  compensationSnapshot: z.object({
    appointmentReference: z.string().min(1),
    locationReference: z.string().min(1),
    barberReference: z.string().min(1),
    barberUserReference: z.string().min(1),
    barberEmail: z.string().email(),
    clientReference: z.string().min(1),
    clientEmail: z.string().email(),
    compensationModel: z.enum(["freelance", "booth_rent", "autobooth_rent"]),
    businessDate: z.string().min(1),
    grossServiceAmount: z.number(),
    depositAmount: z.number(),
    collectedAmount: z.number(),
    tipAmount: z.number(),
    autoBoothPercent: z.number().nullable(),
    autoBoothRentAppliedAmount: z.number(),
    boothRentAmount: z.number().nullable(),
    boothRentPeriodLabel: z.string().nullable(),
    rentCoverageAmount: z.number().nullable(),
    checkoutReference: z.string().nullable(),
    capturedAt: z.string().min(1)
  }).nullable(),
  ownerAnalyticsSnapshot: z.object({
    locationReference: z.string().min(1),
    businessDate: z.string().min(1),
    bookedCount: z.number().int(),
    completedServicesCount: z.number().int(),
    paidAppointmentsCount: z.number().int(),
    revenueTotal: z.number(),
    tipTotal: z.number(),
    outstandingBalance: z.number(),
    updatedAt: z.string().min(1)
  })
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = workflowSyncSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid workflow sync payload." }, { status: 400 });
  }

  const provider = await getOperationsPersistenceProvider();
  const result = await provider.syncWorkflowEnvelope(parsed.data);
  return NextResponse.json(result);
}