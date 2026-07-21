import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PriorityOneIdentityError,
  searchPriorityOneClientIdentity,
} from "@/lib/kiosk/priority1-identity";

const schema = z.object({
  method: z.enum(["username", "phone", "email"]),
  value: z.string().trim().min(2).max(160),
});

function respond(error: unknown) {
  if (error instanceof PriorityOneIdentityError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "Unable to search BVRB3R Client accounts.", code: "identity_search_failed" },
    { status: 500 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid username, phone, or email.", code: "identity_search_invalid" },
        { status: 400 },
      );
    }
    const candidates = await searchPriorityOneClientIdentity({
      shopId,
      ...parsed.data,
    });
    return NextResponse.json({ candidates });
  } catch (error) {
    return respond(error);
  }
}
