import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { ensureClientProfileForUser, saveClientLocation } from "@/lib/booking/platform-service";

const clientLocationSchema = z.object({
  city: z.string().trim().min(1, "City is required.").max(80),
  state: z.string().trim().max(40).optional(),
  postalCode: z.string().trim().max(20).optional()
});

type ClientLocationSaveFailureReason =
  | "auth_missing"
  | "validation_failed"
  | "rls_denied"
  | "schema_missing"
  | "database_write_failed"
  | "unknown";

function logClientLocationSaveFailure(reason: ClientLocationSaveFailureReason, metadata: Record<string, unknown>) {
  console.error("[client-location] save failed", {
    reference: "client_location_save_failed",
    reason,
    ...metadata
  });
}

function getClientLocationSaveFailureReason(error: unknown): ClientLocationSaveFailureReason {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error ?? "");

  if (code === "42501" || /row-level security|rls|permission denied|not authorized|forbidden/i.test(message)) {
    return "rls_denied";
  }

  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(code) || /schema cache|column .* does not exist|relation .* does not exist|preferred_(city|state|postal_code)/i.test(message)) {
    return "schema_missing";
  }

  if (message.trim().length > 0) {
    return "database_write_failed";
  }

  return "unknown";
}

export async function POST(request: Request) {
  const context = await getClientExperienceContext();

  const isClientUser = context.viewer.role === "client" && context.viewer.id !== "guest-user";
  if (!isClientUser) {
    logClientLocationSaveFailure("auth_missing", {
      clientId: context.clientId || null,
      viewerRole: context.viewer.role
    });
    return NextResponse.json({
      error: "Only signed-in clients can save a booking location.",
      code: "client_location_save_failed",
      reason: "auth_missing"
    }, { status: 403 });
  }

  const parsed = clientLocationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid client location payload.";
    logClientLocationSaveFailure("validation_failed", {
      clientId: context.clientId,
      message
    });
    return NextResponse.json({
      error: message,
      code: "client_location_save_failed",
      reason: "validation_failed"
    }, { status: 400 });
  }

  try {
    const repair = await ensureClientProfileForUser({
      userId: context.viewer.id,
      clientId: context.clientId || undefined,
      email: context.viewer.email,
      fullName: context.viewer.canonicalFullName ?? context.viewer.name,
      phone: context.viewer.phone,
      role: context.viewer.role
    });
    const result = await saveClientLocation({
      clientId: repair.clientId,
      city: parsed.data.city,
      state: parsed.data.state,
      postalCode: parsed.data.postalCode
    });

    return NextResponse.json({ ...result, repair });
  } catch (error) {
    const reason = getClientLocationSaveFailureReason(error);
    const message = error instanceof Error && error.message ? error.message : "Unable to save client location.";
    logClientLocationSaveFailure(reason, {
      clientId: context.clientId,
      message
    });
    return NextResponse.json({ error: message, code: "client_location_save_failed", reason }, { status: 400 });
  }
}
