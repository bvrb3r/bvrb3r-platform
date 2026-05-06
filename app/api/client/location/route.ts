import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { saveClientLocation } from "@/lib/booking/platform-service";

const clientLocationSchema = z.object({
  city: z.string().trim().min(1, "City is required.").max(80),
  state: z.string().trim().max(40).optional(),
  postalCode: z.string().trim().max(20).optional()
});

export async function POST(request: Request) {
  const context = await getClientExperienceContext();

  if (!context.isSignedInClient || !context.clientId || context.viewer.role !== "client") {
    return NextResponse.json({ error: "Only signed-in clients can save a booking location." }, { status: 403 });
  }

  const parsed = clientLocationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid client location payload." }, { status: 400 });
  }

  try {
    const result = await saveClientLocation({
      clientId: context.clientId,
      city: parsed.data.city,
      state: parsed.data.state,
      postalCode: parsed.data.postalCode
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[client-location] save failed", {
      reference: "client_location_save_failed",
      clientId: context.clientId,
      message: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error && error.message ? error.message : "Unable to save client location.";
    return NextResponse.json({ error: message, code: "client_location_save_failed" }, { status: 400 });
  }
}
