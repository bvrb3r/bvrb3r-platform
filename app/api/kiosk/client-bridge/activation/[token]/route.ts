import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PriorityOneActivationError,
  readPriorityOneActivation,
} from "@/lib/kiosk/priority1-provisional";
import {
  claimPriorityOneActivationForSignedInUser,
  claimPriorityOneActivationWithPassword,
} from "@/lib/kiosk/priority1-claim";

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("password"),
    password: z.string().min(10).max(200),
    username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._]+$/),
    favoriteBarberId: z.string().uuid().nullish(),
    followShop: z.boolean().optional(),
    termsAccepted: z.literal(true),
    privacyAccepted: z.literal(true),
  }),
  z.object({
    mode: z.literal("signed_in"),
    username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._]+$/),
    favoriteBarberId: z.string().uuid().nullish(),
    followShop: z.boolean().optional(),
    termsAccepted: z.literal(true),
    privacyAccepted: z.literal(true),
  }),
]);

function respond(error: unknown) {
  if (error instanceof PriorityOneActivationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "Unable to activate this BVRB3R account.", code: "activation_failed" },
    { status: 500 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    return NextResponse.json(await readPriorityOneActivation(token));
  } catch (error) {
    return respond(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Choose a username, accept Terms and Privacy, and finish account security.",
          code: "activation_payload_invalid",
        },
        { status: 400 },
      );
    }
    const common = {
      rawToken: token,
      username: parsed.data.username,
      favoriteBarberId: parsed.data.favoriteBarberId ?? null,
      followShop: parsed.data.followShop,
    };
    const result =
      parsed.data.mode === "password"
        ? await claimPriorityOneActivationWithPassword({
            ...common,
            password: parsed.data.password,
          })
        : await claimPriorityOneActivationForSignedInUser(common);
    return NextResponse.json(result);
  } catch (error) {
    return respond(error);
  }
}
