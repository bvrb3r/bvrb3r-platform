import { NextResponse } from "next/server";
import { z } from "zod";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { validateAppointmentProductionState } from "@/lib/architect/mission-control/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const validationSchema = z.object({
  appointmentId: z.string().trim().min(1)
});

export async function POST(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const parsed = validationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      error: "appointmentId is required.",
      safeMessage: "Enter an appointment id.",
      stage: "input"
    }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({
      ok: false,
      error: "Supabase admin client is unavailable.",
      safeMessage: "Production database access is unavailable.",
      stage: "supabase"
    }, { status: 503 });
  }

  try {
    return NextResponse.json(await validateAppointmentProductionState(supabase, access.actor, parsed.data.appointmentId));
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Production validation failed.",
      safeMessage: "Production validation could not be completed.",
      stage: "validation"
    }, { status: 500 });
  }
}
