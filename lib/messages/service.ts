import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBarberReportTarget } from "@/lib/trust/report-targets";
import { CANONICAL_PLATFORM_ADMIN_EMAIL } from "@/lib/auth/demo-auth";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import {
  assertActorCanCreateClientBarberThread,
  assertActorCanCreateShopThread,
  buildAppointmentThreadSystemMessage,
  buildShopThreadSystemMessage,
  buildSupportThreadSystemMessage,
  isBarberRole,
  isShopRole,
  normalizeMessageBody,
  type MessagingMessageType,
  type MessagingThreadType
} from "@/lib/messages/domain";
import { isClientRole } from "@/lib/auth/roles";
import type { AppointmentStatus, Role, UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: Role;
};

type ClientRow = {
  id: string;
  profile_id: string | null;
};

type BarberRow = {
  id: string;
  profile_id: string;
  reference_code: string | null;
  booking_slug: string | null;
  app_approval_status?: string | null;
  status?: string | null;
  is_bookable?: boolean | null;
  is_discoverable?: boolean | null;
};

type BarberPublicProfileRow = {
  barber_reference: string;
  username: string | null;
  display_name: string | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
  visibility_state?: string | null;
};

type StaffLocationRow = {
  location_id: string;
  profile_id: string;
};

type AppointmentRow = {
  id: string;
  reference_code: string | null;
  confirmation_code: string | null;
  status: AppointmentStatus;
  starts_at: string;
  client_id: string;
  barber_id: string;
  service_id: string;
  location_id: string;
};

type ServiceRow = {
  id: string;
  name: string;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
};

type MessageThreadRow = {
  id: string;
  thread_type: MessagingThreadType;
  appointment_id: string | null;
  location_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile_id: string | null;
};

type ThreadParticipantRow = {
  id: string;
  thread_id: string;
  profile_id: string;
  thread_role: Role;
  created_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_profile_id: string | null;
  body: string;
  message_type: MessagingMessageType;
  created_at: string;
};

type MessagingActorContext = {
  profile: ProfileRow;
  kind: "client" | "barber" | "shop";
  clientId?: string;
  barberId?: string;
  locationIds?: string[];
};

type HydratedAppointmentContext = {
  appointmentId: string;
  confirmationCode: string | null;
  status: AppointmentStatus;
  statusLabel: string;
  startsAt: string;
  serviceName: string;
  locationId: string;
  locationLabel: string;
  clientProfileId: string;
  barberProfileId: string;
  clientName: string;
  barberName: string;
  barberRole: Role;
  barberAvatarUrl: string | null;
  barberPublicProfileHref: string | null;
  barberBookingHref: string | null;
};

type PublicMessagingMetadata = {
  avatarUrl: string | null;
  publicProfileHref: string | null;
  bookingHref: string | null;
};

export type MessagingThreadParticipantView = {
  profileId: string;
  fullName: string;
  role: Role;
  isSelf: boolean;
  avatarUrl?: string | null;
  publicProfileHref?: string | null;
  bookingHref?: string | null;
};

export type MessagingMessageView = {
  id: string;
  body: string;
  messageType: MessagingMessageType;
  createdAt: string;
  senderName: string | null;
  senderRole: Role | null;
  isOwn: boolean;
};

export type MessagingThreadSummary = {
  id: string;
  threadType: MessagingThreadType;
  appointmentId: string | null;
  locationId: string | null;
  locationContext: {
    locationId: string;
    locationLabel: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  counterpart: {
    profileId: string;
    fullName: string;
    role: Role;
    avatarUrl?: string | null;
    publicProfileHref?: string | null;
    bookingHref?: string | null;
  } | null;
  appointmentContext: {
    appointmentId: string;
    confirmationCode: string | null;
    status: AppointmentStatus;
    statusLabel: string;
    startsAt: string;
    serviceName: string;
    locationLabel: string;
  } | null;
  lastMessage: {
    id: string;
    body: string;
    messageType: MessagingMessageType;
    createdAt: string;
    senderName: string | null;
  } | null;
};

export type MessagingInboxCandidate = {
  kind: "appointment";
  appointmentId: string;
  counterpart: {
    profileId: string;
    fullName: string;
    role: Role;
    avatarUrl?: string | null;
    publicProfileHref?: string | null;
    bookingHref?: string | null;
  };
  appointmentContext: {
    appointmentId: string;
    confirmationCode: string | null;
    status: AppointmentStatus;
    statusLabel: string;
    startsAt: string;
    serviceName: string;
    locationLabel: string;
  };
};

export type MessagingParticipantSearchResult = {
  id: string;
  participantId: string;
  displayName: string;
  resultType: "barber" | "shop" | "client" | "support";
  participantType: "barber" | "shop" | "client" | "support";
  role: Role;
  avatarUrl?: string | null;
  publicProfileHref?: string | null;
  profileHref: string | null;
  bookingHref?: string | null;
  existingThreadId?: string | null;
  createThreadInput: MessagingCreateThreadInput;
  subtitle?: string | null;
};

export type MessagingParticipantSearchWarning = {
  branch: "barber" | "shop" | "client" | "support" | "threads";
  message: string;
};

export type MessagingParticipantSearchPayload = {
  results: MessagingParticipantSearchResult[];
  warnings?: MessagingParticipantSearchWarning[];
};

export type MessagingContactCandidate = {
  kind: "contact";
  profileId: string;
  role: Role;
  fullName: string;
  threadType: Extract<MessagingThreadType, "client_shop" | "barber_shop">;
  locationId: string;
  locationLabel: string;
  appointmentContext: MessagingInboxCandidate["appointmentContext"] | null;
};

export type MessagingBroadcastTarget = {
  locationId: string;
  locationLabel: string;
  clientCount: number;
  barberCount: number;
};

export type MessagingInboxPayload = {
  available: boolean;
  viewer: {
    profileId: string | null;
    fullName: string;
    role: Role;
  };
  threads: MessagingThreadSummary[];
  eligibleAppointments: MessagingInboxCandidate[];
  eligibleContacts: MessagingContactCandidate[];
  broadcastTargets: MessagingBroadcastTarget[];
};

export type MessagingThreadPayload = {
  available: boolean;
  viewer: MessagingInboxPayload["viewer"];
  thread: (MessagingThreadSummary & {
    participants: MessagingThreadParticipantView[];
  }) | null;
  messages: MessagingMessageView[];
  relatedAppointmentContexts?: NonNullable<MessagingThreadSummary["appointmentContext"]>[];
};

export type MessagingCreateThreadInput =
  | {
      appointmentId: string;
    }
  | {
      threadType: "client_barber";
      profileId: string;
    }
  | {
      threadType: "support";
    }
  | {
      threadType: Extract<MessagingThreadType, "client_shop" | "barber_shop">;
      profileId: string;
      locationId: string;
    };

export type MessagingBroadcastAudience = "clients" | "barbers" | "all";

export type MessagingBroadcastResult = {
  locationId: string;
  locationLabel: string;
  audience: MessagingBroadcastAudience;
  deliveredCount: number;
  threadIds: string[];
};

export type TrustReportSupportMessageInput = {
  reportId: string;
  subjectType: "client" | "barber" | "shop" | "review" | "booking";
  subjectId: string;
  category: string;
  details: string;
  createdAt?: string;
};

export type TrustReportSupportMessageResult = {
  threadId: string;
  messageId: string;
  createdAt: string;
};

export type ArchitectSupportThreadSummary = MessagingThreadSummary & {
  client: {
    profileId: string;
    fullName: string;
    role: Role;
  } | null;
  reportContext: {
    present: boolean;
    preview: string | null;
  };
  status: "open" | "pending" | "resolved";
};

export type ArchitectSupportInboxPayload = {
  available: boolean;
  viewer: {
    profileId: string | null;
    fullName: string;
    role: Role;
  };
  threads: ArchitectSupportThreadSummary[];
};

export type ArchitectSupportThreadPayload = {
  available: boolean;
  viewer: ArchitectSupportInboxPayload["viewer"];
  thread: (ArchitectSupportThreadSummary & {
    participants: MessagingThreadParticipantView[];
  }) | null;
  messages: MessagingMessageView[];
};

type ThreadBundle = {
  threads: MessageThreadRow[];
  participants: ThreadParticipantRow[];
  messages: MessageRow[];
  profilesById: Map<string, ProfileRow>;
  publicMetadataByProfileId: Map<string, PublicMessagingMetadata>;
  latestMessageByThreadId: Map<string, MessageRow>;
  appointmentContexts: Map<string, HydratedAppointmentContext>;
  locationLabels: Map<string, string>;
};

export class MessagingServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getSupabase() {
  return createSupabaseAdminClient();
}

function isMessagingRole(role: Role) {
  return isClientRole(role) || isBarberRole(role) || isShopRole(role);
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatStatusLabel(status: AppointmentStatus) {
  return status
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatLocationLabel(location: LocationRow) {
  const area = [location.neighborhood, location.city].filter(Boolean).join(" | ");
  return area ? `${location.name} | ${area}` : [location.name, location.state].filter(Boolean).join(" | ");
}

function baseViewer(user: UserAccount, profileId: string | null = null): MessagingInboxPayload["viewer"] {
  return {
    profileId,
    fullName: user.name,
    role: user.role
  };
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ");
}

function searchMatches(value: string | null | undefined, query: string) {
  return Boolean(value?.toLowerCase().includes(query.toLowerCase()));
}

function getThreadSearchKey(thread: MessagingThreadSummary) {
  if (thread.threadType === "support") {
    return `support:${thread.counterpart?.profileId ?? "bvrb3r"}`;
  }

  if (thread.threadType === "client_barber" && thread.counterpart?.profileId) {
    return `barber:${thread.counterpart.profileId}`;
  }

  if (thread.threadType === "client_shop" && thread.locationId) {
    return `shop:${thread.locationId}`;
  }

  return null;
}

function buildExistingThreadLookup(threads: MessagingThreadSummary[]) {
  const lookup = new Map<string, string>();

  for (const thread of threads) {
    const key = getThreadSearchKey(thread);
    if (key && !lookup.has(key)) {
      lookup.set(key, thread.id);
    }
  }

  return lookup;
}

function getPublicProfileMediaUrl(row?: BarberPublicProfileRow | null) {
  return cleanText(row?.profile_photo_url) ?? cleanText(row?.profile_photo_path);
}

function buildBarberMessagingMetadata(barber: BarberRow, publicProfile?: BarberPublicProfileRow | null): PublicMessagingMetadata {
  const barberReference = cleanText(barber.reference_code) ?? cleanText(barber.booking_slug) ?? barber.id;
  const publicSlug = cleanText(publicProfile?.username) ?? cleanText(barber.booking_slug) ?? barberReference;

  return {
    avatarUrl: getPublicProfileMediaUrl(publicProfile),
    publicProfileHref: `/barber/${encodeURIComponent(publicSlug)}`,
    bookingHref: buildMarketplaceBookingHref({
      barberId: barberReference,
      username: publicSlug,
      sourceKind: "client_dashboard"
    })
  };
}

async function readPublicMessagingMetadataByProfileIds(
  supabase: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, PublicMessagingMetadata>> {
  const uniqueProfileIds = unique(profileIds.filter(Boolean));
  if (!uniqueProfileIds.length) {
    return new Map();
  }

  const barberResult = await supabase
    .from("barbers")
    .select("id, profile_id, reference_code, booking_slug")
    .in("profile_id", uniqueProfileIds);

  if (barberResult.error) {
    throw new MessagingServiceError("Unable to resolve barber profile metadata for messaging.", 500);
  }

  const barbers = (barberResult.data ?? []) as BarberRow[];
  if (!barbers.length) {
    return new Map();
  }

  const publicReferenceCandidates = unique(
    barbers.flatMap((barber) => [
      barber.reference_code,
      barber.booking_slug,
      barber.id,
      barber.profile_id
    ]).filter((value): value is string => Boolean(cleanText(value)))
  );
  const publicProfilesResult = publicReferenceCandidates.length
    ? await supabase
        .from("barber_profiles")
        .select("barber_reference, username, display_name, profile_photo_path, profile_photo_url")
        .in("barber_reference", publicReferenceCandidates)
    : { data: [], error: null };

  if (publicProfilesResult.error) {
    throw new MessagingServiceError("Unable to resolve public barber profile metadata for messaging.", 500);
  }

  const publicProfilesByReference = new Map(
    ((publicProfilesResult.data ?? []) as BarberPublicProfileRow[]).map((row) => [row.barber_reference, row])
  );
  const metadataByProfileId = new Map<string, PublicMessagingMetadata>();

  for (const barber of barbers) {
    const publicProfile = [barber.reference_code, barber.booking_slug, barber.id, barber.profile_id]
      .map((value) => (value ? publicProfilesByReference.get(value) ?? null : null))
      .find((row): row is BarberPublicProfileRow => Boolean(row)) ?? null;

    metadataByProfileId.set(barber.profile_id, buildBarberMessagingMetadata(barber, publicProfile));
  }

  return metadataByProfileId;
}

function toAppointmentContextView(context: HydratedAppointmentContext): NonNullable<MessagingThreadSummary["appointmentContext"]> {
  return {
    appointmentId: context.appointmentId,
    confirmationCode: context.confirmationCode,
    status: context.status,
    statusLabel: context.statusLabel,
    startsAt: context.startsAt,
    serviceName: context.serviceName,
    locationLabel: context.locationLabel
  };
}

function shopRolePriority(role: Role) {
  if (role === "front_desk") {
    return 0;
  }
  if (role === "manager") {
    return 1;
  }
  if (isShopRole(role)) {
    return 2;
  }
  return 3;
}

function sortShopProfiles(profiles: ProfileRow[]) {
  return [...profiles].sort((left, right) => {
    const leftPriority = shopRolePriority(left.role);
    const rightPriority = shopRolePriority(right.role);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return (left.full_name ?? left.email).localeCompare(right.full_name ?? right.email);
  });
}

function pickPrimaryShopProfile(profiles: ProfileRow[]) {
  return sortShopProfiles(profiles)[0] ?? null;
}

function buildActorThreadKey(threadType: Extract<MessagingThreadType, "client_shop" | "barber_shop">, locationId: string) {
  return `${threadType}:${locationId}`;
}

function buildShopThreadKey(
  threadType: Extract<MessagingThreadType, "client_shop" | "barber_shop">,
  locationId: string,
  counterpartProfileId: string
) {
  return `${threadType}:${locationId}:${counterpartProfileId}`;
}

async function readProfilesByIds(supabase: SupabaseClient, profileIds: string[]) {
  const uniqueProfileIds = unique(profileIds.filter(Boolean));
  if (!uniqueProfileIds.length) {
    return new Map<string, ProfileRow>();
  }

  const result = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("id", uniqueProfileIds);

  if (result.error) {
    throw new MessagingServiceError("Unable to resolve messaging profiles.", 500);
  }

  return new Map(((result.data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
}

async function readLocationsByValues(supabase: SupabaseClient, values: string[]) {
  const uniqueValues = unique(values.filter(Boolean));
  if (!uniqueValues.length) {
    return {
      rows: [] as LocationRow[],
      byValue: new Map<string, LocationRow>()
    };
  }

  const uuidValues = uniqueValues.filter(isUuidLike);
  const referenceValues = uniqueValues.filter((value) => !isUuidLike(value));
  const [uuidResult, referenceResult] = await Promise.all([
    uuidValues.length
      ? supabase
          .from("locations")
          .select("id, reference_code, name, neighborhood, city, state")
          .in("id", uuidValues)
      : Promise.resolve({ data: [], error: null }),
    referenceValues.length
      ? supabase
          .from("locations")
          .select("id, reference_code, name, neighborhood, city, state")
          .in("reference_code", referenceValues)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (uuidResult.error || referenceResult.error) {
    throw new MessagingServiceError("Unable to resolve shop locations for messaging.", 500);
  }

  const rowById = new Map<string, LocationRow>();
  for (const row of [...((uuidResult.data ?? []) as LocationRow[]), ...((referenceResult.data ?? []) as LocationRow[])]) {
    rowById.set(row.id, row);
  }

  const rows = [...rowById.values()];
  const byValue = new Map<string, LocationRow>();
  for (const row of rows) {
    byValue.set(row.id, row);
    if (row.reference_code) {
      byValue.set(row.reference_code, row);
    }
  }

  return { rows, byValue };
}

async function readShopParticipantsByLocationIds(supabase: SupabaseClient, locationIds: string[]) {
  const uniqueLocationIds = unique(locationIds.filter(Boolean));
  if (!uniqueLocationIds.length) {
    return new Map<string, ProfileRow[]>();
  }

  const membershipResult = await supabase
    .from("staff_locations")
    .select("location_id, profile_id")
    .in("location_id", uniqueLocationIds);

  if (membershipResult.error) {
    throw new MessagingServiceError("Unable to resolve shop messaging participants.", 500);
  }

  const memberships = (membershipResult.data ?? []) as StaffLocationRow[];
  const profilesById = await readProfilesByIds(
    supabase,
    memberships.map((membership) => membership.profile_id)
  );
  const grouped = new Map<string, ProfileRow[]>();

  for (const membership of memberships) {
    const profile = profilesById.get(membership.profile_id);
    if (!profile || !isShopRole(profile.role)) {
      continue;
    }

    const rows = grouped.get(membership.location_id) ?? [];
    rows.push(profile);
    grouped.set(membership.location_id, rows);
  }

  for (const [locationId, profiles] of grouped) {
    grouped.set(locationId, sortShopProfiles(profiles));
  }

  return grouped;
}

async function resolveMessagingActor(user: UserAccount, supabase: SupabaseClient): Promise<MessagingActorContext> {
  if (!isMessagingRole(user.role)) {
    throw new MessagingServiceError("This role cannot use messaging.", 403);
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("email", user.email)
    .maybeSingle();

  if (profileResult.error) {
    throw new MessagingServiceError("Unable to resolve the messaging profile.", 500);
  }

  if (!profileResult.data) {
    throw new MessagingServiceError("No profile is available for messaging.", 404);
  }

  const profile = profileResult.data as ProfileRow;

  if (isClientRole(user.role)) {
    const clientResult = await supabase
      .from("clients")
      .select("id, profile_id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (clientResult.error) {
      throw new MessagingServiceError("Unable to resolve the client account for messaging.", 500);
    }

    if (!clientResult.data) {
      throw new MessagingServiceError("No client account is available for messaging.", 404);
    }

    return {
      profile,
      kind: "client",
      clientId: (clientResult.data as ClientRow).id
    };
  }

  if (isShopRole(user.role)) {
    return {
      profile,
      kind: "shop",
      locationIds: [...user.locationIds]
    };
  }

  const barberResult = await supabase
    .from("barbers")
    .select("id, profile_id, reference_code, booking_slug")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (barberResult.error) {
    throw new MessagingServiceError("Unable to resolve the barber account for messaging.", 500);
  }

  if (!barberResult.data) {
    throw new MessagingServiceError("No barber account is available for messaging.", 404);
  }

  return {
    profile,
    kind: "barber",
    barberId: (barberResult.data as BarberRow).id
  };
}

async function readAppointmentContexts(supabase: SupabaseClient, appointments: AppointmentRow[]) {
  const appointmentMap = new Map<string, HydratedAppointmentContext>();
  if (!appointments.length) {
    return appointmentMap;
  }

  const clientIds = unique(appointments.map((appointment) => appointment.client_id));
  const barberIds = unique(appointments.map((appointment) => appointment.barber_id));
  const serviceIds = unique(appointments.map((appointment) => appointment.service_id));
  const locationIds = unique(appointments.map((appointment) => appointment.location_id));

  const [clientsResult, barbersResult, servicesResult, locationsResult] = await Promise.all([
    supabase.from("clients").select("id, profile_id").in("id", clientIds),
    supabase.from("barbers").select("id, profile_id, reference_code, booking_slug").in("id", barberIds),
    supabase.from("services").select("id, name").in("id", serviceIds),
    supabase.from("locations").select("id, name, neighborhood, city, state").in("id", locationIds)
  ]);

  if (clientsResult.error || barbersResult.error || servicesResult.error || locationsResult.error) {
    throw new MessagingServiceError("Unable to hydrate appointment messaging context.", 500);
  }

  const clientRows = (clientsResult.data ?? []) as ClientRow[];
  const barberRows = (barbersResult.data ?? []) as BarberRow[];
  const serviceRows = (servicesResult.data ?? []) as ServiceRow[];
  const locationRows = (locationsResult.data ?? []) as LocationRow[];
  const profileIds = unique([
    ...clientRows.map((row) => row.profile_id).filter((value): value is string => Boolean(value)),
    ...barberRows.map((row) => row.profile_id)
  ]);
  const profilesResult = await supabase.from("profiles").select("id, full_name, email, role").in("id", profileIds);

  if (profilesResult.error) {
    throw new MessagingServiceError("Unable to hydrate appointment participants.", 500);
  }

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const publicMetadataByProfileId = await readPublicMessagingMetadataByProfileIds(supabase, profileIds);
  const clientsById = new Map(clientRows.map((row) => [row.id, row]));
  const barbersById = new Map(barberRows.map((row) => [row.id, row]));
  const servicesById = new Map(serviceRows.map((row) => [row.id, row]));
  const locationsById = new Map(locationRows.map((row) => [row.id, row]));
  const profilesById = new Map(profiles.map((row) => [row.id, row]));

  for (const appointment of appointments) {
    const client = clientsById.get(appointment.client_id);
    const barber = barbersById.get(appointment.barber_id);
    const service = servicesById.get(appointment.service_id);
    const location = locationsById.get(appointment.location_id);
    const clientProfile = client?.profile_id ? profilesById.get(client.profile_id) : null;
    const barberProfile = barber ? profilesById.get(barber.profile_id) ?? null : null;
    const barberMetadata = barberProfile ? publicMetadataByProfileId.get(barberProfile.id) ?? null : null;

    if (!client || !clientProfile || !barber || !barberProfile || !service || !location) {
      continue;
    }

    appointmentMap.set(appointment.id, {
      appointmentId: appointment.id,
      confirmationCode: appointment.confirmation_code,
      status: appointment.status,
      statusLabel: formatStatusLabel(appointment.status),
      startsAt: appointment.starts_at,
      serviceName: service.name,
      locationId: appointment.location_id,
      locationLabel: formatLocationLabel(location),
      clientProfileId: clientProfile.id,
      barberProfileId: barberProfile.id,
      clientName: clientProfile.full_name ?? clientProfile.email,
      barberName: barberProfile.full_name ?? barberProfile.email,
      barberRole: barberProfile.role,
      barberAvatarUrl: barberMetadata?.avatarUrl ?? null,
      barberPublicProfileHref: barberMetadata?.publicProfileHref ?? null,
      barberBookingHref: barberMetadata?.bookingHref ?? null
    });
  }

  return appointmentMap;
}

function buildThreadSummary(input: {
  thread: MessageThreadRow;
  currentProfileId: string;
  participants: ThreadParticipantRow[];
  profilesById: Map<string, ProfileRow>;
  publicMetadataByProfileId: Map<string, PublicMessagingMetadata>;
  latestMessageByThreadId: Map<string, MessageRow>;
  appointmentContexts: Map<string, HydratedAppointmentContext>;
  locationLabels: Map<string, string>;
}): MessagingThreadSummary {
  const threadParticipants = input.participants.filter((participant) => participant.thread_id === input.thread.id);
  const counterpartParticipant = threadParticipants.find((participant) => participant.profile_id !== input.currentProfileId) ?? null;
  const counterpartProfile = counterpartParticipant ? input.profilesById.get(counterpartParticipant.profile_id) ?? null : null;
  const counterpartMetadata = counterpartParticipant
    ? input.publicMetadataByProfileId.get(counterpartParticipant.profile_id) ?? null
    : null;
  const appointmentContext = input.thread.appointment_id ? input.appointmentContexts.get(input.thread.appointment_id) ?? null : null;
  const latestMessage = input.latestMessageByThreadId.get(input.thread.id) ?? null;
  const latestSender = latestMessage?.sender_profile_id ? input.profilesById.get(latestMessage.sender_profile_id) ?? null : null;
  const locationLabel = input.thread.location_id ? input.locationLabels.get(input.thread.location_id) ?? input.thread.location_id : null;

  return {
    id: input.thread.id,
    threadType: input.thread.thread_type,
    appointmentId: input.thread.appointment_id,
    locationId: input.thread.location_id,
    locationContext: input.thread.location_id && locationLabel
      ? {
          locationId: input.thread.location_id,
          locationLabel
        }
      : null,
    createdAt: input.thread.created_at,
    updatedAt: input.thread.updated_at,
    counterpart: counterpartParticipant && counterpartProfile
      ? {
          profileId: counterpartParticipant.profile_id,
          fullName: counterpartProfile.full_name ?? counterpartProfile.email,
          role: counterpartProfile.role,
          avatarUrl: counterpartMetadata?.avatarUrl ?? null,
          publicProfileHref: counterpartMetadata?.publicProfileHref ?? null,
          bookingHref: counterpartMetadata?.bookingHref ?? null
        }
      : null,
    appointmentContext: appointmentContext ? toAppointmentContextView(appointmentContext) : null,
    lastMessage: latestMessage
      ? {
          id: latestMessage.id,
          body: latestMessage.body,
          messageType: latestMessage.message_type,
          createdAt: latestMessage.created_at,
          senderName: latestSender ? (latestSender.full_name ?? latestSender.email) : null
        }
      : null
  };
}

async function readThreadBundle(supabase: SupabaseClient, currentProfileId: string, threadIds: string[]): Promise<ThreadBundle> {
  if (!threadIds.length) {
    return {
      threads: [],
      participants: [],
      messages: [],
      profilesById: new Map<string, ProfileRow>(),
      publicMetadataByProfileId: new Map<string, PublicMessagingMetadata>(),
      latestMessageByThreadId: new Map<string, MessageRow>(),
      appointmentContexts: new Map<string, HydratedAppointmentContext>(),
      locationLabels: new Map<string, string>()
    };
  }

  const [threadsResult, participantsResult, messagesResult] = await Promise.all([
    supabase
      .from("message_threads")
      .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
      .in("id", threadIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("thread_participants")
      .select("id, thread_id, profile_id, thread_role, created_at")
      .in("thread_id", threadIds),
    supabase
      .from("messages")
      .select("id, thread_id, sender_profile_id, body, message_type, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
  ]);

  if (threadsResult.error || participantsResult.error || messagesResult.error) {
    throw new MessagingServiceError("Unable to load the messaging inbox.", 500);
  }

  const threads = (threadsResult.data ?? []) as MessageThreadRow[];
  const participants = (participantsResult.data ?? []) as ThreadParticipantRow[];
  const messages = (messagesResult.data ?? []) as MessageRow[];
  const participantProfileIds = unique(participants.map((participant) => participant.profile_id));
  const senderProfileIds = unique(
    messages.map((message) => message.sender_profile_id).filter((value): value is string => Boolean(value))
  );
  const profilesById = await readProfilesByIds(supabase, [...participantProfileIds, ...senderProfileIds, currentProfileId]);
  const publicMetadataByProfileId = await readPublicMessagingMetadataByProfileIds(
    supabase,
    [...participantProfileIds, ...senderProfileIds, currentProfileId]
  );
  const latestMessageByThreadId = new Map<string, MessageRow>();

  for (const message of messages) {
    if (!latestMessageByThreadId.has(message.thread_id)) {
      latestMessageByThreadId.set(message.thread_id, message);
    }
  }

  const appointmentIds = unique(
    threads.map((thread) => thread.appointment_id).filter((value): value is string => Boolean(value))
  );
  let appointmentContexts = new Map<string, HydratedAppointmentContext>();
  if (appointmentIds.length) {
    const appointmentResult = await supabase
      .from("appointments")
      .select("id, reference_code, confirmation_code, status, starts_at, client_id, barber_id, service_id, location_id")
      .in("id", appointmentIds);

    if (appointmentResult.error) {
      throw new MessagingServiceError("Unable to load appointment-linked thread context.", 500);
    }

    appointmentContexts = await readAppointmentContexts(supabase, (appointmentResult.data ?? []) as AppointmentRow[]);
  }

  const locationRows = await readLocationsByValues(
    supabase,
    threads.map((thread) => thread.location_id).filter((value): value is string => Boolean(value))
  );

  return {
    threads,
    participants,
    messages,
    profilesById,
    publicMetadataByProfileId,
    latestMessageByThreadId,
    appointmentContexts,
    locationLabels: new Map(locationRows.rows.map((row) => [row.id, formatLocationLabel(row)]))
  };
}

async function readEligibleAppointments(
  supabase: SupabaseClient,
  actor: MessagingActorContext,
  currentThreadAppointmentIds: Set<string>
) {
  if (actor.kind === "shop") {
    return [] as MessagingInboxCandidate[];
  }

  const appointmentsQuery = actor.clientId
    ? supabase
        .from("appointments")
        .select("id, reference_code, confirmation_code, status, starts_at, client_id, barber_id, service_id, location_id")
        .eq("client_id", actor.clientId)
        .order("starts_at", { ascending: false })
        .limit(8)
    : supabase
        .from("appointments")
        .select("id, reference_code, confirmation_code, status, starts_at, client_id, barber_id, service_id, location_id")
        .eq("barber_id", actor.barberId ?? "")
        .order("starts_at", { ascending: false })
        .limit(8);

  const appointmentsResult = await appointmentsQuery;

  if (appointmentsResult.error) {
    throw new MessagingServiceError("Unable to load appointment conversation starters.", 500);
  }

  const appointmentContexts = await readAppointmentContexts(supabase, (appointmentsResult.data ?? []) as AppointmentRow[]);

  return Array.from(appointmentContexts.values())
    .filter((context) => !currentThreadAppointmentIds.has(context.appointmentId))
    .map((context) => ({
      kind: "appointment" as const,
      appointmentId: context.appointmentId,
      counterpart: isClientRole(actor.profile.role)
        ? {
            profileId: context.barberProfileId,
            fullName: context.barberName,
            role: context.barberRole,
            avatarUrl: context.barberAvatarUrl,
            publicProfileHref: context.barberPublicProfileHref,
            bookingHref: context.barberBookingHref
          }
        : {
            profileId: context.clientProfileId,
            fullName: context.clientName,
            role: "client_user" as const,
            avatarUrl: null,
            publicProfileHref: null,
            bookingHref: null
          },
      appointmentContext: {
        appointmentId: context.appointmentId,
        confirmationCode: context.confirmationCode,
        status: context.status,
        statusLabel: context.statusLabel,
        startsAt: context.startsAt,
        serviceName: context.serviceName,
        locationLabel: context.locationLabel
      }
    }));
}

async function readShopLocationScope(actor: MessagingActorContext, supabase: SupabaseClient) {
  if (actor.kind !== "shop") {
    return [] as LocationRow[];
  }

  return (await readLocationsByValues(supabase, actor.locationIds ?? [])).rows;
}

async function readEligibleContacts(
  supabase: SupabaseClient,
  actor: MessagingActorContext,
  threads: MessagingThreadSummary[]
) {
  if (actor.kind === "shop") {
    const locationRows = await readShopLocationScope(actor, supabase);
    if (!locationRows.length) {
      return {
        eligibleContacts: [] as MessagingContactCandidate[],
        broadcastTargets: [] as MessagingBroadcastTarget[]
      };
    }

    const appointmentsResult = await supabase
      .from("appointments")
      .select("id, reference_code, confirmation_code, status, starts_at, client_id, barber_id, service_id, location_id")
      .in("location_id", locationRows.map((row) => row.id))
      .order("starts_at", { ascending: false })
      .limit(48);

    if (appointmentsResult.error) {
      throw new MessagingServiceError("Unable to load shop contacts for messaging.", 500);
    }

    const appointmentContexts = await readAppointmentContexts(supabase, (appointmentsResult.data ?? []) as AppointmentRow[]);
    const existingThreadKeys = new Set(
      threads.flatMap((thread) => {
        if (
          (thread.threadType !== "client_shop" && thread.threadType !== "barber_shop")
          || !thread.locationId
          || !thread.counterpart?.profileId
        ) {
          return [];
        }

        return [buildShopThreadKey(thread.threadType, thread.locationId, thread.counterpart.profileId)];
      })
    );
    const eligibleContacts = new Map<string, MessagingContactCandidate>();

    for (const context of appointmentContexts.values()) {
      const clientKey = buildShopThreadKey("client_shop", context.locationId, context.clientProfileId);
      if (!existingThreadKeys.has(clientKey) && !eligibleContacts.has(clientKey)) {
        eligibleContacts.set(clientKey, {
          kind: "contact",
          profileId: context.clientProfileId,
          role: "client_user",
          fullName: context.clientName,
          threadType: "client_shop",
          locationId: context.locationId,
          locationLabel: context.locationLabel,
          appointmentContext: {
            appointmentId: context.appointmentId,
            confirmationCode: context.confirmationCode,
            status: context.status,
            statusLabel: context.statusLabel,
            startsAt: context.startsAt,
            serviceName: context.serviceName,
            locationLabel: context.locationLabel
          }
        });
      }

      const barberKey = buildShopThreadKey("barber_shop", context.locationId, context.barberProfileId);
      if (!existingThreadKeys.has(barberKey) && !eligibleContacts.has(barberKey)) {
        eligibleContacts.set(barberKey, {
          kind: "contact",
          profileId: context.barberProfileId,
          role: context.barberRole,
          fullName: context.barberName,
          threadType: "barber_shop",
          locationId: context.locationId,
          locationLabel: context.locationLabel,
          appointmentContext: {
            appointmentId: context.appointmentId,
            confirmationCode: context.confirmationCode,
            status: context.status,
            statusLabel: context.statusLabel,
            startsAt: context.startsAt,
            serviceName: context.serviceName,
            locationLabel: context.locationLabel
          }
        });
      }
    }

    const contactList = Array.from(eligibleContacts.values()).sort(
      (left, right) =>
        new Date(right.appointmentContext?.startsAt ?? 0).getTime()
        - new Date(left.appointmentContext?.startsAt ?? 0).getTime()
    );
    const broadcastTargets = locationRows
      .map((row) => ({
        locationId: row.id,
        locationLabel: formatLocationLabel(row),
        clientCount: contactList.filter((contact) => contact.locationId === row.id && contact.threadType === "client_shop").length,
        barberCount: contactList.filter((contact) => contact.locationId === row.id && contact.threadType === "barber_shop").length
      }))
      .filter((target) => target.clientCount > 0 || target.barberCount > 0);

    return {
      eligibleContacts: contactList,
      broadcastTargets
    };
  }

  const appointmentsResult = actor.clientId
    ? await supabase
        .from("appointments")
        .select("id, reference_code, confirmation_code, status, starts_at, client_id, barber_id, service_id, location_id")
        .eq("client_id", actor.clientId)
        .order("starts_at", { ascending: false })
        .limit(16)
    : await supabase
        .from("appointments")
        .select("id, reference_code, confirmation_code, status, starts_at, client_id, barber_id, service_id, location_id")
        .eq("barber_id", actor.barberId ?? "")
        .order("starts_at", { ascending: false })
        .limit(16);

  if (appointmentsResult.error) {
    throw new MessagingServiceError("Unable to load shop contact starters.", 500);
  }

  const appointmentContexts = await readAppointmentContexts(supabase, (appointmentsResult.data ?? []) as AppointmentRow[]);
  const threadType = actor.kind === "client" ? "client_shop" : "barber_shop";
  const existingLocationKeys = new Set(
    threads
      .filter((thread) => thread.threadType === threadType && thread.locationId)
      .map((thread) => buildActorThreadKey(threadType, thread.locationId!))
  );
  const shopParticipantsByLocation = await readShopParticipantsByLocationIds(
    supabase,
    Array.from(new Set(Array.from(appointmentContexts.values()).map((context) => context.locationId)))
  );
  const contactCandidates = new Map<string, MessagingContactCandidate>();

  for (const context of Array.from(appointmentContexts.values()).sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime())) {
    const locationKey = buildActorThreadKey(threadType, context.locationId);
    if (existingLocationKeys.has(locationKey) || contactCandidates.has(locationKey)) {
      continue;
    }

    const shopParticipants = shopParticipantsByLocation.get(context.locationId) ?? [];
    const primaryShopProfile = pickPrimaryShopProfile(shopParticipants);
    if (!primaryShopProfile) {
      continue;
    }

    contactCandidates.set(locationKey, {
      kind: "contact",
      profileId: primaryShopProfile.id,
      role: primaryShopProfile.role,
      fullName: `${context.locationLabel.split(" | ")[0] ?? "Shop"} team`,
      threadType,
      locationId: context.locationId,
      locationLabel: context.locationLabel,
      appointmentContext: {
        appointmentId: context.appointmentId,
        confirmationCode: context.confirmationCode,
        status: context.status,
        statusLabel: context.statusLabel,
        startsAt: context.startsAt,
        serviceName: context.serviceName,
        locationLabel: context.locationLabel
      }
    });
  }

  return {
    eligibleContacts: Array.from(contactCandidates.values()),
    broadcastTargets: [] as MessagingBroadcastTarget[]
  };
}

async function readProfileById(supabase: SupabaseClient, profileId: string) {
  const result = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", profileId)
    .maybeSingle();

  if (result.error) {
    throw new MessagingServiceError("Unable to resolve the messaging profile.", 500);
  }

  if (!result.data) {
    throw new MessagingServiceError("Profile not found for messaging.", 404);
  }

  return result.data as ProfileRow;
}

async function readPrimarySupportProfile(supabase: SupabaseClient) {
  const canonicalResult = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("role", "platform_admin")
    .eq("email", CANONICAL_PLATFORM_ADMIN_EMAIL)
    .maybeSingle();

  if (canonicalResult.error) {
    throw new MessagingServiceError("Unable to resolve the support profile.", 500);
  }

  if (canonicalResult.data) {
    return canonicalResult.data as ProfileRow;
  }

  const fallbackResult = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("role", "platform_admin")
    .order("full_name")
    .limit(1)
    .maybeSingle();

  if (fallbackResult.error) {
    throw new MessagingServiceError("Unable to resolve the support profile.", 500);
  }

  if (!fallbackResult.data) {
    throw new MessagingServiceError("No support profile is available for messaging.", 404);
  }

  return fallbackResult.data as ProfileRow;
}

async function assertActorCanReachLocation(
  supabase: SupabaseClient,
  actor: MessagingActorContext,
  locationId: string
) {
  if (actor.kind === "shop") {
    const allowedRows = await readShopLocationScope(actor, supabase);
    if (!allowedRows.some((row) => row.id === locationId)) {
      throw new MessagingServiceError("This shop role cannot open conversations outside its assigned locations.", 403);
    }
    return;
  }

  const relationshipResult = actor.kind === "client"
    ? await supabase
        .from("appointments")
        .select("id")
        .eq("client_id", actor.clientId ?? "")
        .eq("location_id", locationId)
        .limit(1)
        .maybeSingle()
    : await supabase
        .from("appointments")
        .select("id")
        .eq("barber_id", actor.barberId ?? "")
        .eq("location_id", locationId)
        .limit(1)
        .maybeSingle();

  if (relationshipResult.error) {
    throw new MessagingServiceError("Unable to confirm the shop relationship for messaging.", 500);
  }

  if (!relationshipResult.data) {
    throw new MessagingServiceError("You can only message shops connected to your real appointment history.", 403);
  }
}

async function ensureThreadParticipants(
  supabase: SupabaseClient,
  threadId: string,
  existingParticipants: ThreadParticipantRow[],
  profiles: ProfileRow[]
) {
  const existingIds = new Set(existingParticipants.map((participant) => participant.profile_id));
  const missingRows = profiles
    .filter((profile) => !existingIds.has(profile.id))
    .map((profile) => ({
      thread_id: threadId,
      profile_id: profile.id,
      thread_role: profile.role
    }));

  if (!missingRows.length) {
    return;
  }

  const insertResult = await supabase.from("thread_participants").insert(missingRows);
  if (insertResult.error) {
    throw new MessagingServiceError("Unable to attach messaging participants.", 500);
  }
}

async function findSharedParticipantThreadIds(input: {
  supabase: SupabaseClient;
  actorProfileId: string;
  counterpartProfileId: string;
}) {
  const [actorRowsResult, counterpartRowsResult] = await Promise.all([
    input.supabase
      .from("thread_participants")
      .select("thread_id")
      .eq("profile_id", input.actorProfileId),
    input.supabase
      .from("thread_participants")
      .select("thread_id")
      .eq("profile_id", input.counterpartProfileId)
  ]);

  if (actorRowsResult.error || counterpartRowsResult.error) {
    throw new MessagingServiceError("Unable to resolve related messaging participants.", 500);
  }

  const actorThreadIds = new Set((actorRowsResult.data ?? []).map((row) => row.thread_id as string));
  return unique((counterpartRowsResult.data ?? [])
    .map((row) => row.thread_id as string)
    .filter((threadId) => actorThreadIds.has(threadId)));
}

async function readRelatedConversationThreadIds(input: {
  supabase: SupabaseClient;
  actorProfileId: string;
  thread: MessageThreadRow;
  threadParticipants: ThreadParticipantRow[];
}) {
  const counterpartParticipant = input.threadParticipants.find((participant) => participant.profile_id !== input.actorProfileId);
  if (!counterpartParticipant) {
    return [input.thread.id];
  }

  if (
    input.thread.thread_type !== "client_barber"
    && input.thread.thread_type !== "client_shop"
    && input.thread.thread_type !== "barber_shop"
    && input.thread.thread_type !== "support"
  ) {
    return [input.thread.id];
  }

  const sharedThreadIds = await findSharedParticipantThreadIds({
    supabase: input.supabase,
    actorProfileId: input.actorProfileId,
    counterpartProfileId: counterpartParticipant.profile_id
  });

  if (!sharedThreadIds.length) {
    return [input.thread.id];
  }

  const relatedThreadsResult = await input.supabase
    .from("message_threads")
    .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
    .in("id", sharedThreadIds)
    .eq("thread_type", input.thread.thread_type)
    .order("updated_at", { ascending: false });

  if (relatedThreadsResult.error) {
    throw new MessagingServiceError("Unable to load related conversation threads.", 500);
  }

  const relatedThreadIds = ((relatedThreadsResult.data ?? []) as MessageThreadRow[])
    .filter((thread) => {
      if (input.thread.thread_type === "client_shop" || input.thread.thread_type === "barber_shop") {
        return thread.location_id === input.thread.location_id;
      }

      return true;
    })
    .map((thread) => thread.id);

  return unique([input.thread.id, ...relatedThreadIds]);
}

async function createOrGetClientBarberThread(input: {
  supabase: SupabaseClient;
  appointment: HydratedAppointmentContext;
  createdByProfileId: string;
}) {
  const sharedThreadIds = await findSharedParticipantThreadIds({
    supabase: input.supabase,
    actorProfileId: input.appointment.clientProfileId,
    counterpartProfileId: input.appointment.barberProfileId
  });

  if (sharedThreadIds.length) {
    const threadLookupResult = await input.supabase
      .from("message_threads")
      .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
      .in("id", sharedThreadIds)
      .eq("thread_type", "client_barber")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (threadLookupResult.error) {
      throw new MessagingServiceError("Unable to look up the appointment conversation.", 500);
    }

    const existingThread = ((threadLookupResult.data ?? []) as MessageThreadRow[])[0] ?? null;
    if (existingThread) {
      await writeAppointmentSystemMessageIfMissing(input.supabase, existingThread.id, input.appointment);
      return existingThread.id;
    }
  }

  const createdAt = new Date().toISOString();
  const threadInsert = await input.supabase
    .from("message_threads")
    .insert({
      thread_type: "client_barber",
      appointment_id: input.appointment.appointmentId,
      location_id: input.appointment.locationId,
      created_by_profile_id: input.createdByProfileId,
      updated_at: createdAt
    })
    .select("id")
    .single();

  if (threadInsert.error) {
    throw new MessagingServiceError("Unable to create the appointment conversation.", 500);
  }

  const threadId = threadInsert.data.id as string;
  const participantInsert = await input.supabase
    .from("thread_participants")
    .insert([
      {
        thread_id: threadId,
        profile_id: input.appointment.clientProfileId,
        thread_role: "client_user"
      },
      {
        thread_id: threadId,
        profile_id: input.appointment.barberProfileId,
        thread_role: input.appointment.barberRole
      }
    ]);

  if (participantInsert.error) {
    throw new MessagingServiceError("Unable to attach messaging participants.", 500);
  }

  await writeAppointmentSystemMessageIfMissing(input.supabase, threadId, input.appointment);
  return threadId;
}

async function createOrGetDirectClientBarberThread(input: {
  supabase: SupabaseClient;
  clientProfile: ProfileRow;
  barberProfile: ProfileRow;
  createdByProfileId: string;
}) {
  const sharedThreadIds = await findSharedParticipantThreadIds({
    supabase: input.supabase,
    actorProfileId: input.clientProfile.id,
    counterpartProfileId: input.barberProfile.id
  });

  if (sharedThreadIds.length) {
    const threadLookupResult = await input.supabase
      .from("message_threads")
      .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
      .in("id", sharedThreadIds)
      .eq("thread_type", "client_barber")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (threadLookupResult.error) {
      throw new MessagingServiceError("Unable to look up the barber conversation.", 500);
    }

    const existingThread = ((threadLookupResult.data ?? []) as MessageThreadRow[])[0] ?? null;
    if (existingThread) {
      return existingThread.id;
    }
  }

  const createdAt = new Date().toISOString();
  const threadInsert = await input.supabase
    .from("message_threads")
    .insert({
      thread_type: "client_barber",
      appointment_id: null,
      location_id: null,
      created_by_profile_id: input.createdByProfileId,
      updated_at: createdAt
    })
    .select("id")
    .single();

  if (threadInsert.error) {
    throw new MessagingServiceError("Unable to create the barber conversation.", 500);
  }

  const threadId = threadInsert.data.id as string;
  const participantInsert = await input.supabase
    .from("thread_participants")
    .insert([
      {
        thread_id: threadId,
        profile_id: input.clientProfile.id,
        thread_role: input.clientProfile.role
      },
      {
        thread_id: threadId,
        profile_id: input.barberProfile.id,
        thread_role: input.barberProfile.role
      }
    ]);

  if (participantInsert.error) {
    throw new MessagingServiceError("Unable to attach messaging participants.", 500);
  }

  const systemMessageInsert = await input.supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_profile_id: null,
      body: `Conversation opened with ${input.barberProfile.full_name ?? input.barberProfile.email}.`,
      message_type: "system",
      created_at: createdAt
    });

  if (systemMessageInsert.error) {
    throw new MessagingServiceError("Unable to write the barber conversation system message.", 500);
  }

  return threadId;
}

async function writeAppointmentSystemMessageIfMissing(
  supabase: SupabaseClient,
  threadId: string,
  appointment: HydratedAppointmentContext
) {
  const body = buildAppointmentThreadSystemMessage({
    appointmentId: appointment.appointmentId,
    clientProfileId: appointment.clientProfileId,
    barberProfileId: appointment.barberProfileId,
    clientName: appointment.clientName,
    barberName: appointment.barberName,
    barberRole: appointment.barberRole as Extract<Role, "barber_user" | "barber" | "freelance_barber" | "commission_barber" | "booth_rent_barber">,
    serviceName: appointment.serviceName,
    startsAt: appointment.startsAt
  });
  const existingMessageResult = await supabase
    .from("messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("message_type", "system")
    .eq("body", body)
    .maybeSingle();

  if (existingMessageResult.error) {
    throw new MessagingServiceError("Unable to look up appointment thread context.", 500);
  }

  if (existingMessageResult.data) {
    return;
  }

  const createdAt = new Date().toISOString();
  const [systemMessageInsert, threadUpdate] = await Promise.all([
    supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        sender_profile_id: null,
        body,
        message_type: "system",
        created_at: createdAt
      }),
    supabase
      .from("message_threads")
      .update({ updated_at: createdAt })
      .eq("id", threadId)
  ]);

  if (systemMessageInsert.error) {
    throw new MessagingServiceError("Unable to write the appointment system message.", 500);
  }

  if (threadUpdate.error) {
    throw new MessagingServiceError("Unable to update appointment conversation activity.", 500);
  }
}

async function createOrGetShopThread(input: {
  supabase: SupabaseClient;
  threadType: Extract<MessagingThreadType, "client_shop" | "barber_shop">;
  location: LocationRow;
  shopParticipants: ProfileRow[];
  counterpartProfile: ProfileRow;
  createdByProfileId: string;
}) {
  const threadLookupResult = await input.supabase
    .from("message_threads")
    .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
    .eq("thread_type", input.threadType)
    .eq("location_id", input.location.id)
    .order("updated_at", { ascending: false });

  if (threadLookupResult.error) {
    throw new MessagingServiceError("Unable to look up the messaging conversation.", 500);
  }

  const candidateThreads = (threadLookupResult.data ?? []) as MessageThreadRow[];
  const candidateThreadIds = candidateThreads.map((thread) => thread.id);
  const participantsResult = candidateThreadIds.length
    ? await input.supabase
        .from("thread_participants")
        .select("id, thread_id, profile_id, thread_role, created_at")
        .in("thread_id", candidateThreadIds)
    : { data: [], error: null };

  if (participantsResult.error) {
    throw new MessagingServiceError("Unable to resolve existing shop thread participants.", 500);
  }

  const participantRows = (participantsResult.data ?? []) as ThreadParticipantRow[];
  const shopParticipantIds = new Set(input.shopParticipants.map((profile) => profile.id));
  const matchedThread = candidateThreads.find((thread) => {
    const threadParticipants = participantRows.filter((participant) => participant.thread_id === thread.id);
    const hasCounterpart = threadParticipants.some((participant) => participant.profile_id === input.counterpartProfile.id);
    const hasShopParticipant = threadParticipants.some((participant) => shopParticipantIds.has(participant.profile_id));
    return hasCounterpart && hasShopParticipant;
  });

  if (matchedThread) {
    const threadParticipants = participantRows.filter((participant) => participant.thread_id === matchedThread.id);
    await ensureThreadParticipants(input.supabase, matchedThread.id, threadParticipants, [...input.shopParticipants, input.counterpartProfile]);
    return matchedThread.id;
  }

  const createdAt = new Date().toISOString();
  const threadInsert = await input.supabase
    .from("message_threads")
    .insert({
      thread_type: input.threadType,
      location_id: input.location.id,
      created_by_profile_id: input.createdByProfileId,
      updated_at: createdAt
    })
    .select("id")
    .single();

  if (threadInsert.error) {
    throw new MessagingServiceError("Unable to create the shop conversation.", 500);
  }

  const threadId = threadInsert.data.id as string;
  await ensureThreadParticipants(input.supabase, threadId, [], [...input.shopParticipants, input.counterpartProfile]);

  const systemMessageInsert = await input.supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_profile_id: null,
      body: buildShopThreadSystemMessage({
        threadType: input.threadType,
        counterpartName: input.counterpartProfile.full_name ?? input.counterpartProfile.email,
        locationLabel: formatLocationLabel(input.location)
      }),
      message_type: "system"
    });

  if (systemMessageInsert.error) {
    throw new MessagingServiceError("Unable to write the shop conversation system message.", 500);
  }

  return threadId;
}

async function createOrGetSupportThread(input: {
  supabase: SupabaseClient;
  actorProfile: ProfileRow;
  supportProfile: ProfileRow;
}) {
  const threadLookupResult = await input.supabase
    .from("message_threads")
    .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
    .eq("thread_type", "support")
    .order("updated_at", { ascending: false });

  if (threadLookupResult.error) {
    throw new MessagingServiceError("Unable to look up the support conversation.", 500);
  }

  const candidateThreads = (threadLookupResult.data ?? []) as MessageThreadRow[];
  const candidateThreadIds = candidateThreads.map((thread) => thread.id);
  const participantsResult = candidateThreadIds.length
    ? await input.supabase
        .from("thread_participants")
        .select("id, thread_id, profile_id, thread_role, created_at")
        .in("thread_id", candidateThreadIds)
    : { data: [], error: null };

  if (participantsResult.error) {
    throw new MessagingServiceError("Unable to resolve existing support participants.", 500);
  }

  const participantRows = (participantsResult.data ?? []) as ThreadParticipantRow[];
  const matchedThread = candidateThreads.find((thread) => {
    const threadParticipants = participantRows.filter((participant) => participant.thread_id === thread.id);
    return threadParticipants.some((participant) => participant.profile_id === input.actorProfile.id)
      && threadParticipants.some((participant) => participant.profile_id === input.supportProfile.id);
  });

  if (matchedThread) {
    const threadParticipants = participantRows.filter((participant) => participant.thread_id === matchedThread.id);
    await ensureThreadParticipants(input.supabase, matchedThread.id, threadParticipants, [
      input.actorProfile,
      input.supportProfile
    ]);
    return matchedThread.id;
  }

  const createdAt = new Date().toISOString();
  const threadInsert = await input.supabase
    .from("message_threads")
    .insert({
      thread_type: "support",
      created_by_profile_id: input.actorProfile.id,
      updated_at: createdAt
    })
    .select("id")
    .single();

  if (threadInsert.error) {
    throw new MessagingServiceError("Unable to create the support conversation.", 500);
  }

  const threadId = threadInsert.data.id as string;
  await ensureThreadParticipants(input.supabase, threadId, [], [input.actorProfile, input.supportProfile]);

  const systemMessageInsert = await input.supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_profile_id: null,
      body: buildSupportThreadSystemMessage(input.supportProfile.full_name ?? input.supportProfile.email),
      message_type: "system"
    });

  if (systemMessageInsert.error) {
    throw new MessagingServiceError("Unable to write the support conversation system message.", 500);
  }

  return threadId;
}

function formatTrustReportCategory(category: string) {
  return category
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function truncateSupportText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

async function readBarberSubjectLabel(supabase: SupabaseClient, subjectId: string) {
  const target = await resolveBarberReportTarget(subjectId, supabase);
  if (target.warnings.length) {
    console.warn("[messages] support_report_barber_resolution_warnings", {
      subjectId,
      resolution: target.resolution,
      warnings: target.warnings
    });
  }

  return target.displayName ?? target.publicReference ?? target.subjectId ?? subjectId;
}

async function readReportSubjectLabel(supabase: SupabaseClient, input: Pick<TrustReportSupportMessageInput, "subjectType" | "subjectId">) {
  if (input.subjectType === "barber") {
    return readBarberSubjectLabel(supabase, input.subjectId);
  }

  return input.subjectId;
}

function buildTrustReportSupportMessage(input: {
  reportId: string;
  subjectLabel: string;
  subjectId: string;
  category: string;
  details: string;
  createdAt: string;
}) {
  const concern = formatTrustReportCategory(input.category);
  const notes = truncateSupportText(input.details, 520);
  const submittedAt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(input.createdAt));

  return [
    `Report received for ${input.subjectLabel}.`,
    `Reported ID: ${input.subjectId}.`,
    `Concern: ${concern}.`,
    `Notes: ${notes}.`,
    `Submitted: ${submittedAt}.`,
    "Status: received.",
    `Report ID: ${input.reportId}.`
  ].join("\n");
}

export async function appendTrustReportToSupportThread(
  user: UserAccount,
  input: TrustReportSupportMessageInput
): Promise<TrustReportSupportMessageResult> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new MessagingServiceError("Messaging is available when Supabase is configured.", 503);
  }

  const actor = await resolveMessagingActor(user, supabase);
  const supportProfile = await readPrimarySupportProfile(supabase);
  const threadId = await createOrGetSupportThread({
    supabase,
    actorProfile: actor.profile,
    supportProfile
  });
  const createdAt = input.createdAt ?? new Date().toISOString();
  const subjectLabel = await readReportSubjectLabel(supabase, input);
  const body = buildTrustReportSupportMessage({
    reportId: input.reportId,
    subjectLabel,
    subjectId: input.subjectId,
    category: input.category,
    details: input.details,
    createdAt
  });

  const [messageInsert, threadUpdate] = await Promise.all([
    supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        sender_profile_id: null,
        body,
        message_type: "system",
        created_at: createdAt
      })
      .select("id")
      .single(),
    supabase
      .from("message_threads")
      .update({ updated_at: createdAt })
      .eq("id", threadId)
  ]);

  if (messageInsert.error) {
    throw new MessagingServiceError("Unable to write the support report message.", 500);
  }

  if (threadUpdate.error) {
    throw new MessagingServiceError("Unable to update support thread activity.", 500);
  }

  return {
    threadId,
    messageId: messageInsert.data.id as string,
    createdAt
  };
}

export async function getMessagingInboxPayload(user: UserAccount): Promise<MessagingInboxPayload> {
  const supabase = getSupabase();
  if (!supabase || !isMessagingRole(user.role)) {
    return {
      available: false,
      viewer: baseViewer(user),
      threads: [],
      eligibleAppointments: [],
      eligibleContacts: [],
      broadcastTargets: []
    };
  }

  const actor = await resolveMessagingActor(user, supabase);
  const participantResult = await supabase
    .from("thread_participants")
    .select("thread_id")
    .eq("profile_id", actor.profile.id);

  if (participantResult.error) {
    throw new MessagingServiceError("Unable to load the messaging inbox.", 500);
  }

  const threadIds = unique((participantResult.data ?? []).map((row) => row.thread_id as string));
  const bundle = await readThreadBundle(supabase, actor.profile.id, threadIds);
  const threads = bundle.threads.map((thread) =>
    buildThreadSummary({
      thread,
      currentProfileId: actor.profile.id,
      participants: bundle.participants,
      profilesById: bundle.profilesById,
      publicMetadataByProfileId: bundle.publicMetadataByProfileId,
      latestMessageByThreadId: bundle.latestMessageByThreadId,
      appointmentContexts: bundle.appointmentContexts,
      locationLabels: bundle.locationLabels
    })
  );
  const [eligibleAppointments, contactData] = await Promise.all([
    readEligibleAppointments(
      supabase,
      actor,
      new Set(threads.map((thread) => thread.appointmentId).filter((value): value is string => Boolean(value)))
    ),
    readEligibleContacts(supabase, actor, threads)
  ]);

  return {
    available: true,
    viewer: baseViewer(user, actor.profile.id),
    threads,
    eligibleAppointments,
    eligibleContacts: contactData.eligibleContacts,
    broadcastTargets: contactData.broadcastTargets
  };
}

export async function getMessagingThreadPayload(user: UserAccount, threadId: string): Promise<MessagingThreadPayload> {
  const supabase = getSupabase();
  if (!supabase || !isMessagingRole(user.role)) {
    return {
      available: false,
      viewer: baseViewer(user),
      thread: null,
      messages: []
    };
  }

  const actor = await resolveMessagingActor(user, supabase);
  const membershipResult = await supabase
    .from("thread_participants")
    .select("id")
    .eq("thread_id", threadId)
    .eq("profile_id", actor.profile.id)
    .maybeSingle();

  if (membershipResult.error) {
    throw new MessagingServiceError("Unable to verify thread access.", 500);
  }

  if (!membershipResult.data) {
    throw new MessagingServiceError("Only thread participants can view this conversation.", 403);
  }

  const initialBundle = await readThreadBundle(supabase, actor.profile.id, [threadId]);
  const initialThread = initialBundle.threads[0];

  if (!initialThread) {
    throw new MessagingServiceError("Message thread not found.", 404);
  }

  const initialParticipants = initialBundle.participants.filter((participant) => participant.thread_id === threadId);
  const relatedThreadIds = await readRelatedConversationThreadIds({
    supabase,
    actorProfileId: actor.profile.id,
    thread: initialThread,
    threadParticipants: initialParticipants
  });
  const bundle = relatedThreadIds.length === 1
    ? initialBundle
    : await readThreadBundle(supabase, actor.profile.id, relatedThreadIds);
  const thread = bundle.threads.find((row) => row.id === threadId) ?? initialThread;

  const messagesResult = await supabase
    .from("messages")
    .select("id, thread_id, sender_profile_id, body, message_type, created_at")
    .in("thread_id", relatedThreadIds)
    .order("created_at", { ascending: true });

  if (messagesResult.error) {
    throw new MessagingServiceError("Unable to load thread messages.", 500);
  }

  const threadParticipants = bundle.participants.filter((participant) => participant.thread_id === thread.id);
  const threadSummary = buildThreadSummary({
    thread,
    currentProfileId: actor.profile.id,
    participants: bundle.participants,
    profilesById: bundle.profilesById,
    publicMetadataByProfileId: bundle.publicMetadataByProfileId,
    latestMessageByThreadId: bundle.latestMessageByThreadId,
    appointmentContexts: bundle.appointmentContexts,
    locationLabels: bundle.locationLabels
  });

  const relatedAppointmentContexts = unique(
    bundle.threads
      .map((row) => row.appointment_id)
      .filter((value): value is string => Boolean(value))
  )
    .map((appointmentId) => bundle.appointmentContexts.get(appointmentId) ?? null)
    .filter((context): context is HydratedAppointmentContext => Boolean(context))
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime())
    .map(toAppointmentContextView);

  return {
    available: true,
    viewer: baseViewer(user, actor.profile.id),
    thread: {
      ...threadSummary,
      participants: threadParticipants.map((participant) => {
        const profile = bundle.profilesById.get(participant.profile_id);
        const metadata = bundle.publicMetadataByProfileId.get(participant.profile_id) ?? null;
        return {
          profileId: participant.profile_id,
          fullName: profile?.full_name ?? profile?.email ?? participant.profile_id,
          role: participant.thread_role,
          isSelf: participant.profile_id === actor.profile.id,
          avatarUrl: metadata?.avatarUrl ?? null,
          publicProfileHref: metadata?.publicProfileHref ?? null,
          bookingHref: metadata?.bookingHref ?? null
        };
      })
    },
    messages: ((messagesResult.data ?? []) as MessageRow[]).map((message) => {
      const sender = message.sender_profile_id ? bundle.profilesById.get(message.sender_profile_id) ?? null : null;
      return {
        id: message.id,
        body: message.body,
        messageType: message.message_type,
        createdAt: message.created_at,
        senderName: sender ? (sender.full_name ?? sender.email) : null,
        senderRole: sender?.role ?? null,
        isOwn: message.sender_profile_id === actor.profile.id
      };
    }),
    relatedAppointmentContexts
  };
}

function recordParticipantSearchWarning(
  warnings: MessagingParticipantSearchWarning[],
  branch: MessagingParticipantSearchWarning["branch"],
  message: string,
  error: unknown
) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.warn("[messages] participant_search_branch_failed", {
    branch,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage
  });
  warnings.push({ branch, message });
}

export async function searchMessagingParticipants(user: UserAccount, query: string): Promise<MessagingParticipantSearchPayload> {
  const supabase = getSupabase();
  if (!supabase || !isMessagingRole(user.role)) {
    return { results: [] };
  }

  const actor = await resolveMessagingActor(user, supabase);
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) {
    return { results: [] };
  }

  const warnings: MessagingParticipantSearchWarning[] = [];
  let threadLookup = new Map<string, string>();
  try {
    const participantResult = await supabase
      .from("thread_participants")
      .select("thread_id")
      .eq("profile_id", actor.profile.id);

    if (participantResult.error) {
      throw new MessagingServiceError("Unable to load existing messaging conversations.", 500);
    }

    const threadIds = unique((participantResult.data ?? []).map((row) => row.thread_id as string));
    const bundle = await readThreadBundle(supabase, actor.profile.id, threadIds);
    threadLookup = buildExistingThreadLookup(bundle.threads.map((thread) =>
      buildThreadSummary({
        thread,
        currentProfileId: actor.profile.id,
        participants: bundle.participants,
        profilesById: bundle.profilesById,
        publicMetadataByProfileId: bundle.publicMetadataByProfileId,
        latestMessageByThreadId: bundle.latestMessageByThreadId,
        appointmentContexts: bundle.appointmentContexts,
        locationLabels: bundle.locationLabels
      })
    ));
  } catch (error) {
    recordParticipantSearchWarning(warnings, "threads", "Unable to resolve existing messaging conversations.", error);
  }

  const results = new Map<string, MessagingParticipantSearchResult>();
  const supportMatches = ["support", "bvrb3r", "help"].some((term) => term.includes(normalizedQuery.toLowerCase()) || normalizedQuery.toLowerCase().includes(term));

  if (supportMatches) {
    try {
      const supportProfile = await readPrimarySupportProfile(supabase);
      results.set(`support:${supportProfile.id}`, {
        id: supportProfile.id,
        participantId: supportProfile.id,
        displayName: supportProfile.full_name ?? "BVRB3R Support",
        resultType: "support",
        participantType: "support",
        role: supportProfile.role,
        avatarUrl: null,
        publicProfileHref: null,
        profileHref: null,
        bookingHref: null,
        existingThreadId: threadLookup.get(`support:${supportProfile.id}`) ?? null,
        createThreadInput: { threadType: "support" },
        subtitle: "BVRB3R Support"
      });
    } catch (error) {
      recordParticipantSearchWarning(warnings, "support", "Unable to search support messaging results.", error);
    }
  }

  try {
    const barberProfilesByReference = new Map<string, BarberPublicProfileRow>();
    const matchedIdentityProfilesById = new Map<string, ProfileRow>();

    try {
      const barberProfileResult = await supabase
        .from("barber_profiles")
        .select("barber_reference, username, display_name, profile_photo_path, profile_photo_url, visibility_state")
        .or(`display_name.ilike.%${normalizedQuery}%,username.ilike.%${normalizedQuery}%,barber_reference.ilike.%${normalizedQuery}%`)
        .limit(12);

      if (barberProfileResult.error) {
        throw barberProfileResult.error;
      }

      for (const profile of ((barberProfileResult.data ?? []) as BarberPublicProfileRow[])) {
        if (!profile.visibility_state || profile.visibility_state === "public" || profile.visibility_state === "featured") {
          barberProfilesByReference.set(profile.barber_reference, profile);
        }
      }
    } catch (error) {
      recordParticipantSearchWarning(warnings, "barber", "Unable to search public barber messaging results.", error);
    }

    try {
      const profileResult = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .ilike("full_name", `%${normalizedQuery}%`)
        .limit(12);

      if (profileResult.error) {
        throw profileResult.error;
      }

      for (const profile of ((profileResult.data ?? []) as ProfileRow[])) {
        if (isBarberRole(profile.role)) {
          matchedIdentityProfilesById.set(profile.id, profile);
        }
      }
    } catch (error) {
      recordParticipantSearchWarning(warnings, "barber", "Unable to search barber identity messaging results.", error);
    }

    const publicReferences = unique([...barberProfilesByReference.keys()].filter(Boolean));
    const matchedProfileIds = unique([...matchedIdentityProfilesById.keys()]);
    const [barbersByReferenceResult, barbersBySlugResult, barbersByProfileResult] = await Promise.all([
      publicReferences.length
        ? supabase
            .from("barbers")
            .select("id, profile_id, reference_code, booking_slug, app_approval_status, status, is_bookable, is_discoverable")
            .in("reference_code", publicReferences)
        : Promise.resolve({ data: [], error: null }),
      publicReferences.length
        ? supabase
            .from("barbers")
            .select("id, profile_id, reference_code, booking_slug, app_approval_status, status, is_bookable, is_discoverable")
            .in("booking_slug", publicReferences)
        : Promise.resolve({ data: [], error: null }),
      matchedProfileIds.length
        ? supabase
            .from("barbers")
            .select("id, profile_id, reference_code, booking_slug, app_approval_status, status, is_bookable, is_discoverable")
            .in("profile_id", matchedProfileIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (barbersByReferenceResult.error || barbersBySlugResult.error || barbersByProfileResult.error) {
      throw barbersByReferenceResult.error ?? barbersBySlugResult.error ?? barbersByProfileResult.error;
    }

    const barbersById = new Map<string, BarberRow>();
    for (const barber of [
      ...((barbersByReferenceResult.data ?? []) as BarberRow[]),
      ...((barbersBySlugResult.data ?? []) as BarberRow[]),
      ...((barbersByProfileResult.data ?? []) as BarberRow[])
    ]) {
      barbersById.set(barber.id, barber);
    }

    const barberRows = [...barbersById.values()];
    const barberIdentityProfiles = await readProfilesByIds(supabase, barberRows.map((barber) => barber.profile_id))
      .catch((error) => {
        recordParticipantSearchWarning(warnings, "barber", "Unable to resolve barber messaging profiles.", error);
        return new Map<string, ProfileRow>();
      });

    for (const [profileId, profile] of matchedIdentityProfilesById) {
      if (!barberIdentityProfiles.has(profileId)) {
        barberIdentityProfiles.set(profileId, profile);
      }
    }

    for (const barber of barberRows) {
      const profile = barberIdentityProfiles.get(barber.profile_id);
      if (!profile || !isBarberRole(profile.role)) {
        continue;
      }

      const publicProfile = [barber.reference_code, barber.booking_slug, barber.id, barber.profile_id]
        .map((value) => (value ? barberProfilesByReference.get(value) ?? null : null))
        .find((row): row is BarberPublicProfileRow => Boolean(row)) ?? null;
      const displayName = cleanText(publicProfile?.display_name) ?? profile.full_name ?? profile.email;
      if (
        !searchMatches(displayName, normalizedQuery) &&
        !searchMatches(profile.full_name, normalizedQuery) &&
        !searchMatches(publicProfile?.username, normalizedQuery) &&
        !searchMatches(barber.reference_code, normalizedQuery) &&
        !searchMatches(barber.booking_slug, normalizedQuery)
      ) {
        continue;
      }

      const metadata = buildBarberMessagingMetadata(barber, publicProfile);
      results.set(`barber:${profile.id}`, {
        id: profile.id,
        participantId: profile.id,
        displayName,
        resultType: "barber",
        participantType: "barber",
        role: profile.role,
        avatarUrl: metadata.avatarUrl,
        publicProfileHref: metadata.publicProfileHref,
        profileHref: metadata.publicProfileHref,
        bookingHref: metadata.bookingHref,
        existingThreadId: threadLookup.get(`barber:${profile.id}`) ?? null,
        createThreadInput: {
          threadType: "client_barber",
          profileId: profile.id
        },
        subtitle: "Barber"
      });
    }
  } catch (error) {
    recordParticipantSearchWarning(warnings, "barber", "Unable to search barber messaging results.", error);
  }

  try {
    const shopResult = await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .or(`name.ilike.%${normalizedQuery}%,neighborhood.ilike.%${normalizedQuery}%,city.ilike.%${normalizedQuery}%,reference_code.ilike.%${normalizedQuery}%`)
      .limit(8);

    if (shopResult.error) {
      throw shopResult.error;
    }

    const shopRows = (shopResult.data ?? []) as LocationRow[];
    const shopParticipantsByLocation = await readShopParticipantsByLocationIds(supabase, shopRows.map((row) => row.id));
    for (const shop of shopRows) {
      const primaryShopProfile = pickPrimaryShopProfile(shopParticipantsByLocation.get(shop.id) ?? []);
      if (!primaryShopProfile) {
        continue;
      }

      const publicProfileHref = `/shop/${encodeURIComponent(shop.reference_code ?? shop.id)}`;
      results.set(`shop:${shop.id}`, {
        id: shop.id,
        participantId: shop.id,
        displayName: shop.name,
        resultType: "shop",
        participantType: "shop",
        role: primaryShopProfile.role,
        avatarUrl: null,
        publicProfileHref,
        profileHref: publicProfileHref,
        bookingHref: null,
        existingThreadId: threadLookup.get(`shop:${shop.id}`) ?? null,
        createThreadInput: {
          threadType: "client_shop",
          profileId: primaryShopProfile.id,
          locationId: shop.id
        },
        subtitle: [shop.neighborhood, shop.city].filter(Boolean).join(" | ") || "Shop"
      });
    }
  } catch (error) {
    recordParticipantSearchWarning(warnings, "shop", "Unable to search shop messaging results.", error);
  }

  const payload: MessagingParticipantSearchPayload = {
    results: Array.from(results.values()).slice(0, 12)
  };

  if (warnings.length) {
    payload.warnings = warnings;
  }

  return payload;
}

export async function createMessagingThread(user: UserAccount, input: MessagingCreateThreadInput) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new MessagingServiceError("Messaging is available when Supabase is configured.", 503);
  }

  const actor = await resolveMessagingActor(user, supabase);

  if ("threadType" in input && input.threadType === "support") {
    const supportProfile = await readPrimarySupportProfile(supabase);
    const threadId = await createOrGetSupportThread({
      supabase,
      actorProfile: actor.profile,
      supportProfile
    });

    return getMessagingThreadPayload(user, threadId);
  }

  if ("threadType" in input && input.threadType === "client_barber") {
    if (actor.kind === "barber") {
      const clientProfile = await readProfileById(supabase, input.profileId);
      if (!isClientRole(clientProfile.role)) {
        throw new MessagingServiceError("Selected participant is not a client.", 400);
      }

      const threadId = await createOrGetDirectClientBarberThread({
        supabase,
        clientProfile,
        barberProfile: actor.profile,
        createdByProfileId: actor.profile.id
      });

      return getMessagingThreadPayload(user, threadId);
    }

    if (actor.kind !== "client") {
      throw new MessagingServiceError("Only clients and barbers can start a barber conversation from search.", 403);
    }

    const barberProfile = await readProfileById(supabase, input.profileId);
    if (!isBarberRole(barberProfile.role)) {
      throw new MessagingServiceError("Selected participant is not a barber.", 400);
    }
    const barberResult = await supabase
      .from("barbers")
      .select("id, profile_id, reference_code, booking_slug")
      .eq("profile_id", barberProfile.id)
      .maybeSingle();

    if (barberResult.error) {
      throw new MessagingServiceError("Unable to resolve the barber for messaging.", 500);
    }

    if (!barberResult.data) {
      throw new MessagingServiceError("Selected barber is not available for messaging.", 404);
    }

    const threadId = await createOrGetDirectClientBarberThread({
      supabase,
      clientProfile: actor.profile,
      barberProfile,
      createdByProfileId: actor.profile.id
    });

    return getMessagingThreadPayload(user, threadId);
  }

  if ("appointmentId" in input) {
    const appointmentResult = await supabase
      .from("appointments")
      .select("id, reference_code, confirmation_code, status, starts_at, client_id, barber_id, service_id, location_id")
      .or(`id.eq.${input.appointmentId},reference_code.eq.${input.appointmentId}`)
      .maybeSingle();

    if (appointmentResult.error) {
      throw new MessagingServiceError("Unable to load the appointment for messaging.", 500);
    }

    if (!appointmentResult.data) {
      throw new MessagingServiceError("Appointment not found for messaging.", 404);
    }

    const canonicalAppointmentId = (appointmentResult.data as AppointmentRow).id;
    const appointmentContexts = await readAppointmentContexts(supabase, [appointmentResult.data as AppointmentRow]);
    const appointment = appointmentContexts.get(canonicalAppointmentId);

    if (!appointment) {
      throw new MessagingServiceError("Appointment participants could not be resolved for messaging.", 400);
    }

    assertActorCanCreateClientBarberThread({
      actorProfileId: actor.profile.id,
      actorRole: actor.profile.role,
      appointment: {
        appointmentId: appointment.appointmentId,
        clientProfileId: appointment.clientProfileId,
        barberProfileId: appointment.barberProfileId,
        clientName: appointment.clientName,
        barberName: appointment.barberName,
        barberRole: appointment.barberRole as Extract<Role, "barber_user" | "barber" | "freelance_barber" | "commission_barber" | "booth_rent_barber">,
        serviceName: appointment.serviceName,
        startsAt: appointment.startsAt
      }
    });

    const threadId = await createOrGetClientBarberThread({
      supabase,
      appointment,
      createdByProfileId: actor.profile.id
    });
    return getMessagingThreadPayload(user, threadId);
  }

  const locationLookup = await readLocationsByValues(supabase, [input.locationId, ...(actor.locationIds ?? [])]);
  const location = locationLookup.byValue.get(input.locationId);
  if (!location) {
    throw new MessagingServiceError("Shop location not found for messaging.", 404);
  }

  await assertActorCanReachLocation(supabase, actor, location.id);
  const shopParticipantsByLocation = await readShopParticipantsByLocationIds(supabase, [location.id]);
  const shopParticipants = shopParticipantsByLocation.get(location.id) ?? [];
  if (!shopParticipants.length) {
    throw new MessagingServiceError("No shop-facing participants are available for this location.", 400);
  }

  if (actor.kind === "shop") {
    const counterpartProfile = await readProfileById(supabase, input.profileId);
    assertActorCanCreateShopThread({
      actorRole: actor.profile.role,
      threadType: input.threadType,
      counterpartRole: counterpartProfile.role
    });

    const threadId = await createOrGetShopThread({
      supabase,
      threadType: input.threadType,
      location,
      shopParticipants,
      counterpartProfile,
      createdByProfileId: actor.profile.id
    });

    return getMessagingThreadPayload(user, threadId);
  }

  const primaryShopProfile = pickPrimaryShopProfile(shopParticipants);
  if (!primaryShopProfile) {
    throw new MessagingServiceError("No shop-facing contact is available for this location.", 400);
  }

  if (input.profileId && !shopParticipants.some((profile) => profile.id === input.profileId)) {
    throw new MessagingServiceError("Selected shop contact is not valid for this location.", 400);
  }

  if (actor.kind === "client" && input.threadType !== "client_shop") {
    throw new MessagingServiceError("Clients can only open client-to-shop conversations.", 400);
  }

  if (actor.kind === "barber" && input.threadType !== "barber_shop") {
    throw new MessagingServiceError("Barbers can only open barber-to-shop conversations.", 400);
  }

  assertActorCanCreateShopThread({
    actorRole: actor.profile.role,
    threadType: input.threadType,
    counterpartRole: primaryShopProfile.role
  });

  const threadId = await createOrGetShopThread({
    supabase,
    threadType: input.threadType,
    location,
    shopParticipants,
    counterpartProfile: actor.profile,
    createdByProfileId: actor.profile.id
  });

  return getMessagingThreadPayload(user, threadId);
}

export async function sendMessagingBroadcast(
  user: UserAccount,
  input: {
    locationId: string;
    audience: MessagingBroadcastAudience;
    body: string;
  }
): Promise<MessagingBroadcastResult> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new MessagingServiceError("Messaging is available when Supabase is configured.", 503);
  }

  const actor = await resolveMessagingActor(user, supabase);
  if (actor.kind !== "shop") {
    throw new MessagingServiceError("Only shop-facing roles can send broadcasts.", 403);
  }

  const locationLookup = await readLocationsByValues(supabase, [input.locationId, ...(actor.locationIds ?? [])]);
  const location = locationLookup.byValue.get(input.locationId);
  if (!location) {
    throw new MessagingServiceError("Shop location not found for broadcast.", 404);
  }

  await assertActorCanReachLocation(supabase, actor, location.id);
  const normalizedBody = normalizeMessageBody(input.body);
  const contactData = await readEligibleContacts(supabase, actor, []);
  const targets = contactData.eligibleContacts.filter((contact) => {
    if (contact.locationId !== location.id) {
      return false;
    }

    if (input.audience === "clients") {
      return contact.threadType === "client_shop";
    }

    if (input.audience === "barbers") {
      return contact.threadType === "barber_shop";
    }

    return true;
  });

  if (!targets.length) {
    throw new MessagingServiceError("No recipients are available for this shop broadcast.", 400);
  }

  const shopParticipantsByLocation = await readShopParticipantsByLocationIds(supabase, [location.id]);
  const shopParticipants = shopParticipantsByLocation.get(location.id) ?? [];
  if (!shopParticipants.length) {
    throw new MessagingServiceError("No shop-facing participants are available for this location.", 400);
  }

  const createdAt = new Date().toISOString();
  const threadIds: string[] = [];

  for (const target of targets) {
    const counterpartProfile = await readProfileById(supabase, target.profileId);
    const threadId = await createOrGetShopThread({
      supabase,
      threadType: target.threadType,
      location,
      shopParticipants,
      counterpartProfile,
      createdByProfileId: actor.profile.id
    });

    const insertResult = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        sender_profile_id: actor.profile.id,
        body: normalizedBody,
        message_type: "text",
        created_at: createdAt
      });

    if (insertResult.error) {
      throw new MessagingServiceError("Unable to deliver the shop broadcast.", 500);
    }

    const updateResult = await supabase
      .from("message_threads")
      .update({ updated_at: createdAt })
      .eq("id", threadId);

    if (updateResult.error) {
      throw new MessagingServiceError("Unable to update the shop broadcast thread activity.", 500);
    }

    threadIds.push(threadId);
  }

  return {
    locationId: location.id,
    locationLabel: formatLocationLabel(location),
    audience: input.audience,
    deliveredCount: threadIds.length,
    threadIds
  };
}

export async function sendThreadMessage(user: UserAccount, threadId: string, input: { body: string }) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new MessagingServiceError("Messaging is available when Supabase is configured.", 503);
  }

  const actor = await resolveMessagingActor(user, supabase);
  const membershipResult = await supabase
    .from("thread_participants")
    .select("id")
    .eq("thread_id", threadId)
    .eq("profile_id", actor.profile.id)
    .maybeSingle();

  if (membershipResult.error) {
    throw new MessagingServiceError("Unable to verify thread access.", 500);
  }

  if (!membershipResult.data) {
    throw new MessagingServiceError("Only thread participants can send messages.", 403);
  }

  const normalizedBody = normalizeMessageBody(input.body);
  const createdAt = new Date().toISOString();
  const insertResult = await supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_profile_id: actor.profile.id,
      body: normalizedBody,
      message_type: "text",
      created_at: createdAt
    })
    .select("id, thread_id, sender_profile_id, body, message_type, created_at")
    .single();

  if (insertResult.error) {
    throw new MessagingServiceError("Unable to send the message.", 500);
  }

  const updateResult = await supabase
    .from("message_threads")
    .update({ updated_at: createdAt })
    .eq("id", threadId);

  if (updateResult.error) {
    throw new MessagingServiceError("Unable to update the thread activity.", 500);
  }

  const message = insertResult.data as MessageRow;

  return {
    message: {
      id: message.id,
      body: message.body,
      messageType: message.message_type,
      createdAt: message.created_at,
      senderName: actor.profile.full_name ?? actor.profile.email,
      senderRole: actor.profile.role,
      isOwn: true
    }
  };
}

type ArchitectMessagingActor = Pick<UserAccount, "id" | "email" | "name" | "role">;

function buildArchitectSupportThreadSummary(input: {
  thread: MessageThreadRow;
  supportProfileId: string;
  participants: ThreadParticipantRow[];
  profilesById: Map<string, ProfileRow>;
  publicMetadataByProfileId: Map<string, PublicMessagingMetadata>;
  latestMessageByThreadId: Map<string, MessageRow>;
  appointmentContexts: Map<string, HydratedAppointmentContext>;
  locationLabels: Map<string, string>;
  messages: MessageRow[];
}): ArchitectSupportThreadSummary {
  const summary = buildThreadSummary({
    thread: input.thread,
    currentProfileId: input.supportProfileId,
    participants: input.participants,
    profilesById: input.profilesById,
    publicMetadataByProfileId: input.publicMetadataByProfileId,
    latestMessageByThreadId: input.latestMessageByThreadId,
    appointmentContexts: input.appointmentContexts,
    locationLabels: input.locationLabels
  });
  const supportParticipants = input.participants.filter((participant) => participant.thread_id === input.thread.id);
  const clientParticipant = supportParticipants.find((participant) => participant.profile_id !== input.supportProfileId) ?? null;
  const clientProfile = clientParticipant ? input.profilesById.get(clientParticipant.profile_id) ?? null : null;
  const latestReportMessage = input.messages
    .filter((message) => {
      const body = message.body.toLowerCase();
      return message.thread_id === input.thread.id && (body.includes("report received") || body.includes("report submitted"));
    })
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0] ?? null;

  return {
    ...summary,
    client: clientParticipant && clientProfile
      ? {
          profileId: clientParticipant.profile_id,
          fullName: clientProfile.full_name ?? clientProfile.email,
          role: clientProfile.role
        }
      : null,
    reportContext: {
      present: Boolean(latestReportMessage),
      preview: latestReportMessage ? truncateSupportText(latestReportMessage.body, 180) : null
    },
    status: "open"
  };
}

export async function getArchitectSupportInboxPayload(actor: ArchitectMessagingActor): Promise<ArchitectSupportInboxPayload> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      available: false,
      viewer: {
        profileId: actor.id,
        fullName: actor.name,
        role: actor.role
      },
      threads: []
    };
  }

  const supportProfile = await readPrimarySupportProfile(supabase);
  const threadsResult = await supabase
    .from("message_threads")
    .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
    .eq("thread_type", "support")
    .order("updated_at", { ascending: false })
    .limit(75);

  if (threadsResult.error) {
    throw new MessagingServiceError("Unable to load Architect support conversations.", 500);
  }

  const threadIds = ((threadsResult.data ?? []) as MessageThreadRow[]).map((thread) => thread.id);
  const bundle = await readThreadBundle(supabase, supportProfile.id, threadIds);

  return {
    available: true,
    viewer: {
      profileId: supportProfile.id,
      fullName: supportProfile.full_name ?? "BVRB3R Support",
      role: supportProfile.role
    },
    threads: bundle.threads.map((thread) =>
      buildArchitectSupportThreadSummary({
        thread,
        supportProfileId: supportProfile.id,
        participants: bundle.participants,
        profilesById: bundle.profilesById,
        publicMetadataByProfileId: bundle.publicMetadataByProfileId,
        latestMessageByThreadId: bundle.latestMessageByThreadId,
        appointmentContexts: bundle.appointmentContexts,
        locationLabels: bundle.locationLabels,
        messages: bundle.messages
      })
    )
  };
}

export async function getArchitectSupportThreadPayload(
  actor: ArchitectMessagingActor,
  threadId: string
): Promise<ArchitectSupportThreadPayload> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      available: false,
      viewer: {
        profileId: actor.id,
        fullName: actor.name,
        role: actor.role
      },
      thread: null,
      messages: []
    };
  }

  const supportProfile = await readPrimarySupportProfile(supabase);
  const threadResult = await supabase
    .from("message_threads")
    .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
    .eq("id", threadId)
    .eq("thread_type", "support")
    .maybeSingle();

  if (threadResult.error) {
    throw new MessagingServiceError("Unable to load the support conversation.", 500);
  }

  if (!threadResult.data) {
    throw new MessagingServiceError("Support conversation not found.", 404);
  }

  const bundle = await readThreadBundle(supabase, supportProfile.id, [threadId]);
  const thread = bundle.threads[0] ?? (threadResult.data as MessageThreadRow);
  const threadParticipants = bundle.participants.filter((participant) => participant.thread_id === threadId);
  const threadSummary = buildArchitectSupportThreadSummary({
    thread,
    supportProfileId: supportProfile.id,
    participants: bundle.participants,
    profilesById: bundle.profilesById,
    publicMetadataByProfileId: bundle.publicMetadataByProfileId,
    latestMessageByThreadId: bundle.latestMessageByThreadId,
    appointmentContexts: bundle.appointmentContexts,
    locationLabels: bundle.locationLabels,
    messages: bundle.messages
  });

  return {
    available: true,
    viewer: {
      profileId: supportProfile.id,
      fullName: supportProfile.full_name ?? "BVRB3R Support",
      role: supportProfile.role
    },
    thread: {
      ...threadSummary,
      participants: threadParticipants.map((participant) => {
        const profile = bundle.profilesById.get(participant.profile_id);
        const metadata = bundle.publicMetadataByProfileId.get(participant.profile_id) ?? null;
        return {
          profileId: participant.profile_id,
          fullName: profile?.full_name ?? profile?.email ?? participant.profile_id,
          role: participant.thread_role,
          isSelf: participant.profile_id === supportProfile.id,
          avatarUrl: metadata?.avatarUrl ?? null,
          publicProfileHref: metadata?.publicProfileHref ?? null,
          bookingHref: metadata?.bookingHref ?? null
        };
      })
    },
    messages: [...bundle.messages]
      .filter((message) => message.thread_id === threadId)
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
      .map((message) => {
        const sender = message.sender_profile_id ? bundle.profilesById.get(message.sender_profile_id) ?? null : null;
        return {
          id: message.id,
          body: message.body,
          messageType: message.message_type,
          createdAt: message.created_at,
          senderName: sender ? (sender.full_name ?? sender.email) : null,
          senderRole: sender?.role ?? null,
          isOwn: message.sender_profile_id === supportProfile.id
        };
      })
  };
}

export async function sendArchitectSupportThreadReply(
  actor: ArchitectMessagingActor,
  threadId: string,
  input: { body: string }
) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new MessagingServiceError("Messaging is available when Supabase is configured.", 503);
  }

  const supportProfile = await readPrimarySupportProfile(supabase);
  const threadResult = await supabase
    .from("message_threads")
    .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
    .eq("id", threadId)
    .eq("thread_type", "support")
    .maybeSingle();

  if (threadResult.error) {
    throw new MessagingServiceError("Unable to verify the support conversation.", 500);
  }

  if (!threadResult.data) {
    throw new MessagingServiceError("Support conversation not found.", 404);
  }

  const participantsResult = await supabase
    .from("thread_participants")
    .select("id, thread_id, profile_id, thread_role, created_at")
    .eq("thread_id", threadId);

  if (participantsResult.error) {
    throw new MessagingServiceError("Unable to verify support participants.", 500);
  }

  await ensureThreadParticipants(
    supabase,
    threadId,
    (participantsResult.data ?? []) as ThreadParticipantRow[],
    [supportProfile]
  );

  const normalizedBody = normalizeMessageBody(input.body);
  const createdAt = new Date().toISOString();
  const insertResult = await supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_profile_id: supportProfile.id,
      body: normalizedBody,
      message_type: "text",
      created_at: createdAt
    })
    .select("id, thread_id, sender_profile_id, body, message_type, created_at")
    .single();

  if (insertResult.error) {
    throw new MessagingServiceError("Unable to send the support reply.", 500);
  }

  const updateResult = await supabase
    .from("message_threads")
    .update({ updated_at: createdAt })
    .eq("id", threadId);

  if (updateResult.error) {
    throw new MessagingServiceError("Unable to update the support thread activity.", 500);
  }

  const message = insertResult.data as MessageRow;
  console.info("[architect-messages] support_reply_sent", {
    threadId,
    actorProfileIdPresent: Boolean(actor.id),
    supportProfileIdPresent: Boolean(supportProfile.id),
    messageId: message.id
  });

  return {
    message: {
      id: message.id,
      body: message.body,
      messageType: message.message_type,
      createdAt: message.created_at,
      senderName: supportProfile.full_name ?? supportProfile.email,
      senderRole: supportProfile.role,
      isOwn: true
    }
  };
}
