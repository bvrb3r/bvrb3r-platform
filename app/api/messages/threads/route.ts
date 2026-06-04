import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { isClientRole } from "@/lib/auth/roles";
import { isBarberRole, isShopRole } from "@/lib/messages/domain";
import { createMessagingThread, getMessagingInboxPayload, MessagingServiceError } from "@/lib/messages/service";

const createThreadSchema = z.union([
  z.object({
    appointmentId: z.string().trim().min(1)
  }),
  z.object({
    threadType: z.literal("client_barber"),
    profileId: z.string().trim().min(1)
  }),
  z.object({
    threadType: z.literal("support")
  }),
  z.object({
    threadType: z.enum(["client_shop", "barber_shop"]),
    profileId: z.string().trim().min(1),
    locationId: z.string().trim().min(1)
  })
]);

function isSupportedMessagingRole(role: Awaited<ReturnType<typeof getSessionUser>>["role"]) {
  return isClientRole(role) || isBarberRole(role) || isShopRole(role);
}

function toErrorResponse(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({
      error: "Could not open conversation",
      message: error.message,
      code: error.code,
      step: error.step
    }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load messaging.";
  return NextResponse.json({
    error: "Could not open conversation",
    message,
    code: "unexpected_create_open_failure",
    step: "unexpected"
  }, { status: 500 });
}

function describeCreateThreadTarget(input: z.infer<typeof createThreadSchema>) {
  if ("appointmentId" in input) {
    return {
      threadType: "appointment",
      targetType: "appointment",
      targetId: input.appointmentId,
      locationId: null
    };
  }

  if (input.threadType === "support") {
    return {
      threadType: input.threadType,
      targetType: "support",
      targetId: null,
      locationId: null
    };
  }

  return {
    threadType: input.threadType,
    targetType: input.threadType === "client_barber" ? "profile" : "profile_or_shop_contact",
    targetId: input.profileId,
    locationId: "locationId" in input ? input.locationId : null
  };
}

function getTargetIdKind(input: z.infer<typeof createThreadSchema> | null) {
  if (!input) {
    return null;
  }

  if ("appointmentId" in input) {
    return "appointment_reference";
  }

  if (input.threadType === "support") {
    return "support";
  }

  if ("locationId" in input) {
    return input.locationId.includes("-") ? "uuid_or_public_shop_id" : "public_reference";
  }

  return "profile_id";
}

function getErrorDiagnostics(error: unknown) {
  return error instanceof MessagingServiceError ? error.diagnostics ?? null : null;
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await getMessagingInboxPayload(user);
    if (!payload.available && !isSupportedMessagingRole(user.role)) {
      return NextResponse.json({ error: "Messaging is only available to clients, barbers, and shop-facing roles." }, { status: 403 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof getSessionUser>> | null = null;
  let parsedInput: z.infer<typeof createThreadSchema> | null = null;
  try {
    user = await getSessionUser();
    const parsed = createThreadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid thread creation payload." }, { status: 400 });
    }

    parsedInput = parsed.data;
    console.info("[messages] create_thread_requested", {
      actorUserId: user.id,
      actorRole: user.role,
      ...describeCreateThreadTarget(parsed.data)
    });
    const payload = await createMessagingThread(user, parsed.data);
    if (!payload.thread?.id) {
      console.warn("[messages] create_thread_missing_thread_id", {
        actorUserId: user.id,
        actorRole: user.role,
        ...describeCreateThreadTarget(parsed.data)
      });
      return NextResponse.json({
        error: "Could not open conversation",
        code: "missing_thread_id",
        step: "returned_payload"
      }, { status: 500 });
    }

    console.info("[messages] create_thread_succeeded", {
      actorUserId: user.id,
      actorRole: user.role,
      threadId: payload.thread.id,
      ...describeCreateThreadTarget(parsed.data)
    });
    return NextResponse.json({
      ...payload,
      threadId: payload.thread.id,
      created: false
    }, { status: 201 });
  } catch (error) {
    const diagnostics = getErrorDiagnostics(error);
    const describedTarget = parsedInput ? describeCreateThreadTarget(parsedInput) : {
      threadType: null,
      targetType: null,
      targetId: null,
      locationId: null
    };
    console.warn("[messages] create_thread_failed", {
      route: "/api/messages/threads",
      actorUserId: user?.id ?? null,
      actorRole: user?.role ?? null,
      threadType: describedTarget.threadType,
      targetType: describedTarget.targetType,
      targetIdKind: getTargetIdKind(parsedInput),
      failedStep: error instanceof MessagingServiceError ? error.step : "unexpected",
      supabaseCode: diagnostics?.supabaseCode ?? null,
      supabaseMessage: diagnostics?.supabaseMessage ?? null,
      supabaseDetails: diagnostics?.supabaseDetails ?? null,
      threadInserted: diagnostics?.threadInserted ?? false,
      participantsInserted: diagnostics?.participantsInserted ?? false,
      systemMessageInserted: diagnostics?.systemMessageInserted ?? false,
      returnedThreadId: diagnostics?.returnedThreadId ?? null,
      diagnostics,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return toErrorResponse(error);
  }
}
