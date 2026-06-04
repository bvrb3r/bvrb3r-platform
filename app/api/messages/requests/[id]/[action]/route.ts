import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { MessagingServiceError, updateMessageThreadRequest } from "@/lib/messages/service";

const actionSchema = z.enum(["accept", "decline", "block", "report"]);

const bodySchema = z.object({
  reason: z.string().trim().optional(),
  details: z.string().trim().optional()
}).optional();

function toErrorResponse(error: unknown) {
  if (error instanceof MessagingServiceError) {
    return NextResponse.json({ error: error.message, code: error.code, step: error.step }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to update message request.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    const user = await getSessionUser();
    const params = await context.params;
    const action = actionSchema.parse(params.action);
    const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid message request payload." }, { status: 400 });
    }

    const payload = await updateMessageThreadRequest(user, params.id, action, parsedBody.data ?? {});
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid message request action." }, { status: 400 });
    }

    return toErrorResponse(error);
  }
}
