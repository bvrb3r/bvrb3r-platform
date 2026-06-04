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
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load messaging.";
  return NextResponse.json({ error: message }, { status: 500 });
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
      return NextResponse.json({ error: "Couldn't open conversation. Try again." }, { status: 500 });
    }

    console.info("[messages] create_thread_succeeded", {
      actorUserId: user.id,
      actorRole: user.role,
      threadId: payload.thread.id,
      ...describeCreateThreadTarget(parsed.data)
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.warn("[messages] create_thread_failed", {
      actorUserId: user?.id ?? null,
      actorRole: user?.role ?? null,
      ...(parsedInput ? describeCreateThreadTarget(parsedInput) : {
        threadType: null,
        targetType: null,
        targetId: null,
        locationId: null
      }),
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return toErrorResponse(error);
  }
}
