import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { isBarberRole, isShopRole } from "@/lib/messages/domain";
import { createMessagingThread, getMessagingInboxPayload, MessagingServiceError } from "@/lib/messages/service";

const createThreadSchema = z.union([
  z.object({
    appointmentId: z.string().trim().min(1)
  }),
  z.object({
    threadType: z.enum(["client_shop", "barber_shop"]),
    profileId: z.string().trim().min(1),
    locationId: z.string().trim().min(1)
  })
]);

function isSupportedMessagingRole(role: Awaited<ReturnType<typeof getSessionUser>>["role"]) {
  return role === "client" || isBarberRole(role) || isShopRole(role);
}

function toErrorResponse(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load messaging.";
  return NextResponse.json({ error: message }, { status: 500 });
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
  try {
    const user = await getSessionUser();
    const parsed = createThreadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid thread creation payload." }, { status: 400 });
    }

    const payload = await createMessagingThread(user, parsed.data);

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
