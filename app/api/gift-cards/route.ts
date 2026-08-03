import { NextResponse } from "next/server";
import { AuthorizationError, requireVerifiedActor } from "@/lib/auth/permissions";
import { GiftCardServiceError, readGiftCardWallet } from "@/lib/gift-cards/service";

export async function GET() {
  try {
    const actor = await requireVerifiedActor();
    const wallet = await readGiftCardWallet(actor.user.id);
    return NextResponse.json({ wallet });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof GiftCardServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Gift balance could not be loaded." }, { status: 500 });
  }
}
