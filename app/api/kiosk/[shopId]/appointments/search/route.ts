import { NextResponse } from "next/server";
import { z } from "zod";
import { PriorityOneKioskError, searchKioskAppointments } from "@/lib/kiosk/priority1-service";

const searchSchema = z.object({
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  fullName: z.string().trim().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  confirmationCode: z.string().trim().optional()
}).superRefine((value, context) => {
  if (![value.phone, value.email, value.fullName, value.confirmationCode].some((entry) => entry?.trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a phone, email, name, or confirmation code." });
  }
});

function errorResponse(error: unknown) {
  if (error instanceof PriorityOneKioskError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to search appointments." }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;
    const parsed = searchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter valid appointment search information.", code: "invalid_appointment_search" }, { status: 400 });
    }
    return NextResponse.json(await searchKioskAppointments(shopId, {
      ...parsed.data,
      email: parsed.data.email || undefined
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
