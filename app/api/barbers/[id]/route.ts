import { NextResponse } from "next/server";
import { readPublicBarberProfile } from "@/lib/marketplace/public-read-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const identifier = id.trim();

  if (!identifier || identifier.length > 160) {
    return NextResponse.json({ error: "Invalid Barber identifier." }, { status: 400 });
  }

  try {
    const payload = await readPublicBarberProfile(identifier);
    if (!payload) {
      return NextResponse.json(
        { error: "Barber profile not found.", code: "barber_profile_not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json(payload);
  } catch {
    console.error("[barbers-api] public profile unavailable", {
      reference: "public_barber_profile_load_failed"
    });
    return NextResponse.json(
      { error: "Barber profile is temporarily unavailable.", code: "public_barber_profile_load_failed" },
      { status: 500 }
    );
  }
}
