import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  assertActorCanCreateClientBarberThread,
  assertActorCanCreateShopThread,
  buildAppointmentThreadSystemMessage,
  buildShopThreadSystemMessage,
  isBarberRole,
  isShopRole,
  normalizeMessageBody,
  type MessagingMessageType,
  type MessagingThreadType
} from "@/lib/messages/domain";
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
};

export type MessagingThreadParticipantView = {
  profileId: string;
  fullName: string;
  role: Role;
  isSelf: boolean;
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
};

export type MessagingCreateThreadInput =
  | {
      appointmentId: string;
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

type ThreadBundle = {
  threads: MessageThreadRow[];
  participants: ThreadParticipantRow[];
  profilesById: Map<string, ProfileRow>;
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
  return role === "client" || isBarberRole(role) || isShopRole(role);
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

function shopRolePriority(role: Role) {
  if (role === "front_desk") {
    return 0;
  }
  if (role === "manager") {
    return 1;
  }
  if (role === "owner") {
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

  if (user.role === "client") {
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
    .select("id, profile_id")
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
    supabase.from("barbers").select("id, profile_id").in("id", barberIds),
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
      barberRole: barberProfile.role
    });
  }

  return appointmentMap;
}

function buildThreadSummary(input: {
  thread: MessageThreadRow;
  currentProfileId: string;
  participants: ThreadParticipantRow[];
  profilesById: Map<string, ProfileRow>;
  latestMessageByThreadId: Map<string, MessageRow>;
  appointmentContexts: Map<string, HydratedAppointmentContext>;
  locationLabels: Map<string, string>;
}): MessagingThreadSummary {
  const threadParticipants = input.participants.filter((participant) => participant.thread_id === input.thread.id);
  const counterpartParticipant = threadParticipants.find((participant) => participant.profile_id !== input.currentProfileId) ?? null;
  const counterpartProfile = counterpartParticipant ? input.profilesById.get(counterpartParticipant.profile_id) ?? null : null;
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
          role: counterpartProfile.role
        }
      : null,
    appointmentContext: appointmentContext
      ? {
          appointmentId: appointmentContext.appointmentId,
          confirmationCode: appointmentContext.confirmationCode,
          status: appointmentContext.status,
          statusLabel: appointmentContext.statusLabel,
          startsAt: appointmentContext.startsAt,
          serviceName: appointmentContext.serviceName,
          locationLabel: appointmentContext.locationLabel
        }
      : null,
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
      profilesById: new Map<string, ProfileRow>(),
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
    profilesById,
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
      counterpart: actor.profile.role === "client"
        ? {
            profileId: context.barberProfileId,
            fullName: context.barberName,
            role: context.barberRole
          }
        : {
            profileId: context.clientProfileId,
            fullName: context.clientName,
            role: "client" as const
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
          role: "client",
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

  const bundle = await readThreadBundle(supabase, actor.profile.id, [threadId]);
  const thread = bundle.threads[0];

  if (!thread) {
    throw new MessagingServiceError("Message thread not found.", 404);
  }

  const messagesResult = await supabase
    .from("messages")
    .select("id, thread_id, sender_profile_id, body, message_type, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (messagesResult.error) {
    throw new MessagingServiceError("Unable to load thread messages.", 500);
  }

  const threadParticipants = bundle.participants.filter((participant) => participant.thread_id === threadId);
  const threadSummary = buildThreadSummary({
    thread,
    currentProfileId: actor.profile.id,
    participants: bundle.participants,
    profilesById: bundle.profilesById,
    latestMessageByThreadId: bundle.latestMessageByThreadId,
    appointmentContexts: bundle.appointmentContexts,
    locationLabels: bundle.locationLabels
  });

  return {
    available: true,
    viewer: baseViewer(user, actor.profile.id),
    thread: {
      ...threadSummary,
      participants: threadParticipants.map((participant) => {
        const profile = bundle.profilesById.get(participant.profile_id);
        return {
          profileId: participant.profile_id,
          fullName: profile?.full_name ?? profile?.email ?? participant.profile_id,
          role: participant.thread_role,
          isSelf: participant.profile_id === actor.profile.id
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
    })
  };
}

export async function createMessagingThread(user: UserAccount, input: MessagingCreateThreadInput) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new MessagingServiceError("Messaging is available when Supabase is configured.", 503);
  }

  const actor = await resolveMessagingActor(user, supabase);

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
    const existingThreadResult = await supabase
      .from("message_threads")
      .select("id")
      .eq("appointment_id", canonicalAppointmentId)
      .eq("thread_type", "client_barber")
      .maybeSingle();

    if (existingThreadResult.error) {
      throw new MessagingServiceError("Unable to look up the appointment conversation.", 500);
    }

    if (existingThreadResult.data) {
      return getMessagingThreadPayload(user, existingThreadResult.data.id as string);
    }

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
        barberRole: appointment.barberRole as Extract<Role, "commission_barber" | "booth_rent_barber">,
        serviceName: appointment.serviceName,
        startsAt: appointment.startsAt
      }
    });

    const threadInsert = await supabase
      .from("message_threads")
      .insert({
        thread_type: "client_barber",
        appointment_id: appointment.appointmentId,
        location_id: appointment.locationId,
        created_by_profile_id: actor.profile.id,
        updated_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (threadInsert.error) {
      throw new MessagingServiceError("Unable to create the appointment conversation.", 500);
    }

    const threadId = threadInsert.data.id as string;
    const participantInsert = await supabase
      .from("thread_participants")
      .insert([
        {
          thread_id: threadId,
          profile_id: appointment.clientProfileId,
          thread_role: "client"
        },
        {
          thread_id: threadId,
          profile_id: appointment.barberProfileId,
          thread_role: appointment.barberRole
        }
      ]);

    if (participantInsert.error) {
      throw new MessagingServiceError("Unable to attach messaging participants.", 500);
    }

    const systemMessageInsert = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        sender_profile_id: null,
        body: buildAppointmentThreadSystemMessage({
          appointmentId: appointment.appointmentId,
          clientProfileId: appointment.clientProfileId,
          barberProfileId: appointment.barberProfileId,
          clientName: appointment.clientName,
          barberName: appointment.barberName,
          barberRole: appointment.barberRole as Extract<Role, "commission_barber" | "booth_rent_barber">,
          serviceName: appointment.serviceName,
          startsAt: appointment.startsAt
        }),
        message_type: "system"
      });

    if (systemMessageInsert.error) {
      throw new MessagingServiceError("Unable to write the appointment system message.", 500);
    }

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
