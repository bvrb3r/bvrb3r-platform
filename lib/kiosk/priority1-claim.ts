import { getCurrentUserFromServer } from "@/lib/auth/session";
import {
  PriorityOneActivationError,
  type PriorityOneActivationClaimResult,
  normalizePhoneForPriorityOneAuth,
  normalizePriorityOneUsername,
  priorityOneActivationAdmin,
  readPriorityOneActivation,
} from "@/lib/kiosk/priority1-provisional";

async function loadClaimable(rawToken: string) {
  const read = await readPriorityOneActivation(rawToken);
  if (read.status !== "claimable") {
    throw new PriorityOneActivationError(
      read.status === "expired"
        ? "This activation link expired."
        : read.status === "already_used"
          ? "This activation link was already used."
          : "This activation link is invalid.",
      read.status === "expired"
        ? 410
        : read.status === "already_used"
          ? 409
          : 404,
      `activation_${read.status}`,
    );
  }
  const supabase = priorityOneActivationAdmin();
  const activation = await supabase
    .from("kiosk_account_activations")
    .select(
      "id, provisional_client_id, guest_visit_id, client_bridge_invitation_id, status, expires_at",
    )
    .eq("id", read.activationId)
    .maybeSingle();
  if (activation.error || !activation.data)
    throw new PriorityOneActivationError(
      "This activation link is invalid.",
      404,
      "activation_invalid",
    );
  const provisional = await supabase
    .from("kiosk_provisional_clients")
    .select(
      "id, client_id, shop_id, full_name, phone, email, marketing_consent, transactional_sms_consent, transactional_email_consent, terms_version, privacy_version, shop_policy_version, source_attribution",
    )
    .eq("id", activation.data.provisional_client_id)
    .maybeSingle();
  if (provisional.error || !provisional.data)
    throw new PriorityOneActivationError(
      "The provisional account could not be found.",
      404,
      "provisional_client_missing",
    );
  return { read, activation: activation.data, provisional: provisional.data };
}

async function linkActivationToProfile(input: {
  rawToken: string;
  profileId: string;
  authUserId: string;
  username: string;
  favoriteBarberId?: string | null;
  followShop?: boolean;
}) {
  const { read, activation, provisional } = await loadClaimable(input.rawToken);
  const supabase = priorityOneActivationAdmin();
  const username = normalizePriorityOneUsername(input.username);

  const usernameClaim = await supabase.rpc("claim_public_username", {
    p_owner_type: "client",
    p_owner_id: input.profileId,
    p_new_username: username,
    p_changed_by_profile_id: input.profileId,
    p_source: "client_bridge_activation",
  });
  if (usernameClaim.error) {
    throw new PriorityOneActivationError(
      usernameClaim.error.message?.includes("username_taken")
        ? "That username is already taken."
        : "Unable to claim that username.",
      usernameClaim.error.message?.includes("username_taken") ? 409 : 500,
      usernameClaim.error.message?.includes("username_taken")
        ? "username_taken"
        : "username_claim_failed",
    );
  }

  const existingClient = await supabase
    .from("clients")
    .select("id, reference_code")
    .eq("profile_id", input.profileId)
    .maybeSingle();
  if (existingClient.error)
    throw new PriorityOneActivationError(
      "Unable to link the client account.",
      500,
      "client_link_lookup_failed",
    );
  let canonicalClientId = provisional.client_id as string;
  if (existingClient.data) {
    canonicalClientId = existingClient.data.id;
    await Promise.all([
      supabase
        .from("appointments")
        .update({ client_id: canonicalClientId })
        .eq("client_id", provisional.client_id),
      supabase
        .from("walk_in_queue")
        .update({ client_id: canonicalClientId })
        .eq("client_id", provisional.client_id),
      supabase
        .from("kiosk_guest_visits")
        .update({
          client_id: canonicalClientId,
          profile_id: input.profileId,
          updated_at: new Date().toISOString(),
        })
        .eq("client_id", provisional.client_id),
    ]);
    await supabase
      .from("kiosk_provisional_clients")
      .update({ merged_into_client_id: canonicalClientId })
      .eq("id", provisional.id);
  } else {
    const linkedClient = await supabase
      .from("clients")
      .update({ profile_id: input.profileId })
      .eq("id", provisional.client_id);
    if (linkedClient.error)
      throw new PriorityOneActivationError(
        "Unable to connect the account to its visit history.",
        500,
        "client_link_failed",
      );
  }

  const now = new Date().toISOString();
  const profileUpdate = await supabase
    .from("profiles")
    .update({
      role: "client_user",
      full_name: provisional.full_name,
      email: provisional.email,
      phone: provisional.phone,
      public_username: username,
      primary_onboarding_role: "client",
      onboarding_state: "active",
      phone_verified_at: read.channel === "sms" ? now : null,
      last_onboarded_at: now,
      updated_at: now,
    })
    .eq("id", input.profileId);
  if (profileUpdate.error)
    throw new PriorityOneActivationError(
      "Unable to complete the client profile.",
      500,
      "profile_activation_failed",
    );

  const privacy = await supabase.from("privacy_preferences").upsert(
    {
      profile_id: input.profileId,
      role: "client",
      preferences: {
        transactional_sms: Boolean(provisional.transactional_sms_consent),
        transactional_email: Boolean(provisional.transactional_email_consent),
        source: "priority1_activation",
      },
      public_profile_visibility: "public",
      follow_visibility: "public",
      saved_items_visibility: "private",
      activity_visibility: "private",
      marketing_consent: Boolean(provisional.marketing_consent),
      updated_at: now,
    },
    { onConflict: "profile_id,role" },
  );
  if (privacy.error)
    throw new PriorityOneActivationError(
      "Unable to save privacy choices.",
      500,
      "privacy_preferences_failed",
    );

  const acceptanceRows = [
    {
      document_key: "terms",
      document_version: provisional.terms_version ?? "current",
    },
    {
      document_key: "privacy",
      document_version: provisional.privacy_version ?? "current",
    },
    {
      document_key: "booking_policy",
      document_version: provisional.shop_policy_version ?? "current",
    },
  ].map((record) => ({
    user_id: input.profileId,
    role: "client",
    ...record,
    accepted_at: now,
    user_agent: "client_bridge_activation",
  }));
  const acceptance = await supabase
    .from("compliance_acceptances")
    .upsert(acceptanceRows, {
      onConflict: "user_id,document_key,document_version",
      ignoreDuplicates: true,
    });
  if (acceptance.error)
    throw new PriorityOneActivationError(
      "Unable to save legal acceptance evidence.",
      500,
      "legal_acceptance_failed",
    );

  if (input.favoriteBarberId) {
    await supabase
      .from("clients")
      .update({ favorite_barber_id: input.favoriteBarberId })
      .eq("id", canonicalClientId);
    const barber = await supabase
      .from("barbers")
      .select("id, reference_code, profile_id")
      .eq("id", input.favoriteBarberId)
      .maybeSingle();
    const barberProfile = barber.data?.profile_id
      ? await supabase
          .from("profiles")
          .select("email")
          .eq("id", barber.data.profile_id)
          .maybeSingle()
      : { data: null };
    if (barber.data && barberProfile.data?.email) {
      await supabase.from("barber_follows").upsert(
        {
          client_reference: canonicalClientId,
          client_email: provisional.email,
          barber_reference: barber.data.reference_code ?? barber.data.id,
          barber_email: barberProfile.data.email,
          notify_on_availability: true,
          notify_on_portfolio: true,
        },
        { onConflict: "client_reference,barber_reference" },
      );
    }
  }

  await Promise.all([
    supabase
      .from("kiosk_provisional_clients")
      .update({
        status: "claimed",
        claimed_profile_id: input.profileId,
        claimed_at: now,
        updated_at: now,
      })
      .eq("id", provisional.id),
    supabase
      .from("kiosk_account_activations")
      .update({
        status: "used",
        used_at: now,
        claimed_auth_user_id: input.authUserId,
        claimed_profile_id: input.profileId,
        updated_at: now,
      })
      .eq("id", activation.id),
    activation.guest_visit_id
      ? supabase
          .from("kiosk_guest_visits")
          .update({
            profile_id: input.profileId,
            client_id: canonicalClientId,
            identity_state: "verified_bvrb3r_client",
            updated_at: now,
          })
          .eq("id", activation.guest_visit_id)
      : Promise.resolve({ error: null }),
    activation.client_bridge_invitation_id
      ? supabase
          .from("client_bridge_invitations")
          .update({
            status: "activated",
            activated_at: now,
            client_id: canonicalClientId,
            profile_id: input.profileId,
            updated_at: now,
          })
          .eq("id", activation.client_bridge_invitation_id)
      : Promise.resolve({ error: null }),
  ]);

  await supabase.from("platform_events").insert({
    event_type: "client_bridge_account_activated",
    entity_type: "profile",
    entity_id: input.profileId,
    actor_id: input.profileId,
    actor_role: "client_user",
    source: "client_bridge_activation",
    related_ids: {
      client_id: canonicalClientId,
      provisional_client_id: provisional.id,
      activation_id: activation.id,
      shop_id: provisional.shop_id,
    },
    payload: {
      public_username: username,
      favorite_barber_id: input.favoriteBarberId ?? null,
      follow_shop: Boolean(input.followShop),
      source_attribution: provisional.source_attribution,
    },
    idempotency_key: `client-activated:${activation.id}`,
    occurred_at: now,
  });

  return {
    profileId: input.profileId,
    clientId: canonicalClientId,
    publicUsername: username,
  };
}

export async function claimPriorityOneActivationWithPassword(input: {
  rawToken: string;
  password: string;
  username: string;
  favoriteBarberId?: string | null;
  followShop?: boolean;
}): Promise<PriorityOneActivationClaimResult> {
  if (input.password.length < 10)
    throw new PriorityOneActivationError(
      "Use at least 10 characters for your password.",
      400,
      "password_too_short",
    );
  const { read, provisional } = await loadClaimable(input.rawToken);
  const supabase = priorityOneActivationAdmin();

  const createPayload = {
    email: provisional.email,
    phone: normalizePhoneForPriorityOneAuth(provisional.phone),
    password: input.password,
    email_confirm: read.channel === "email",
    phone_confirm: read.channel === "sms",
    user_metadata: {
      role: "client_user",
      full_name: provisional.full_name,
      phone: provisional.phone,
    },
  };
  const auth = await supabase.auth.admin.createUser(createPayload);
  if (auth.error || !auth.data.user) {
    const duplicate = /already|registered|exists/i.test(
      auth.error?.message ?? "",
    );
    if (duplicate)
      return {
        status: "existing_account_requires_sign_in",
        redirectTo: `/login?redirect=${encodeURIComponent(`/join/${input.rawToken}`)}`,
      };
    throw new PriorityOneActivationError(
      auth.error?.message ?? "Unable to create the secure account.",
      500,
      "auth_user_create_failed",
    );
  }

  try {
    const linked = await linkActivationToProfile({
      rawToken: input.rawToken,
      profileId: auth.data.user.id,
      authUserId: auth.data.user.id,
      username: input.username,
      favoriteBarberId: input.favoriteBarberId,
      followShop: input.followShop,
    });
    return {
      status: "activated",
      loginMethod: read.channel === "sms" ? "phone" : "email",
      loginIdentifier:
        read.channel === "sms" ? provisional.phone : provisional.email,
      redirectTo: "/dashboard/client",
      ...linked,
    };
  } catch (error) {
    await supabase.auth.admin.deleteUser(auth.data.user.id).catch(() => null);
    throw error;
  }
}

export async function claimPriorityOneActivationForSignedInUser(input: {
  rawToken: string;
  username: string;
  favoriteBarberId?: string | null;
  followShop?: boolean;
}): Promise<PriorityOneActivationClaimResult> {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return {
      status: "existing_account_requires_sign_in",
      redirectTo: `/login?redirect=${encodeURIComponent(`/join/${input.rawToken}`)}`,
    };
  }
  if (session.user.role !== "client_user")
    throw new PriorityOneActivationError(
      "Open this activation link from a Client account.",
      403,
      "activation_client_role_required",
    );
  const linked = await linkActivationToProfile({
    rawToken: input.rawToken,
    profileId: session.user.id,
    authUserId: session.user.id,
    username: input.username,
    favoriteBarberId: input.favoriteBarberId,
    followShop: input.followShop,
  });
  return { status: "activated", redirectTo: "/dashboard/client", ...linked };
}
