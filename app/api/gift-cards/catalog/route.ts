import { NextResponse } from "next/server";
import { GiftCardServiceError, readGiftCardScopeCatalog } from "@/lib/gift-cards/service";

export async function GET() {
  try {
    return NextResponse.json({ catalog: await readGiftCardScopeCatalog() });
  } catch (error) {
    if (error instanceof GiftCardServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Gift card destinations could not be loaded." }, { status: 500 });
  }
}
