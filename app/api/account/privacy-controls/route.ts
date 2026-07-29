import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  getPr27PrivacySnapshot,
  ProductPr27ServiceError,
  requestPr27AccountExport,
  requestPr27DeletionChallenge,
  schedulePr27AccountDeletion,
  setPr27AccountDeactivated
} from "@/lib/trust/product-pr27-service";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request_export") }),
  z.object({ action: z.literal("deactivate") }),
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("request_deletion_challenge") }),
  z.object({
    action: z.literal("schedule_deletion"),
    typedConfirmation: z.string().max(100),
    submittedChallenge: z.string().trim().min(3).max(32)
  })
]);

function errorResponse(error: unknown) {
  if (error instanceof ProductPr27ServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "Unable to update account privacy." }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await getPr27PrivacySnapshot(await getSessionUser()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid account privacy action." }, { status: 400 });
    }

    switch (parsed.data.action) {
      case "request_export":
        return NextResponse.json(await requestPr27AccountExport(user), { status: 202 });
      case "deactivate":
        return NextResponse.json(await setPr27AccountDeactivated(user, true));
      case "restore":
        return NextResponse.json(await setPr27AccountDeactivated(user, false));
      case "request_deletion_challenge":
        return NextResponse.json(await requestPr27DeletionChallenge(user));
      case "schedule_deletion":
        return NextResponse.json(await schedulePr27AccountDeletion(user, parsed.data), { status: 202 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
