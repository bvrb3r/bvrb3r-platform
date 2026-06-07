import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { toPublicMediaUrl } from "@/lib/profile/public-media-url";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type PublicClientProfileRow = {
  id: string;
  full_name: string | null;
  public_username: string | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
  public_city: string | null;
  public_state: string | null;
};

type ClientRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

export type KioskClientCaptureInput = {
  fullName: string;
  phone: string;
  email?: string;
  publicUsername?: string;
  selectedProfileId?: string;
  source?: "barber_kiosk" | "shop_kiosk";
};

export type KioskClientIdentity = {
  profileId: string;
  clientId: string;
  clientReference: string;
  fullName: string;
  phone: string;
  email: string;
  publicUsername?: string;
  created: boolean;
  activationInviteQueued: boolean;
};

export class KioskClientCaptureError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "kiosk_client_capture_error") {
    super(message);
    this.name = "KioskClientCaptureError";
    this.status = status;
    this.code = code;
  }
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeKioskPublicUsername(value?: string | null) {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() ?? "";
  return normalized || null;
}

function validateKioskUsername(value?: string | null) {
  const username = normalizeKioskPublicUsername(value);
  if (!username) {
    return null;
  }

  if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
    throw new KioskClientCaptureError("Choose a username with 3-30 letters, numbers, underscores, or hyphens.", 400, "invalid_username");
  }

  if (["admin", "support", "bvrb3r", "help", "payments", "system", "official", "login", "signup", "dashboard", "api", "client", "barber", "shop", "owner", "architect", "settings", "profile", "public"].includes(username)) {
    throw new KioskClientCaptureError("That username is reserved.", 409, "reserved_username");
  }

  return username;
}

function guestEmail(input: { fullName: string; phone: string; email?: string }) {
  const provided = cleanText(input.email)?.toLowerCase();
  if (provided) {
    return provided;
  }

  const slug = input.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest";
  return `${slug}-${normalizePhone(input.phone) || randomUUID().slice(0, 8)}@guest.bvrb3r.local`;
}

function publicResult(row: PublicClientProfileRow, supabase: SupabaseClient | null) {
  const username = cleanText(row.public_username);
  return {
    profileId: row.id,
    displayName: cleanText(row.full_name) ?? (username ? `@${username}` : "BVRB3R Client"),
    publicUsername: username,
    avatarUrl: toPublicMediaUrl(supabase, row.profile_photo_path, row.profile_photo_url),
    locationLabel: [row.public_city, row.public_state].map(cleanText).filter(Boolean).join(", "),
    roleLabel: "CLIENT" as const
  };
}

export async function searchKioskClientProfiles(query: string) {
  const supabase = getSupabase();
  const normalized = normalizeKioskPublicUsername(query);
  if (!supabase || !normalized || normalized.length < 2) {
    return [];
  }

  const result = await supabase
    .from("profiles")
    .select("id, full_name, public_username, profile_photo_path, profile_photo_url, public_city, public_state")
    .eq("role", "client_user")
    .ilike("public_username", `%${normalized}%`)
    .limit(8);

  if (result.error) {
    throw new KioskClientCaptureError("Unable to search client profiles.", 500, "client_search_failed");
  }

  return ((result.data ?? []) as PublicClientProfileRow[])
    .filter((row) => cleanText(row.public_username))
    .map((row) => publicResult(row, supabase));
}

async function readClientByProfileId(supabase: SupabaseClient, profileId: string) {
  const result = await supabase
    .from("clients")
    .select("id, reference_code, profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (result.error) {
    throw new KioskClientCaptureError("Unable to resolve the selected client.", 500, "client_lookup_failed");
  }

  return (result.data ?? null) as ClientRow | null;
}

async function ensureClientRow(supabase: SupabaseClient, profileId: string, preferredReference?: string | null) {
  const existing = await readClientByProfileId(supabase, profileId);
  if (existing) {
    return existing;
  }

  const referenceCode = preferredReference ?? `client-kiosk-${randomUUID().slice(0, 8)}`;
  const insertResult = await supabase
    .from("clients")
    .insert({
      id: randomUUID(),
      profile_id: profileId,
      reference_code: referenceCode,
      loyalty_points: 0,
      retention_tag: "new"
    })
    .select("id, reference_code, profile_id")
    .single();

  if (insertResult.error) {
    throw new KioskClientCaptureError("Unable to create the kiosk client record.", 500, "client_create_failed");
  }

  return insertResult.data as ClientRow;
}

async function claimUsername(supabase: SupabaseClient, profileId: string, username?: string | null) {
  const normalized = validateKioskUsername(username);
  if (!normalized) {
    return undefined;
  }

  const registryResult = await supabase.rpc("claim_public_username", {
    p_owner_type: "client",
    p_owner_id: profileId,
    p_new_username: normalized,
    p_changed_by_profile_id: profileId,
    p_source: "kiosk"
  });

  if (registryResult.error) {
    throw new KioskClientCaptureError(
      registryResult.error.message?.includes("username_taken") ? "That username is already taken." : "Unable to reserve that username.",
      registryResult.error.message?.includes("username_taken") ? 409 : 500,
      registryResult.error.message?.includes("username_taken") ? "username_taken" : "username_claim_failed"
    );
  }

  const profileUpdate = await supabase
    .from("profiles")
    .update({ public_username: normalized })
    .eq("id", profileId);

  if (profileUpdate.error) {
    throw new KioskClientCaptureError("Unable to save the public username.", 500, "username_profile_update_failed");
  }

  return normalized;
}

async function duplicateProfile(supabase: SupabaseClient, input: { phone: string; email: string }) {
  const normalizedPhone = normalizePhone(input.phone);
  const result = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, public_username")
    .eq("role", "client_user")
    .or(`email.eq.${input.email},phone.eq.${input.phone}`);

  if (result.error) {
    throw new KioskClientCaptureError("Unable to check existing client profiles.", 500, "duplicate_check_failed");
  }

  return ((result.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; phone: string | null; public_username: string | null }>)
    .find((row) => normalizePhone(row.phone ?? "") === normalizedPhone || row.email?.toLowerCase() === input.email.toLowerCase()) ?? null;
}

export async function resolveOrCreateKioskClient(input: KioskClientCaptureInput): Promise<KioskClientIdentity | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const fullName = cleanText(input.fullName);
  const phone = cleanText(input.phone);
  if (!fullName || !phone) {
    throw new KioskClientCaptureError("Client name and phone are required.", 400, "missing_client_contact");
  }

  if (input.selectedProfileId) {
    const profileResult = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, public_username")
      .eq("id", input.selectedProfileId)
      .eq("role", "client_user")
      .maybeSingle();

    if (profileResult.error || !profileResult.data) {
      throw new KioskClientCaptureError("Selected client profile could not be found.", 404, "selected_profile_not_found");
    }

    const client = await ensureClientRow(supabase, profileResult.data.id as string);
    return {
      profileId: profileResult.data.id as string,
      clientId: client.id,
      clientReference: client.reference_code ?? client.id,
      fullName: (profileResult.data.full_name as string | null) ?? fullName,
      phone: (profileResult.data.phone as string | null) ?? phone,
      email: (profileResult.data.email as string | null) ?? guestEmail({ fullName, phone }),
      publicUsername: (profileResult.data.public_username as string | null) ?? undefined,
      created: false,
      activationInviteQueued: false
    };
  }

  const email = guestEmail({ fullName, phone, email: input.email });
  const duplicate = await duplicateProfile(supabase, { phone, email });
  if (duplicate) {
    const client = await ensureClientRow(supabase, duplicate.id);
    return {
      profileId: duplicate.id,
      clientId: client.id,
      clientReference: client.reference_code ?? client.id,
      fullName: duplicate.full_name ?? fullName,
      phone: duplicate.phone ?? phone,
      email: duplicate.email ?? email,
      publicUsername: duplicate.public_username ?? undefined,
      created: false,
      activationInviteQueued: false
    };
  }

  const profileId = randomUUID();
  const profileInsert = await supabase
    .from("profiles")
    .insert({
      id: profileId,
      role: "client_user",
      full_name: fullName,
      email,
      phone
    })
    .select("id")
    .single();

  if (profileInsert.error) {
    throw new KioskClientCaptureError("Unable to create the kiosk client profile.", 500, "profile_create_failed");
  }

  const client = await ensureClientRow(supabase, profileId);
  const publicUsername = await claimUsername(supabase, profileId, input.publicUsername);

  return {
    profileId,
    clientId: client.id,
    clientReference: client.reference_code ?? client.id,
    fullName,
    phone,
    email,
    publicUsername,
    created: true,
    activationInviteQueued: Boolean(email)
  };
}
