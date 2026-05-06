import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { publishBarberMarketplaceReadiness } from "@/lib/marketplace/publishing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const RESERVED_USERNAMES = new Set([
  "admin",
  "architect",
  "owner",
  "shop",
  "barber",
  "checkout",
  "api",
  "dashboard",
  "login",
  "signup",
  "support",
  "settings"
]);

const schema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/)
});

function toError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!(user.role === "commission_barber" || user.role === "booth_rent_barber") || !user.barberId) {
    return toError("Only barbers can update a public username.", 403);
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return toError("Use 3-32 lowercase letters, numbers, hyphens, or underscores.");
  }

  const username = parsed.data.username;
  if (RESERVED_USERNAMES.has(username)) {
    return toError("That username is reserved.");
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return toError("Profile updates are unavailable without Supabase.", 503);
  }

  const existing = await supabase
    .from("barber_profiles")
    .select("barber_reference, username")
    .eq("username", username)
    .maybeSingle();

  if (existing.error) {
    return toError("Unable to check username availability.", 500);
  }

  const existingOwner = (existing.data as { barber_reference?: string | null } | null)?.barber_reference;
  if (existingOwner && existingOwner !== user.barberId) {
    return toError("That username is already taken.", 409);
  }

  const upsert = await supabase
    .from("barber_profiles")
    .upsert({
      barber_reference: user.barberId,
      barber_email: user.email,
      username,
      display_name: user.name,
      updated_at: new Date().toISOString()
    }, { onConflict: "barber_reference" });

  if (upsert.error) {
    return toError("Unable to save public username.", 500);
  }

  await supabase.from("barbers").update({ booking_slug: username }).eq("reference_code", user.barberId);
  await supabase.from("barbers").update({ booking_slug: username }).eq("id", user.barberId);
  await publishBarberMarketplaceReadiness(supabase, user.barberId);

  return NextResponse.json({ username, profileHref: `/barber/${username}` });
}
