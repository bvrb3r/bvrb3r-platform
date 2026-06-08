import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBarberReportTarget } from "@/lib/trust/report-targets";
import { CANONICAL_PLATFORM_ADMIN_EMAIL } from "@/lib/auth/demo-auth";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { toPublicMediaUrl } from "@/lib/profile/public-media-url";
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
  public_username?: string | null;
  profile_photo_path?: string | null;
  profile_photo_url?: string | null;
  public_city?: string | null;
  public_state?: string | null;
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
  public_address?: string | null;
  public_city?: string | null;
  public_state?: string | null;
  public_zip?: string | null;
  service_area_label?: string | null;
  visibility_state?: string | null;
};

type ShopPublicIdentityRow = {
  id: string;
  name: string | null;
  public_username: string | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code?: string | null;
  owner_profile_id?: string | null;
};

type PublicUsernameRegistryRow = {
  owner_type: "client" | "barber" | "shop";
  owner_id: string;
  username: string;
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
  created_at?: string | null;
  updated_at?: string | null;
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
  source?: "location" | "shop";
};

type ResolvedMessageShopTarget = {
  location: LocationRow | null;
  participants: ProfileRow[];
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
  last_read_at: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_profile_id: string | null;
  body: string;
  message_type: MessagingMessageType;
  metadata?: MessagingMessageMetadata | null;
  created_at: string;
};

type MessageRequestStatus = "pending" | "accepted" | "declined" | "blocked" | "reported";
type MessageThreadLifecycleStatus = "active" | "request_pending" | "request_declined" | "blocked" | "reported" | "closed";

type MessageThreadRequestRow = {
  id: string;
  thread_id: string;
  requested_by_profile_id: string;
  requested_to_profile_id: string;
  request_status: MessageRequestStatus;
  first_message_id: string | null;
  accepted_at: string | null;
  accepted_by_profile_id: string | null;
  declined_at: string | null;
  declined_by_profile_id: string | null;
  blocked_at: string | null;
  blocked_by_profile_id: string | null;
  reported_at: string | null;
  reported_by_profile_id: string | null;
  report_reason: string | null;
  created_at: string;
  updated_at: string;
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
  displayName: string | null;
  publicUsername: string | null;
  publicProfileHref: string | null;
  bookingHref: string | null;
  publicContextLine: string | null;
};

export type MessagingThreadParticipantView = {
  profileId: string;
  fullName: string;
  role: Role;
  isSelf: boolean;
  avatarUrl?: string | null;
  publicUsername?: string | null;
  publicContextLine?: string | null;
  publicProfileHref?: string | null;
  bookingHref?: string | null;
};

export type MessagingMessageView = {
  id: string;
  body: string;
  messageType: MessagingMessageType;
  metadata?: MessagingMessageMetadata | null;
  createdAt: string;
  senderName: string | null;
  senderRole: Role | null;
  isOwn: boolean;
};

export type PosPaymentRequestMessageMetadata = {
  kind: "pos_payment_request";
  paymentRequestId: string;
  posSaleId: string;
  amountCents: number;
  status: "pending" | "pending_approval" | "pending_message_failed" | "approved" | "paid" | "declined" | "failed" | "expired" | "canceled" | "superseded" | "canceled_duplicate";
};

export type MessagingMessageMetadata =
  | PosPaymentRequestMessageMetadata
  | (Record<string, unknown> & { kind?: string });

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
    publicUsername?: string | null;
    publicContextLine?: string | null;
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
  hasUnread?: boolean;
  lifecycleStatus?: MessageThreadLifecycleStatus;
  request?: {
    id: string;
    status: MessageRequestStatus;
    requestedByProfileId: string;
    requestedToProfileId: string;
    isRequester: boolean;
    isRecipient: boolean;
    firstMessageId: string | null;
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
    publicUsername?: string | null;
    publicContextLine?: string | null;
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
  publicUsername?: string | null;
  publicContextLine?: string | null;
  publicProfileHref?: string | null;
  profileHref: string | null;
  bookingHref?: string | null;
  existingThreadId?: string | null;
  createThreadInput?: MessagingCreateThreadInput | null;
  messageDisabledReason?: string | null;
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
      locationId?: string | null;
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
  requestsByThreadId: Map<string, MessageThreadRequestRow>;
  profilesById: Map<string, ProfileRow>;
  publicMetadataByProfileId: Map<string, PublicMessagingMetadata>;
  publicMetadataByLocationId: Map<string, PublicMessagingMetadata>;
  latestMessageByThreadId: Map<string, MessageRow>;
  appointmentContexts: Map<string, HydratedAppointmentContext>;
  latestAppointmentContextsByThreadId: Map<string, HydratedAppointmentContext>;
  locationLabels: Map<string, string>;
};

export class MessagingServiceError extends Error {
  status: number;
  code: string;
  step: string;
  diagnostics?: Record<string, unknown>;

  constructor(message: string, status = 400, code = "messaging_error", step = "unknown", diagnostics?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.step = step;
    this.diagnostics = diagnostics;
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

function toDatabaseThreadRole(role: Role): Role {
  if (isClientRole(role)) {
    return "client";
  }

  if (isShopRole(role) || role === "platform_admin" || role === "architect") {
    return "owner";
  }

  if (role === "booth_rent_barber") {
    return "booth_rent_barber";
  }

  if (isBarberRole(role)) {
    return "commission_barber";
  }

  return role;
}

function getSupabaseErrorDetails(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null | undefined;
  return {
    supabaseCode: candidate?.code ?? null,
    supabaseMessage: candidate?.message ?? null,
    supabaseDetails: candidate?.details ?? null,
    supabaseHint: candidate?.hint ?? null
  };
}

function buildCreateOpenDiagnostics(input: {
  actorRole: Role;
  actorProfileId: string;
  targetType: string;
  targetIdKind: string;
  resolvedThreadType: MessagingThreadType | "appointment" | "support";
}) {
  return {
    route: "/api/messages/threads",
    actorRole: input.actorRole,
    actorProfileId: input.actorProfileId,
    targetType: input.targetType,
    targetIdKind: input.targetIdKind,
    resolvedThreadType: input.resolvedThreadType,
    failedStep: null as string | null,
    supabaseCode: null as string | null,
    supabaseMessage: null as string | null,
    supabaseDetails: null as string | null,
    threadInserted: false,
    participantsInserted: false,
    systemMessageInserted: false,
    returnedThreadId: null as string | null
  };
}

function markCreateOpenFailure(
  diagnostics: ReturnType<typeof buildCreateOpenDiagnostics> | undefined,
  step: string,
  error?: unknown
) {
  if (!diagnostics) {
    return undefined;
  }

  const supabaseDetails = getSupabaseErrorDetails(error);
  diagnostics.failedStep = step;
  diagnostics.supabaseCode = supabaseDetails.supabaseCode;
  diagnostics.supabaseMessage = supabaseDetails.supabaseMessage;
  diagnostics.supabaseDetails = supabaseDetails.supabaseDetails;
  return { ...diagnostics };
}

function isMissingMessageLifecycleTable(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message ?? "";
  return candidate?.code === "42P01"
    || candidate?.code === "PGRST205"
    || (/message_thread_requests|message_user_blocks|message_reports/i.test(message) && /schema cache|relation|table|could not find/i.test(message));
}

function toThreadLifecycleStatus(request: MessageThreadRequestRow | null): MessageThreadLifecycleStatus {
  if (!request) {
    return "active";
  }

  if (request.request_status === "pending") {
    return "request_pending";
  }

  if (request.request_status === "declined") {
    return "request_declined";
  }

  if (request.request_status === "blocked") {
    return "blocked";
  }

  if (request.request_status === "reported") {
    return "reported";
  }

  return "active";
}

function requestViewForThread(request: MessageThreadRequestRow | null, currentProfileId: string): MessagingThreadSummary["request"] {
  if (!request) {
    return null;
  }

  return {
    id: request.id,
    status: request.request_status,
    requestedByProfileId: request.requested_by_profile_id,
    requestedToProfileId: request.requested_to_profile_id,
    isRequester: request.requested_by_profile_id === currentProfileId,
    isRecipient: request.requested_to_profile_id === currentProfileId,
    firstMessageId: request.first_message_id
  };
}

function shopToLocationRow(shop: ShopPublicIdentityRow): LocationRow {
  return {
    id: shop.id,
    reference_code: shop.public_username,
    name: cleanText(shop.name) ?? cleanText(shop.public_username) ?? "BVRB3R Shop",
    neighborhood: cleanText(shop.address) ?? "",
    city: cleanText(shop.city) ?? "",
    state: cleanText(shop.state) ?? "",
    source: "shop"
  };
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

function normalizeMessageMetadata(value: unknown): MessagingMessageMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as MessagingMessageMetadata;
}

function isMessageMetadataColumnError(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message ?? "";
  return candidate?.code === "42703"
    || candidate?.code === "PGRST204"
    || (/metadata/i.test(message) && /schema cache|column|could not find/i.test(message));
}

function isThreadParticipantReadColumnError(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message ?? "";
  return candidate?.code === "42703"
    || candidate?.code === "PGRST204"
    || (/last_read_at|thread_participants/i.test(message) && /schema cache|column|could not find/i.test(message));
}

async function selectThreadParticipantsForThreads(input: {
  supabase: SupabaseClient;
  threadIds: string[];
}) {
  const withReadState = await input.supabase
    .from("thread_participants")
    .select("id, thread_id, profile_id, thread_role, created_at, last_read_at")
    .in("thread_id", input.threadIds);

  if (!withReadState.error) {
    return {
      data: (withReadState.data ?? []) as ThreadParticipantRow[],
      error: null
    };
  }

  if (!isThreadParticipantReadColumnError(withReadState.error)) {
    return {
      data: [],
      error: withReadState.error
    };
  }

  console.warn("[messages] thread_participant_read_state_column_fallback", {
    threadCount: input.threadIds.length,
    postgresCode: withReadState.error.code ?? null,
    postgresMessage: withReadState.error.message ?? null
  });

  const withoutReadState = await input.supabase
    .from("thread_participants")
    .select("id, thread_id, profile_id, thread_role, created_at")
    .in("thread_id", input.threadIds);

  if (withoutReadState.error) {
    return {
      data: [],
      error: withoutReadState.error
    };
  }

  return {
    data: ((withoutReadState.data ?? []) as Omit<ThreadParticipantRow, "last_read_at">[]).map((participant) => ({
      ...participant,
      last_read_at: null
    })),
    error: null
  };
}

function extractPosPaymentRequestIdFromBody(body: string | null | undefined) {
  return body?.match(/Payment request ID:\s*([^\s]+)/i)?.[1] ?? null;
}

function getPosPaymentRequestMetadata(value: unknown): PosPaymentRequestMessageMetadata | null {
  const metadata = normalizeMessageMetadata(value);
  if (metadata?.kind !== "pos_payment_request") {
    return null;
  }

  const paymentRequestId = typeof metadata.paymentRequestId === "string" ? metadata.paymentRequestId : null;
  const posSaleId = typeof metadata.posSaleId === "string" ? metadata.posSaleId : null;
  const amountCents = Number(metadata.amountCents ?? 0);
  const status = typeof metadata.status === "string" ? metadata.status : "pending";
  if (!paymentRequestId || !posSaleId) {
    return null;
  }

  const knownStatuses: PosPaymentRequestMessageMetadata["status"][] = [
    "pending",
    "pending_approval",
    "pending_message_failed",
    "approved",
    "paid",
    "declined",
    "failed",
    "expired",
    "canceled",
    "superseded",
    "canceled_duplicate"
  ];

  return {
    kind: "pos_payment_request",
    paymentRequestId,
    posSaleId,
    amountCents: Number.isFinite(amountCents) ? amountCents : 0,
    status: knownStatuses.includes(status as PosPaymentRequestMessageMetadata["status"])
      ? (status as PosPaymentRequestMessageMetadata["status"])
      : "pending"
  };
}

export function isThreadUnreadForViewer(input: {
  latestMessage: { sender_profile_id: string | null; created_at: string } | null;
  currentProfileId: string;
  lastReadAt?: string | null;
}) {
  const latestIncomingCreatedAt = input.latestMessage && input.latestMessage.sender_profile_id !== input.currentProfileId
    ? new Date(input.latestMessage.created_at).getTime()
    : null;
  const lastReadAt = input.lastReadAt ? new Date(input.lastReadAt).getTime() : null;

  return latestIncomingCreatedAt !== null
    && Number.isFinite(latestIncomingCreatedAt)
    && (
      !lastReadAt
      || !Number.isFinite(lastReadAt)
      || latestIncomingCreatedAt > lastReadAt
    );
}

async function selectMessagesForThreads(input: {
  supabase: SupabaseClient;
  threadIds: string[];
  ascending: boolean;
  errorMessage: string;
}) {
  const withMetadata = await input.supabase
    .from("messages")
    .select("id, thread_id, sender_profile_id, body, message_type, metadata, created_at")
    .in("thread_id", input.threadIds)
    .order("created_at", { ascending: input.ascending });

  if (!withMetadata.error) {
    return {
      data: (withMetadata.data ?? []) as MessageRow[],
      error: null
    };
  }

  if (!isMessageMetadataColumnError(withMetadata.error)) {
    return {
      data: [],
      error: withMetadata.error
    };
  }

  console.warn("[messages] metadata_column_fallback", {
    threadCount: input.threadIds.length,
    postgresCode: withMetadata.error.code ?? null,
    postgresMessage: withMetadata.error.message ?? null
  });

  const withoutMetadata = await input.supabase
    .from("messages")
    .select("id, thread_id, sender_profile_id, body, message_type, created_at")
    .in("thread_id", input.threadIds)
    .order("created_at", { ascending: input.ascending });

  if (withoutMetadata.error) {
    return {
      data: [],
      error: withoutMetadata.error
    };
  }

  return {
    data: ((withoutMetadata.data ?? []) as MessageRow[]).map((message) => ({
      ...message,
      metadata: null
    })),
    error: null
  };
}

async function readMessageThreadRequestsByThreadIds(supabase: SupabaseClient, threadIds: string[]) {
  const uniqueThreadIds = unique(threadIds.filter(Boolean));
  if (!uniqueThreadIds.length) {
    return new Map<string, MessageThreadRequestRow>();
  }

  const result = await supabase
    .from("message_thread_requests")
    .select("id, thread_id, requested_by_profile_id, requested_to_profile_id, request_status, first_message_id, accepted_at, accepted_by_profile_id, declined_at, declined_by_profile_id, blocked_at, blocked_by_profile_id, reported_at, reported_by_profile_id, report_reason, created_at, updated_at")
    .in("thread_id", uniqueThreadIds);

  if (result.error) {
    if (isMissingMessageLifecycleTable(result.error)) {
      console.warn("[messages] message_request_lifecycle_table_missing", {
        threadCount: uniqueThreadIds.length,
        postgresCode: result.error.code ?? null,
        postgresMessage: result.error.message ?? null
      });
      return new Map<string, MessageThreadRequestRow>();
    }

    throw new MessagingServiceError("Unable to load message request state.", 500);
  }

  return new Map(((result.data ?? []) as MessageThreadRequestRow[]).map((row) => [row.thread_id, row]));
}

async function readThreadMessagesForLifecycle(supabase: SupabaseClient, threadId: string) {
  const result = await selectMessagesForThreads({
    supabase,
    threadIds: [threadId],
    ascending: true,
    errorMessage: "Unable to load thread messages."
  });

  if (result.error) {
    throw new MessagingServiceError("Unable to load thread messages.", 500);
  }

  return (result.data ?? []) as MessageRow[];
}

async function readPosPaymentRequestSnapshots(
  supabase: SupabaseClient,
  requestIds: string[]
) {
  const ids = unique(requestIds.filter(Boolean));
  if (!ids.length) {
    return new Map<string, PosPaymentRequestMessageMetadata>();
  }

  const result = await supabase
    .from("pos_payment_requests")
    .select("id, pos_sale_id, amount_cents, status")
    .in("id", ids);

  if (result.error) {
    console.warn("[messages] pos_payment_request_snapshot_read_failed", {
      requestCount: ids.length,
      postgresCode: result.error.code ?? null,
      postgresMessage: result.error.message ?? null
    });
    return new Map<string, PosPaymentRequestMessageMetadata>();
  }

  const knownStatuses: PosPaymentRequestMessageMetadata["status"][] = [
    "pending",
    "pending_approval",
    "pending_message_failed",
    "approved",
    "paid",
    "declined",
    "failed",
    "expired",
    "canceled",
    "superseded",
    "canceled_duplicate"
  ];

  return new Map(
    ((result.data ?? []) as Array<{ id: string; pos_sale_id: string; amount_cents: number; status: PosPaymentRequestMessageMetadata["status"] }>)
      .map((row) => [row.id, {
        kind: "pos_payment_request" as const,
        paymentRequestId: row.id,
        posSaleId: row.pos_sale_id,
        amountCents: Number(row.amount_cents ?? 0),
        status: knownStatuses.includes(row.status)
          ? row.status
          : "pending"
      }])
  );
}

function hydrateMessageMetadata(
  value: unknown,
  paymentRequestSnapshots: Map<string, PosPaymentRequestMessageMetadata>,
  body?: string | null
) {
  const requestMetadata = getPosPaymentRequestMetadata(value);
  if (requestMetadata) {
    const snapshot = paymentRequestSnapshots.get(requestMetadata.paymentRequestId);
    return {
      ...requestMetadata,
      posSaleId: snapshot?.posSaleId ?? requestMetadata.posSaleId,
      amountCents: snapshot?.amountCents ?? requestMetadata.amountCents,
      status: snapshot?.status ?? requestMetadata.status
    };
  }

  const fallbackRequestId = extractPosPaymentRequestIdFromBody(body);
  if (fallbackRequestId) {
    return paymentRequestSnapshots.get(fallbackRequestId) ?? null;
  }

  return normalizeMessageMetadata(value);
}

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "");
}

function searchMatches(value: string | null | undefined, query: string) {
  const normalizedValue = normalizeSearchText(value ?? "");
  return Boolean(normalizedValue?.includes(query));
}

function getThreadSearchKey(thread: MessagingThreadSummary) {
  if (thread.threadType === "support") {
    return `support:${thread.counterpart?.profileId ?? "bvrb3r"}`;
  }

  if (thread.threadType === "client_barber" && thread.counterpart?.profileId) {
    return isClientRole(thread.counterpart.role)
      ? `client:${thread.counterpart.profileId}`
      : `barber:${thread.counterpart.profileId}`;
  }

  if (thread.threadType === "client_shop" && thread.locationId) {
    return thread.counterpart && isClientRole(thread.counterpart.role)
      ? `client:${thread.counterpart.profileId}`
      : `shop:${thread.locationId}`;
  }

  if (thread.threadType === "client_shop" && thread.counterpart?.profileId) {
    return thread.counterpart && isClientRole(thread.counterpart.role)
      ? `client:${thread.counterpart.profileId}`
      : `shop-profile:${thread.counterpart.profileId}`;
  }

  if (thread.threadType === "barber_shop" && thread.locationId) {
    return thread.counterpart && isBarberRole(thread.counterpart.role)
      ? `barber:${thread.counterpart.profileId}`
      : `shop:${thread.locationId}`;
  }

  if (thread.threadType === "barber_shop" && thread.counterpart?.profileId) {
    return thread.counterpart && isBarberRole(thread.counterpart.role)
      ? `barber:${thread.counterpart.profileId}`
      : `shop-profile:${thread.counterpart.profileId}`;
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

function isOptionalPublicUsernameRegistryError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");

  return code === "42P01"
    || code === "PGRST205"
    || message.toLowerCase().includes("public_usernames")
    || message.toLowerCase().includes("could not find the table");
}

async function readPublicUsernameRegistryMatches(supabase: SupabaseClient, normalizedQuery: string) {
  const empty = {
    clientProfileIds: [] as string[],
    barberReferences: [] as string[],
    shopIds: [] as string[]
  };

  if (!normalizedQuery) {
    return empty;
  }

  try {
    const result = await supabase
      .from("public_usernames")
      .select("owner_type, owner_id, username")
      .ilike("username", `%${normalizedQuery}%`)
      .limit(24);

    if (result.error) {
      throw result.error;
    }

    const rows = (result.data ?? []) as PublicUsernameRegistryRow[];
    return {
      clientProfileIds: unique(rows.filter((row) => row.owner_type === "client").map((row) => row.owner_id).filter(Boolean)),
      barberReferences: unique(rows.filter((row) => row.owner_type === "barber").map((row) => row.owner_id).filter(Boolean)),
      shopIds: unique(rows.filter((row) => row.owner_type === "shop").map((row) => row.owner_id).filter(Boolean))
    };
  } catch (error) {
    if (!isOptionalPublicUsernameRegistryError(error)) {
      console.warn("[messages] public_username_registry_search_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }

    return empty;
  }
}

function formatCityState(city?: string | null, state?: string | null) {
  return [cleanText(city), cleanText(state)].filter(Boolean).join(", ") || null;
}

function formatPublicHandle(username?: string | null) {
  const clean = cleanText(username)?.replace(/^@+/, "");
  return clean ? `@${clean}` : null;
}

function getPublicFallbackName(role?: Role | null) {
  if (!role) {
    return "BVRB3R";
  }

  if (isClientRole(role)) {
    return "BVRB3R Client";
  }

  if (isBarberRole(role)) {
    return "BVRB3R Barber";
  }

  if (isShopRole(role)) {
    return "BVRB3R Shop";
  }

  if (role === "platform_admin") {
    return "BVRB3R Support";
  }

  return "BVRB3R";
}

function getPublicMessagingDisplayName(input: {
  role?: Role | null;
  username?: string | null;
  publicDisplayName?: string | null;
}) {
  return formatPublicHandle(input.username)
    ?? cleanText(input.publicDisplayName)
    ?? getPublicFallbackName(input.role);
}

function formatPublicAddress(input: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const cityStateZip = [formatCityState(input.city, input.state), cleanText(input.zip)].filter(Boolean).join(" ");
  return [cleanText(input.address), cityStateZip].filter(Boolean).join(" - ") || null;
}

function getPublicProfileMediaUrl(supabase: SupabaseClient, row?: { profile_photo_path?: string | null; profile_photo_url?: string | null } | null) {
  return toPublicMediaUrl(supabase, row?.profile_photo_path, row?.profile_photo_url);
}

function buildClientMessagingMetadata(supabase: SupabaseClient, profile: ProfileRow): PublicMessagingMetadata {
  const username = cleanText(profile.public_username);

  return {
    avatarUrl: getPublicProfileMediaUrl(supabase, profile) ?? null,
    displayName: getPublicMessagingDisplayName({ role: profile.role, username }),
    publicUsername: username,
    publicProfileHref: username ? `/client/${encodeURIComponent(username)}` : null,
    bookingHref: null,
    publicContextLine: formatCityState(profile.public_city, profile.public_state)
  };
}

function buildBarberMessagingMetadata(supabase: SupabaseClient, barber: BarberRow, publicProfile?: BarberPublicProfileRow | null): PublicMessagingMetadata {
  const barberReference = cleanText(barber.reference_code) ?? cleanText(barber.booking_slug) ?? barber.id;
  const publicSlug = cleanText(publicProfile?.username) ?? cleanText(barber.booking_slug) ?? barberReference;
  const publicContextLine = formatPublicAddress({
    address: publicProfile?.public_address,
    city: publicProfile?.public_city,
    state: publicProfile?.public_state,
    zip: publicProfile?.public_zip
  }) ?? cleanText(publicProfile?.service_area_label);

  return {
    avatarUrl: getPublicProfileMediaUrl(supabase, publicProfile) ?? null,
    displayName: getPublicMessagingDisplayName({
      role: "barber_user",
      username: publicSlug,
      publicDisplayName: publicProfile?.display_name
    }),
    publicUsername: publicSlug,
    publicProfileHref: `/barber/${encodeURIComponent(publicSlug)}`,
    bookingHref: buildMarketplaceBookingHref({
      barberId: barberReference,
      username: publicSlug,
      sourceKind: "client_dashboard"
    }),
    publicContextLine
  };
}

function buildShopMessagingMetadata(supabase: SupabaseClient, shop: ShopPublicIdentityRow): PublicMessagingMetadata {
  const username = cleanText(shop.public_username) ?? cleanText(shop.id);

  return {
    avatarUrl: getPublicProfileMediaUrl(supabase, shop) ?? null,
    displayName: getPublicMessagingDisplayName({
      role: "shop_owner_user",
      username,
      publicDisplayName: shop.name
    }),
    publicUsername: username,
    publicProfileHref: username ? `/shop/${encodeURIComponent(username)}` : null,
    bookingHref: null,
    publicContextLine: formatPublicAddress({
      address: shop.address,
      city: shop.city,
      state: shop.state,
      zip: shop.zip_code
    })
  };
}

function buildParticipantSearchAction(input: {
  actor: MessagingActorContext;
  targetType: "client" | "barber" | "shop" | "support";
  targetProfileId?: string | null;
  shopLocationId?: string | null;
  shopContactProfileId?: string | null;
}): Pick<MessagingParticipantSearchResult, "createThreadInput" | "messageDisabledReason"> {
  if (input.targetProfileId && input.targetProfileId === input.actor.profile.id) {
    return { createThreadInput: null, messageDisabledReason: "This is you." };
  }

  if (input.targetType === "support") {
    return { createThreadInput: { threadType: "support" }, messageDisabledReason: null };
  }

  if (input.targetType === "client") {
    if (!input.targetProfileId) {
      return { createThreadInput: null, messageDisabledReason: "Messaging this profile is not available yet." };
    }

    if (input.actor.kind === "barber") {
      return { createThreadInput: { threadType: "client_barber", profileId: input.targetProfileId }, messageDisabledReason: null };
    }

    if (input.actor.kind === "shop") {
      const locationId = input.actor.locationIds?.[0] ?? null;
      return { createThreadInput: { threadType: "client_shop", profileId: input.targetProfileId, locationId }, messageDisabledReason: null };
    }

    return { createThreadInput: null, messageDisabledReason: "Messaging this profile type is coming soon." };
  }

  if (input.targetType === "barber") {
    if (!input.targetProfileId) {
      return { createThreadInput: null, messageDisabledReason: "Messaging this profile is not available yet." };
    }

    if (input.actor.kind === "client") {
      return { createThreadInput: { threadType: "client_barber", profileId: input.targetProfileId }, messageDisabledReason: null };
    }

    if (input.actor.kind === "shop") {
      const locationId = input.actor.locationIds?.[0] ?? null;
      return { createThreadInput: { threadType: "barber_shop", profileId: input.targetProfileId, locationId }, messageDisabledReason: null };
    }

    return { createThreadInput: null, messageDisabledReason: "Messaging this profile type is coming soon." };
  }

  if (input.targetType === "shop") {
    if (!input.shopContactProfileId) {
      return { createThreadInput: null, messageDisabledReason: "Messaging this shop is not available yet." };
    }

    if (input.actor.kind === "client") {
      return {
        createThreadInput: { threadType: "client_shop", profileId: input.shopContactProfileId, locationId: input.shopLocationId },
        messageDisabledReason: null
      };
    }

    if (input.actor.kind === "barber") {
      return {
        createThreadInput: { threadType: "barber_shop", profileId: input.shopContactProfileId, locationId: input.shopLocationId },
        messageDisabledReason: null
      };
    }

    return { createThreadInput: null, messageDisabledReason: "Messaging this profile type is coming soon." };
  }

  return { createThreadInput: null, messageDisabledReason: "Messaging this profile is not available yet." };
}

async function readPublicMessagingMetadataByProfileIds(
  supabase: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, PublicMessagingMetadata>> {
  const uniqueProfileIds = unique(profileIds.filter(Boolean));
  if (!uniqueProfileIds.length) {
    return new Map();
  }

  const profiles = await readProfilesByIds(supabase, uniqueProfileIds);
  const metadataByProfileId = new Map<string, PublicMessagingMetadata>();

  for (const profile of profiles.values()) {
    if (isClientRole(profile.role)) {
      metadataByProfileId.set(profile.id, buildClientMessagingMetadata(supabase, profile));
    }
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
    return metadataByProfileId;
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
        .select("barber_reference, username, display_name, profile_photo_path, profile_photo_url, public_address, public_city, public_state, public_zip, service_area_label")
        .in("barber_reference", publicReferenceCandidates)
    : { data: [], error: null };

  if (publicProfilesResult.error) {
    throw new MessagingServiceError("Unable to resolve public barber profile metadata for messaging.", 500);
  }

  const publicProfilesByReference = new Map(
    ((publicProfilesResult.data ?? []) as BarberPublicProfileRow[]).map((row) => [row.barber_reference, row])
  );
  for (const barber of barbers) {
    const publicProfile = [barber.reference_code, barber.booking_slug, barber.id, barber.profile_id]
      .map((value) => (value ? publicProfilesByReference.get(value) ?? null : null))
      .find((row): row is BarberPublicProfileRow => Boolean(row)) ?? null;

    metadataByProfileId.set(barber.profile_id, buildBarberMessagingMetadata(supabase, barber, publicProfile));
  }

  return metadataByProfileId;
}

async function readPublicShopMetadataByLocationIds(
  supabase: SupabaseClient,
  locationIds: string[]
): Promise<Map<string, PublicMessagingMetadata>> {
  const uniqueLocationIds = unique(locationIds.filter(Boolean));
  if (!uniqueLocationIds.length) {
    return new Map();
  }

  const result = await supabase
    .from("shops")
    .select("id, name, public_username, profile_photo_path, profile_photo_url, address, city, state, zip_code, owner_profile_id")
    .in("id", uniqueLocationIds);

  if (result.error) {
    console.warn("[messages] shop_public_metadata_read_failed", {
      locationCount: uniqueLocationIds.length,
      postgresCode: result.error.code ?? null,
      postgresMessage: result.error.message ?? null
    });
    return new Map();
  }

  return new Map(
    ((result.data ?? []) as ShopPublicIdentityRow[]).map((shop) => [
      shop.id,
      buildShopMessagingMetadata(supabase, shop)
    ])
  );
}

async function readPublicShopMetadataByOwnerProfileIds(
  supabase: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, PublicMessagingMetadata>> {
  const uniqueProfileIds = unique(profileIds.filter(Boolean));
  if (!uniqueProfileIds.length) {
    return new Map();
  }

  const result = await supabase
    .from("shops")
    .select("id, name, public_username, profile_photo_path, profile_photo_url, address, city, state, zip_code, owner_profile_id")
    .in("owner_profile_id", uniqueProfileIds);

  if (result.error) {
    console.warn("[messages] shop_owner_public_identity_read_failed", {
      profileCount: uniqueProfileIds.length,
      postgresCode: result.error.code ?? null,
      postgresMessage: result.error.message ?? null
    });
    return new Map();
  }

  const metadataByOwnerProfileId = new Map<string, PublicMessagingMetadata>();
  for (const shop of (result.data ?? []) as ShopPublicIdentityRow[]) {
    if (!shop.owner_profile_id || metadataByOwnerProfileId.has(shop.owner_profile_id)) {
      continue;
    }

    metadataByOwnerProfileId.set(shop.owner_profile_id, buildShopMessagingMetadata(supabase, shop));
  }

  return metadataByOwnerProfileId;
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
    .select("id, full_name, email, role, public_username, profile_photo_path, profile_photo_url, public_city, public_state")
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
  const [uuidResult, referenceResult, shopIdResult, shopUsernameResult, shopNameResult] = await Promise.all([
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
      : Promise.resolve({ data: [], error: null }),
    uuidValues.length
      ? supabase
          .from("shops")
          .select("id, name, public_username, profile_photo_path, profile_photo_url, address, city, state, zip_code, owner_profile_id")
          .in("id", uuidValues)
      : Promise.resolve({ data: [], error: null }),
    referenceValues.length
      ? supabase
          .from("shops")
          .select("id, name, public_username, profile_photo_path, profile_photo_url, address, city, state, zip_code, owner_profile_id")
          .in("public_username", referenceValues)
      : Promise.resolve({ data: [], error: null }),
    referenceValues.length
      ? supabase
          .from("shops")
          .select("id, name, public_username, profile_photo_path, profile_photo_url, address, city, state, zip_code, owner_profile_id")
          .in("name", referenceValues)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (uuidResult.error || referenceResult.error) {
    throw new MessagingServiceError("Unable to resolve shop locations for messaging.", 500);
  }

  const rowById = new Map<string, LocationRow>();
  for (const row of [...((uuidResult.data ?? []) as LocationRow[]), ...((referenceResult.data ?? []) as LocationRow[])]) {
    rowById.set(row.id, row);
  }
  if (!shopIdResult.error && !shopUsernameResult.error && !shopNameResult.error) {
    for (const shop of [
      ...((shopIdResult.data ?? []) as ShopPublicIdentityRow[]),
      ...((shopUsernameResult.data ?? []) as ShopPublicIdentityRow[]),
      ...((shopNameResult.data ?? []) as ShopPublicIdentityRow[])
    ]) {
      rowById.set(shop.id, shopToLocationRow(shop));
    }
  } else {
    console.warn("[messages] shop_location_identity_read_failed", {
      postgresCode: shopIdResult.error?.code ?? shopUsernameResult.error?.code ?? shopNameResult.error?.code ?? null,
      postgresMessage: shopIdResult.error?.message ?? shopUsernameResult.error?.message ?? shopNameResult.error?.message ?? null
    });
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

  const shopOwnerResult = await supabase
    .from("shops")
    .select("id, owner_profile_id")
    .in("id", uniqueLocationIds);

  if (shopOwnerResult.error) {
    console.warn("[messages] shop_owner_participant_read_failed", {
      locationCount: uniqueLocationIds.length,
      postgresCode: shopOwnerResult.error.code ?? null,
      postgresMessage: shopOwnerResult.error.message ?? null
    });
  } else {
    const shopOwnerRows = (shopOwnerResult.data ?? []) as Array<{ id: string; owner_profile_id?: string | null }>;
    const ownerProfiles = await readProfilesByIds(
      supabase,
      shopOwnerRows.map((shop) => shop.owner_profile_id).filter((value): value is string => Boolean(value))
    );
    for (const shop of shopOwnerRows) {
      const ownerProfile = shop.owner_profile_id ? ownerProfiles.get(shop.owner_profile_id) ?? null : null;
      if (!ownerProfile || !isShopRole(ownerProfile.role)) {
        continue;
      }

      const rows = grouped.get(shop.id) ?? [];
      if (!rows.some((profile) => profile.id === ownerProfile.id)) {
        rows.push(ownerProfile);
      }
      grouped.set(shop.id, rows);
    }
  }

  for (const [locationId, profiles] of grouped) {
    grouped.set(locationId, sortShopProfiles(profiles));
  }

  return grouped;
}

async function resolveMessageShopTarget(
  supabase: SupabaseClient,
  value: string | null | undefined
): Promise<ResolvedMessageShopTarget | null> {
  if (!value) {
    return null;
  }

  const lookup = await readLocationsByValues(supabase, [value]);
  const location = lookup.byValue.get(value);
  if (!location) {
    return null;
  }

  const participantsByLocation = await readShopParticipantsByLocationIds(supabase, [location.id]);
  const participants = participantsByLocation.get(location.id) ?? [];
  return {
    location,
    participants
  };
}

async function readOwnedShopIdsForProfile(supabase: SupabaseClient, profileId: string) {
  const result = await supabase
    .from("shops")
    .select("id")
    .eq("owner_profile_id", profileId);

  if (result.error) {
    throw new MessagingServiceError("Unable to resolve owned shops for messaging.", 500);
  }

  return unique(((result.data ?? []) as Array<{ id: string }>).map((shop) => shop.id).filter(Boolean));
}

async function resolveMessagingActor(user: UserAccount, supabase: SupabaseClient): Promise<MessagingActorContext> {
  if (!isMessagingRole(user.role)) {
    throw new MessagingServiceError("This role cannot use messaging.", 403);
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, full_name, email, role, public_username, profile_photo_path, profile_photo_url, public_city, public_state")
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
    const ownedShopIds = await readOwnedShopIdsForProfile(supabase, profile.id);
    return {
      profile,
      kind: "shop",
      locationIds: unique([...user.locationIds, ...ownedShopIds])
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
  const profilesResult = await supabase.from("profiles").select("id, full_name, email, role, public_username, profile_photo_path, profile_photo_url, public_city, public_state").in("id", profileIds);

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

function getAppointmentSortTime(appointment: AppointmentRow) {
  const candidates = [appointment.starts_at, appointment.created_at, appointment.updated_at];
  for (const candidate of candidates) {
    const time = candidate ? new Date(candidate).getTime() : NaN;
    if (Number.isFinite(time)) {
      return time;
    }
  }

  return 0;
}

function pickLatestAppointment(appointments: AppointmentRow[]) {
  return [...appointments].sort((left, right) => getAppointmentSortTime(right) - getAppointmentSortTime(left))[0] ?? null;
}

async function readProfilesToClientsAndBarbers(supabase: SupabaseClient, profileIds: string[]) {
  const uniqueProfileIds = unique(profileIds.filter(Boolean));
  if (!uniqueProfileIds.length) {
    return {
      clientsByProfileId: new Map<string, ClientRow>(),
      barbersByProfileId: new Map<string, BarberRow>()
    };
  }

  const [clientsResult, barbersResult] = await Promise.all([
    supabase.from("clients").select("id, profile_id").in("profile_id", uniqueProfileIds),
    supabase.from("barbers").select("id, profile_id, reference_code, booking_slug").in("profile_id", uniqueProfileIds)
  ]);

  if (clientsResult.error || barbersResult.error) {
    throw new MessagingServiceError("Unable to resolve latest appointment messaging context.", 500);
  }

  return {
    clientsByProfileId: new Map(((clientsResult.data ?? []) as ClientRow[])
      .filter((row) => row.profile_id)
      .map((row) => [row.profile_id as string, row])),
    barbersByProfileId: new Map(((barbersResult.data ?? []) as BarberRow[]).map((row) => [row.profile_id, row]))
  };
}

async function readLatestAppointmentContextsByThreadId(input: {
  supabase: SupabaseClient;
  threads: MessageThreadRow[];
  participants: ThreadParticipantRow[];
  profilesById: Map<string, ProfileRow>;
}) {
  const latestByThreadId = new Map<string, HydratedAppointmentContext>();
  if (!input.threads.length || !input.participants.length) {
    return latestByThreadId;
  }

  const participantsByThreadId = new Map<string, ThreadParticipantRow[]>();
  for (const participant of input.participants) {
    participantsByThreadId.set(participant.thread_id, [...(participantsByThreadId.get(participant.thread_id) ?? []), participant]);
  }

  const profileIds = unique(input.participants.map((participant) => participant.profile_id));
  const { clientsByProfileId, barbersByProfileId } = await readProfilesToClientsAndBarbers(input.supabase, profileIds);
  const clientBarberPairs: Array<{ threadId: string; clientId: string; barberId: string }> = [];
  const clientLocationPairs: Array<{ threadId: string; clientId: string; locationId: string }> = [];

  for (const thread of input.threads) {
    const threadParticipants = participantsByThreadId.get(thread.id) ?? [];
    const clientParticipant = threadParticipants.find((participant) => {
      const profile = input.profilesById.get(participant.profile_id) ?? null;
      return clientsByProfileId.has(participant.profile_id) || (profile ? isClientRole(profile.role) : isClientRole(participant.thread_role));
    }) ?? null;
    const barberParticipant = threadParticipants.find((participant) => {
      const profile = input.profilesById.get(participant.profile_id) ?? null;
      return barbersByProfileId.has(participant.profile_id) || (profile ? isBarberRole(profile.role) : isBarberRole(participant.thread_role));
    }) ?? null;
    const client = clientParticipant ? clientsByProfileId.get(clientParticipant.profile_id) ?? null : null;
    const barber = barberParticipant ? barbersByProfileId.get(barberParticipant.profile_id) ?? null : null;

    if (thread.thread_type === "client_barber" && client?.id && barber?.id) {
      clientBarberPairs.push({ threadId: thread.id, clientId: client.id, barberId: barber.id });
      continue;
    }

    if (thread.thread_type === "client_shop" && client?.id && thread.location_id) {
      clientLocationPairs.push({ threadId: thread.id, clientId: client.id, locationId: thread.location_id });
    }
  }

  const clientIds = unique([
    ...clientBarberPairs.map((pair) => pair.clientId),
    ...clientLocationPairs.map((pair) => pair.clientId)
  ]);
  if (!clientIds.length) {
    return latestByThreadId;
  }

  const appointmentsResult = await input.supabase
    .from("appointments")
    .select("id, reference_code, confirmation_code, status, starts_at, created_at, updated_at, client_id, barber_id, service_id, location_id")
    .in("client_id", clientIds)
    .order("starts_at", { ascending: false })
    .limit(200);

  if (appointmentsResult.error) {
    throw new MessagingServiceError("Unable to load latest appointment messaging context.", 500);
  }

  const appointments = (appointmentsResult.data ?? []) as AppointmentRow[];
  const appointmentContexts = await readAppointmentContexts(input.supabase, appointments);

  for (const pair of clientBarberPairs) {
    const latestAppointment = pickLatestAppointment(appointments.filter((appointment) =>
      appointment.client_id === pair.clientId && appointment.barber_id === pair.barberId
    ));
    const context = latestAppointment ? appointmentContexts.get(latestAppointment.id) ?? null : null;
    if (context) {
      latestByThreadId.set(pair.threadId, context);
    }
  }

  for (const pair of clientLocationPairs) {
    const latestAppointment = pickLatestAppointment(appointments.filter((appointment) =>
      appointment.client_id === pair.clientId && appointment.location_id === pair.locationId
    ));
    const context = latestAppointment ? appointmentContexts.get(latestAppointment.id) ?? null : null;
    if (context) {
      latestByThreadId.set(pair.threadId, context);
    }
  }

  return latestByThreadId;
}

function buildThreadSummary(input: {
  thread: MessageThreadRow;
  currentProfileId: string;
  participants: ThreadParticipantRow[];
  profilesById: Map<string, ProfileRow>;
  publicMetadataByProfileId: Map<string, PublicMessagingMetadata>;
  publicMetadataByLocationId: Map<string, PublicMessagingMetadata>;
  latestMessageByThreadId: Map<string, MessageRow>;
  appointmentContexts: Map<string, HydratedAppointmentContext>;
  latestAppointmentContextsByThreadId: Map<string, HydratedAppointmentContext>;
  locationLabels: Map<string, string>;
  requestsByThreadId: Map<string, MessageThreadRequestRow>;
}): MessagingThreadSummary {
  const threadParticipants = input.participants.filter((participant) => participant.thread_id === input.thread.id);
  const currentParticipant = threadParticipants.find((participant) => participant.profile_id === input.currentProfileId) ?? null;
  const counterpartParticipant = threadParticipants.find((participant) => participant.profile_id !== input.currentProfileId) ?? null;
  const counterpartProfile = counterpartParticipant ? input.profilesById.get(counterpartParticipant.profile_id) ?? null : null;
  const counterpartMetadata = counterpartParticipant
    ? input.publicMetadataByProfileId.get(counterpartParticipant.profile_id) ?? null
    : null;
  const shopMetadata = input.thread.location_id && counterpartProfile && isShopRole(counterpartProfile.role)
    ? input.publicMetadataByLocationId.get(input.thread.location_id) ?? null
    : null;
  const publicMetadata = shopMetadata ?? counterpartMetadata;
  const appointmentContext = input.latestAppointmentContextsByThreadId.get(input.thread.id)
    ?? (input.thread.appointment_id ? input.appointmentContexts.get(input.thread.appointment_id) ?? null : null);
  const latestMessage = input.latestMessageByThreadId.get(input.thread.id) ?? null;
  const latestSender = latestMessage?.sender_profile_id ? input.profilesById.get(latestMessage.sender_profile_id) ?? null : null;
  const latestSenderMetadata = latestMessage?.sender_profile_id
    ? input.publicMetadataByProfileId.get(latestMessage.sender_profile_id) ?? null
    : null;
  const locationLabel = input.thread.location_id ? input.locationLabels.get(input.thread.location_id) ?? input.thread.location_id : null;
  const hasUnread = isThreadUnreadForViewer({
    latestMessage,
    currentProfileId: input.currentProfileId,
    lastReadAt: currentParticipant?.last_read_at ?? null
  });
  const request = input.requestsByThreadId.get(input.thread.id) ?? null;

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
          fullName: publicMetadata?.displayName ?? getPublicFallbackName(counterpartProfile.role),
          role: counterpartProfile.role,
          avatarUrl: publicMetadata?.avatarUrl ?? null,
          publicUsername: publicMetadata?.publicUsername ?? null,
          publicContextLine: publicMetadata?.publicContextLine ?? null,
          publicProfileHref: publicMetadata?.publicProfileHref ?? null,
          bookingHref: publicMetadata?.bookingHref ?? null
        }
      : null,
    appointmentContext: appointmentContext ? toAppointmentContextView(appointmentContext) : null,
    lastMessage: latestMessage
      ? {
          id: latestMessage.id,
          body: latestMessage.body,
          messageType: latestMessage.message_type,
          createdAt: latestMessage.created_at,
          senderName: latestSender
            ? latestSenderMetadata?.displayName ?? getPublicFallbackName(latestSender.role)
            : null
        }
      : null,
    hasUnread,
    lifecycleStatus: toThreadLifecycleStatus(request),
    request: requestViewForThread(request, input.currentProfileId)
  };
}

async function readThreadBundle(supabase: SupabaseClient, currentProfileId: string, threadIds: string[]): Promise<ThreadBundle> {
  if (!threadIds.length) {
    return {
      threads: [],
      participants: [],
      messages: [],
      requestsByThreadId: new Map<string, MessageThreadRequestRow>(),
      profilesById: new Map<string, ProfileRow>(),
      publicMetadataByProfileId: new Map<string, PublicMessagingMetadata>(),
      publicMetadataByLocationId: new Map<string, PublicMessagingMetadata>(),
      latestMessageByThreadId: new Map<string, MessageRow>(),
      appointmentContexts: new Map<string, HydratedAppointmentContext>(),
      latestAppointmentContextsByThreadId: new Map<string, HydratedAppointmentContext>(),
      locationLabels: new Map<string, string>()
    };
  }

  const [threadsResult, participantsResult, messagesResult, requestsByThreadId] = await Promise.all([
    supabase
      .from("message_threads")
      .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
      .in("id", threadIds)
      .order("updated_at", { ascending: false }),
    selectThreadParticipantsForThreads({
      supabase,
      threadIds
    }),
    selectMessagesForThreads({
      supabase,
      threadIds,
      ascending: false,
      errorMessage: "Unable to load the messaging inbox."
    }),
    readMessageThreadRequestsByThreadIds(supabase, threadIds)
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
  const publicShopMetadataByOwnerProfileId = await readPublicShopMetadataByOwnerProfileIds(
    supabase,
    participantProfileIds
      .map((profileId) => profilesById.get(profileId) ?? null)
      .filter((profile): profile is ProfileRow => profile !== null && isShopRole(profile.role))
      .map((profile) => profile.id)
  );
  for (const [profileId, metadata] of publicShopMetadataByOwnerProfileId) {
    publicMetadataByProfileId.set(profileId, metadata);
  }
  const publicMetadataByLocationId = await readPublicShopMetadataByLocationIds(
    supabase,
    threads.map((thread) => thread.location_id).filter((value): value is string => Boolean(value))
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
      .select("id, reference_code, confirmation_code, status, starts_at, created_at, updated_at, client_id, barber_id, service_id, location_id")
      .in("id", appointmentIds);

    if (appointmentResult.error) {
      throw new MessagingServiceError("Unable to load appointment-linked thread context.", 500);
    }

    appointmentContexts = await readAppointmentContexts(supabase, (appointmentResult.data ?? []) as AppointmentRow[]);
  }

  const latestAppointmentContextsByThreadId = await readLatestAppointmentContextsByThreadId({
    supabase,
    threads,
    participants,
    profilesById
  });

  const locationRows = await readLocationsByValues(
    supabase,
    threads.map((thread) => thread.location_id).filter((value): value is string => Boolean(value))
  );

  return {
    threads,
    participants,
    messages,
    requestsByThreadId,
    profilesById,
    publicMetadataByProfileId,
    publicMetadataByLocationId,
    latestMessageByThreadId,
    appointmentContexts,
    latestAppointmentContextsByThreadId,
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
      console.warn("[messages] shop_contacts_preload_failed", {
        profileId: actor.profile.id,
        role: actor.profile.role,
        shopIds: locationRows.map((row) => row.id),
        queryName: "appointments_by_shop_location",
        postgresCode: appointmentsResult.error.code ?? null,
        postgresMessage: appointmentsResult.error.message ?? null
      });
      return {
        eligibleContacts: [] as MessagingContactCandidate[],
        broadcastTargets: [] as MessagingBroadcastTarget[]
      };
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
}

async function ensureThreadParticipants(
  supabase: SupabaseClient,
  threadId: string,
  existingParticipants: ThreadParticipantRow[],
  profiles: ProfileRow[],
  diagnostics?: ReturnType<typeof buildCreateOpenDiagnostics>
) {
  const existingIds = new Set(existingParticipants.map((participant) => participant.profile_id));
  const missingRows = profiles
    .filter((profile) => !existingIds.has(profile.id))
    .map((profile) => ({
      thread_id: threadId,
      profile_id: profile.id,
      thread_role: toDatabaseThreadRole(profile.role)
    }));

  if (!missingRows.length) {
    return;
  }

  const insertResult = await supabase.from("thread_participants").insert(missingRows);
  if (insertResult.error) {
    const failureDiagnostics = markCreateOpenFailure(diagnostics, "participant_insert", insertResult.error);
    console.warn("[messages] thread_participant_insert_failed", {
      threadId,
      participantCount: missingRows.length,
      postgresCode: insertResult.error.code ?? null,
      postgresMessage: insertResult.error.message ?? null,
      diagnostics: failureDiagnostics ?? null
    });
    throw new MessagingServiceError("Unable to attach messaging participants.", 500, "participant_insert_failed", "participant_insert", failureDiagnostics);
  }

  if (diagnostics) {
    diagnostics.participantsInserted = true;
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

async function assertProfilesCanMessage(supabase: SupabaseClient, actorProfileId: string, targetProfileId: string) {
  const [actorBlocksTarget, targetBlocksActor] = await Promise.all([
    supabase
      .from("message_user_blocks")
      .select("id")
      .eq("blocker_profile_id", actorProfileId)
      .eq("blocked_profile_id", targetProfileId)
      .maybeSingle(),
    supabase
      .from("message_user_blocks")
      .select("id")
      .eq("blocker_profile_id", targetProfileId)
      .eq("blocked_profile_id", actorProfileId)
      .maybeSingle()
  ]);

  const blockingError = actorBlocksTarget.error ?? targetBlocksActor.error ?? null;
  if (blockingError) {
    if (isMissingMessageLifecycleTable(blockingError)) {
      return;
    }

    throw new MessagingServiceError("Unable to verify message block state.", 500);
  }

  if (actorBlocksTarget.data || targetBlocksActor.data) {
    throw new MessagingServiceError("You cannot message this user.", 403, "message_blocked", "block_check");
  }
}

async function ensureMessageThreadRequest(input: {
  supabase: SupabaseClient;
  threadId: string;
  requestedByProfileId: string;
  requestedToProfileId: string;
}) {
  const existing = await input.supabase
    .from("message_thread_requests")
    .select("id")
    .eq("thread_id", input.threadId)
    .maybeSingle();

  if (existing.error) {
    if (isMissingMessageLifecycleTable(existing.error)) {
      console.warn("[messages] message_request_lifecycle_table_missing", {
        threadId: input.threadId,
        postgresCode: existing.error.code ?? null,
        postgresMessage: existing.error.message ?? null
      });
      return;
    }

    throw new MessagingServiceError("Unable to resolve message request state.", 500);
  }

  if (existing.data) {
    return;
  }

  const insert = await input.supabase
    .from("message_thread_requests")
    .insert({
      thread_id: input.threadId,
      requested_by_profile_id: input.requestedByProfileId,
      requested_to_profile_id: input.requestedToProfileId,
      request_status: "pending"
    });

  if (insert.error) {
    if (isMissingMessageLifecycleTable(insert.error)) {
      return;
    }

    throw new MessagingServiceError("Unable to create the message request.", 500);
  }
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
        thread_role: "client"
      },
      {
        thread_id: threadId,
        profile_id: input.appointment.barberProfileId,
        thread_role: toDatabaseThreadRole(input.appointment.barberRole)
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
  const requestedToProfileId = input.createdByProfileId === input.clientProfile.id
    ? input.barberProfile.id
    : input.clientProfile.id;
  await assertProfilesCanMessage(input.supabase, input.createdByProfileId, requestedToProfileId);

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
        thread_role: toDatabaseThreadRole(input.clientProfile.role)
      },
      {
        thread_id: threadId,
        profile_id: input.barberProfile.id,
        thread_role: toDatabaseThreadRole(input.barberProfile.role)
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
      body: `Direct conversation opened with ${getPublicFallbackName(requestedToProfileId === input.barberProfile.id ? input.barberProfile.role : input.clientProfile.role)}.`,
      message_type: "system",
      created_at: createdAt
    });

  if (systemMessageInsert.error) {
    throw new MessagingServiceError("Unable to write the barber conversation system message.", 500);
  }

  await ensureMessageThreadRequest({
    supabase: input.supabase,
    threadId,
    requestedByProfileId: input.createdByProfileId,
    requestedToProfileId
  });

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
  location: LocationRow | null;
  shopParticipants: ProfileRow[];
  counterpartProfile: ProfileRow;
  createdByProfileId: string;
  request?: {
    requestedByProfileId: string;
    requestedToProfileId: string;
  } | null;
  diagnostics?: ReturnType<typeof buildCreateOpenDiagnostics>;
}) {
  const dbLocationId = input.location && input.location.source !== "shop" ? input.location.id : null;
  let threadLookupQuery = input.supabase
    .from("message_threads")
    .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
    .eq("thread_type", input.threadType);

  if (dbLocationId) {
    threadLookupQuery = threadLookupQuery.eq("location_id", dbLocationId);
  }

  const threadLookupResult = await threadLookupQuery.order("updated_at", { ascending: false });

  if (threadLookupResult.error) {
    const failureDiagnostics = markCreateOpenFailure(input.diagnostics, "existing_thread_lookup", threadLookupResult.error);
    console.warn("[messages] create_shop_thread_step_failed", {
      step: "existing_thread_lookup",
      threadType: input.threadType,
      publicShopReference: input.location?.source === "shop" ? input.location.id : null,
      dbLocationId,
      postgresCode: threadLookupResult.error.code ?? null,
      postgresMessage: threadLookupResult.error.message ?? null,
      diagnostics: failureDiagnostics ?? null
    });
    throw new MessagingServiceError("Unable to look up the messaging conversation.", 500, "existing_thread_lookup_failed", "existing_thread_lookup", failureDiagnostics);
  }

  const candidateThreads = ((threadLookupResult.data ?? []) as MessageThreadRow[])
    .filter((thread) => thread.location_id === dbLocationId);
  const candidateThreadIds = candidateThreads.map((thread) => thread.id);
  const participantsResult = candidateThreadIds.length
    ? await input.supabase
        .from("thread_participants")
        .select("id, thread_id, profile_id, thread_role, created_at")
        .in("thread_id", candidateThreadIds)
    : { data: [], error: null };

  if (participantsResult.error) {
    const failureDiagnostics = markCreateOpenFailure(input.diagnostics, "existing_participant_lookup", participantsResult.error);
    console.warn("[messages] create_shop_thread_step_failed", {
      step: "existing_participant_lookup",
      threadType: input.threadType,
      publicShopReference: input.location?.source === "shop" ? input.location.id : null,
      dbLocationId,
      candidateThreadCount: candidateThreadIds.length,
      postgresCode: participantsResult.error.code ?? null,
      postgresMessage: participantsResult.error.message ?? null,
      diagnostics: failureDiagnostics ?? null
    });
    throw new MessagingServiceError("Unable to resolve existing shop thread participants.", 500, "existing_participant_lookup_failed", "existing_participant_lookup", failureDiagnostics);
  }

  const participantRows = (participantsResult.data ?? []) as ThreadParticipantRow[];
  const shopParticipantIds = new Set(input.shopParticipants.map((profile) => profile.id));
  if (input.request) {
    await assertProfilesCanMessage(input.supabase, input.request.requestedByProfileId, input.request.requestedToProfileId);
  }

  const matchedThread = candidateThreads.find((thread) => {
    const threadParticipants = participantRows.filter((participant) => participant.thread_id === thread.id);
    const hasCounterpart = threadParticipants.some((participant) => participant.profile_id === input.counterpartProfile.id);
    const hasShopParticipant = threadParticipants.some((participant) => shopParticipantIds.has(participant.profile_id));
    return hasCounterpart && hasShopParticipant;
  });

  if (matchedThread) {
    const threadParticipants = participantRows.filter((participant) => participant.thread_id === matchedThread.id);
    await ensureThreadParticipants(input.supabase, matchedThread.id, threadParticipants, [...input.shopParticipants, input.counterpartProfile], input.diagnostics);
    if (input.diagnostics) {
      input.diagnostics.returnedThreadId = matchedThread.id;
    }
    return matchedThread.id;
  }

  const createdAt = new Date().toISOString();
  const threadInsert = await input.supabase
    .from("message_threads")
    .insert({
      thread_type: input.threadType,
      location_id: dbLocationId,
      created_by_profile_id: input.createdByProfileId,
      updated_at: createdAt
    })
    .select("id")
    .single();

  if (threadInsert.error) {
    const failureDiagnostics = markCreateOpenFailure(input.diagnostics, "thread_insert", threadInsert.error);
    console.warn("[messages] create_shop_thread_step_failed", {
      step: "thread_insert",
      threadType: input.threadType,
      publicShopReference: input.location?.source === "shop" ? input.location.id : null,
      dbLocationId,
      postgresCode: threadInsert.error.code ?? null,
      postgresMessage: threadInsert.error.message ?? null,
      diagnostics: failureDiagnostics ?? null
    });
    throw new MessagingServiceError("Unable to create the shop conversation.", 500, "thread_insert_failed", "thread_insert", failureDiagnostics);
  }

  const threadId = threadInsert.data.id as string;
  if (input.diagnostics) {
    input.diagnostics.threadInserted = true;
    input.diagnostics.returnedThreadId = threadId;
  }
  try {
    await ensureThreadParticipants(input.supabase, threadId, [], [...input.shopParticipants, input.counterpartProfile], input.diagnostics);
  } catch (error) {
    console.warn("[messages] create_shop_thread_step_failed", {
      step: "participant_insert",
      threadType: input.threadType,
      threadId,
      publicShopReference: input.location?.source === "shop" ? input.location.id : null,
      dbLocationId,
      errorCode: error instanceof MessagingServiceError ? error.code : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      diagnostics: error instanceof MessagingServiceError ? error.diagnostics ?? null : input.diagnostics ?? null
    });
    throw error;
  }

  const systemMessageInsert = await input.supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_profile_id: null,
      body: buildShopThreadSystemMessage({
        threadType: input.threadType,
        counterpartName: getPublicFallbackName(input.counterpartProfile.role),
        locationLabel: input.location ? formatLocationLabel(input.location) : "Direct message"
      }),
      message_type: "system"
    });

  if (systemMessageInsert.error) {
    const failureDiagnostics = markCreateOpenFailure(input.diagnostics, "system_message_insert", systemMessageInsert.error);
    console.warn("[messages] create_shop_thread_step_failed", {
      step: "system_message_insert",
      threadType: input.threadType,
      threadId,
      publicShopReference: input.location?.source === "shop" ? input.location.id : null,
      dbLocationId,
      postgresCode: systemMessageInsert.error.code ?? null,
      postgresMessage: systemMessageInsert.error.message ?? null,
      diagnostics: failureDiagnostics ?? null
    });
    throw new MessagingServiceError("Unable to write the shop conversation system message.", 500, "system_message_insert_failed", "system_message_insert", failureDiagnostics);
  }

  if (input.diagnostics) {
    input.diagnostics.systemMessageInserted = true;
  }

  if (input.request) {
    await ensureMessageThreadRequest({
      supabase: input.supabase,
      threadId,
      requestedByProfileId: input.request.requestedByProfileId,
      requestedToProfileId: input.request.requestedToProfileId
    });
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
      publicMetadataByLocationId: bundle.publicMetadataByLocationId,
      latestMessageByThreadId: bundle.latestMessageByThreadId,
      appointmentContexts: bundle.appointmentContexts,
      latestAppointmentContextsByThreadId: bundle.latestAppointmentContextsByThreadId,
      locationLabels: bundle.locationLabels,
      requestsByThreadId: bundle.requestsByThreadId
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

  const messagesResult = await selectMessagesForThreads({
    supabase,
    threadIds: relatedThreadIds,
    ascending: true,
    errorMessage: "Unable to load thread messages."
  });

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
    publicMetadataByLocationId: bundle.publicMetadataByLocationId,
    latestMessageByThreadId: bundle.latestMessageByThreadId,
    appointmentContexts: bundle.appointmentContexts,
    latestAppointmentContextsByThreadId: bundle.latestAppointmentContextsByThreadId,
    locationLabels: bundle.locationLabels,
    requestsByThreadId: bundle.requestsByThreadId
  });

  const relatedAppointmentContextsById = new Map<string, HydratedAppointmentContext>();
  for (const context of bundle.latestAppointmentContextsByThreadId.values()) {
    relatedAppointmentContextsById.set(context.appointmentId, context);
  }
  for (const appointmentId of unique(bundle.threads.map((row) => row.appointment_id).filter((value): value is string => Boolean(value)))) {
    const context = bundle.appointmentContexts.get(appointmentId) ?? null;
    if (context) {
      relatedAppointmentContextsById.set(context.appointmentId, context);
    }
  }
  const relatedAppointmentContexts = Array.from(relatedAppointmentContextsById.values())
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime())
    .map(toAppointmentContextView);
  const messageRows = (messagesResult.data ?? []) as MessageRow[];
  const paymentRequestSnapshots = await readPosPaymentRequestSnapshots(
    supabase,
    messageRows
      .map((message) => getPosPaymentRequestMetadata(message.metadata)?.paymentRequestId ?? extractPosPaymentRequestIdFromBody(message.body))
      .filter((value): value is string => Boolean(value))
  );

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
          fullName: metadata?.displayName ?? getPublicFallbackName(profile?.role ?? participant.thread_role),
          role: participant.thread_role,
          isSelf: participant.profile_id === actor.profile.id,
          avatarUrl: metadata?.avatarUrl ?? null,
          publicUsername: metadata?.publicUsername ?? null,
          publicContextLine: metadata?.publicContextLine ?? null,
          publicProfileHref: metadata?.publicProfileHref ?? null,
          bookingHref: metadata?.bookingHref ?? null
        };
      })
    },
    messages: messageRows.map((message) => {
      const sender = message.sender_profile_id ? bundle.profilesById.get(message.sender_profile_id) ?? null : null;
      const senderMetadata = message.sender_profile_id ? bundle.publicMetadataByProfileId.get(message.sender_profile_id) ?? null : null;
      return {
        id: message.id,
        body: message.body,
        messageType: message.message_type,
        metadata: hydrateMessageMetadata(message.metadata, paymentRequestSnapshots, message.body),
        createdAt: message.created_at,
        senderName: sender ? senderMetadata?.displayName ?? getPublicFallbackName(sender.role) : null,
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
        publicMetadataByLocationId: bundle.publicMetadataByLocationId,
        latestMessageByThreadId: bundle.latestMessageByThreadId,
        appointmentContexts: bundle.appointmentContexts,
        latestAppointmentContextsByThreadId: bundle.latestAppointmentContextsByThreadId,
        locationLabels: bundle.locationLabels,
        requestsByThreadId: bundle.requestsByThreadId
      })
    ));
  } catch (error) {
    recordParticipantSearchWarning(warnings, "threads", "Unable to resolve existing messaging conversations.", error);
  }

  const results = new Map<string, MessagingParticipantSearchResult>();
  const registryMatches = await readPublicUsernameRegistryMatches(supabase, normalizedQuery);
  const supportMatches = "bvrb3r".includes(normalizedQuery)
    || ["support", "help"].some((term) => term.includes(normalizedQuery) || normalizedQuery.includes(term));

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
        ...buildParticipantSearchAction({ actor, targetType: "support", targetProfileId: supportProfile.id }),
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
        .select("barber_reference, username, display_name, profile_photo_path, profile_photo_url, visibility_state, public_address, public_city, public_state, public_zip, service_area_label")
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

    if (registryMatches.barberReferences.length) {
      try {
        const registryBarberProfileResult = await supabase
          .from("barber_profiles")
          .select("barber_reference, username, display_name, profile_photo_path, profile_photo_url, visibility_state, public_address, public_city, public_state, public_zip, service_area_label")
          .in("barber_reference", registryMatches.barberReferences);

        if (registryBarberProfileResult.error) {
          throw registryBarberProfileResult.error;
        }

        for (const profile of ((registryBarberProfileResult.data ?? []) as BarberPublicProfileRow[])) {
          if (!profile.visibility_state || profile.visibility_state === "public" || profile.visibility_state === "featured") {
            barberProfilesByReference.set(profile.barber_reference, profile);
          }
        }
      } catch (error) {
        recordParticipantSearchWarning(warnings, "barber", "Unable to hydrate registry barber messaging results.", error);
      }
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
      const metadata = buildBarberMessagingMetadata(supabase, barber, publicProfile);
      const displayName = metadata.displayName ?? getPublicFallbackName(profile.role);
      if (
        !searchMatches(displayName, normalizedQuery) &&
        !searchMatches(profile.full_name, normalizedQuery) &&
        !searchMatches(publicProfile?.username, normalizedQuery) &&
        !searchMatches(barber.reference_code, normalizedQuery) &&
        !searchMatches(barber.booking_slug, normalizedQuery)
      ) {
        continue;
      }

      results.set(`barber:${profile.id}`, {
        id: profile.id,
        participantId: profile.id,
        displayName,
        resultType: "barber",
        participantType: "barber",
        role: profile.role,
        avatarUrl: metadata.avatarUrl,
        publicUsername: metadata.publicUsername,
        publicContextLine: metadata.publicContextLine,
        publicProfileHref: metadata.publicProfileHref,
        profileHref: metadata.publicProfileHref,
        bookingHref: metadata.bookingHref,
        existingThreadId: threadLookup.get(`barber:${profile.id}`) ?? null,
        ...buildParticipantSearchAction({ actor, targetType: "barber", targetProfileId: profile.id }),
        subtitle: "Barber"
      });
    }
  } catch (error) {
    recordParticipantSearchWarning(warnings, "barber", "Unable to search barber messaging results.", error);
  }

  try {
    const clientProfilesById = new Map<string, ProfileRow>();
    try {
      const clientProfileResult = await supabase
        .from("profiles")
        .select("id, full_name, email, role, public_username, profile_photo_path, profile_photo_url, public_city, public_state")
        .or(`public_username.ilike.%${normalizedQuery}%,public_city.ilike.%${normalizedQuery}%,public_state.ilike.%${normalizedQuery}%`)
        .limit(12);

      if (clientProfileResult.error) {
        throw clientProfileResult.error;
      }

      for (const profile of ((clientProfileResult.data ?? []) as ProfileRow[])) {
        clientProfilesById.set(profile.id, profile);
      }
    } catch (error) {
      recordParticipantSearchWarning(warnings, "client", "Unable to search client messaging results.", error);
    }

    if (registryMatches.clientProfileIds.length) {
      try {
        const registryClientProfileResult = await supabase
          .from("profiles")
          .select("id, full_name, email, role, public_username, profile_photo_path, profile_photo_url, public_city, public_state")
          .in("id", registryMatches.clientProfileIds);

        if (registryClientProfileResult.error) {
          throw registryClientProfileResult.error;
        }

        for (const profile of ((registryClientProfileResult.data ?? []) as ProfileRow[])) {
          clientProfilesById.set(profile.id, profile);
        }
      } catch (error) {
        recordParticipantSearchWarning(warnings, "client", "Unable to hydrate registry client messaging results.", error);
      }
    }

    const clientProfiles = [...clientProfilesById.values()]
      .filter((profile) => isClientRole(profile.role) && cleanText(profile.public_username));

    const clientRowsResult = clientProfiles.length
      ? await supabase
          .from("clients")
          .select("id, profile_id")
          .in("profile_id", clientProfiles.map((profile) => profile.id))
      : { data: [], error: null };

    if (clientRowsResult.error) {
      throw clientRowsResult.error;
    }

    const clientProfileIds = new Set(((clientRowsResult.data ?? []) as ClientRow[]).map((client) => client.profile_id));
    for (const profile of clientProfiles) {
      if (!clientProfileIds.has(profile.id)) {
        continue;
      }

      const metadata = buildClientMessagingMetadata(supabase, profile);
      if (
        !searchMatches(metadata.publicUsername, normalizedQuery)
        && !searchMatches(metadata.publicContextLine, normalizedQuery)
      ) {
        continue;
      }

      results.set(`client:${profile.id}`, {
        id: profile.id,
        participantId: profile.id,
        displayName: metadata.displayName ?? getPublicFallbackName(profile.role),
        resultType: "client",
        participantType: "client",
        role: profile.role,
        avatarUrl: metadata.avatarUrl,
        publicUsername: metadata.publicUsername,
        publicContextLine: metadata.publicContextLine,
        publicProfileHref: metadata.publicProfileHref,
        profileHref: metadata.publicProfileHref,
        bookingHref: null,
        existingThreadId: threadLookup.get(`client:${profile.id}`) ?? null,
        ...buildParticipantSearchAction({ actor, targetType: "client", targetProfileId: profile.id }),
        subtitle: metadata.publicContextLine ?? "Client"
      });
    }
  } catch (error) {
    recordParticipantSearchWarning(warnings, "client", "Unable to search client messaging results.", error);
  }

  try {
    const shopsById = new Map<string, ShopPublicIdentityRow>();
    try {
      const shopResult = await supabase
        .from("shops")
        .select("id, name, public_username, profile_photo_path, profile_photo_url, address, city, state, zip_code, owner_profile_id")
        .or(`name.ilike.%${normalizedQuery}%,public_username.ilike.%${normalizedQuery}%,city.ilike.%${normalizedQuery}%`)
        .limit(8);

      if (shopResult.error) {
        throw shopResult.error;
      }

      for (const shop of ((shopResult.data ?? []) as ShopPublicIdentityRow[])) {
        shopsById.set(shop.id, shop);
      }
    } catch (error) {
      recordParticipantSearchWarning(warnings, "shop", "Unable to search shop messaging results.", error);
    }

    if (registryMatches.shopIds.length) {
      try {
        const registryShopResult = await supabase
          .from("shops")
          .select("id, name, public_username, profile_photo_path, profile_photo_url, address, city, state, zip_code, owner_profile_id")
          .in("id", registryMatches.shopIds);

        if (registryShopResult.error) {
          throw registryShopResult.error;
        }

        for (const shop of ((registryShopResult.data ?? []) as ShopPublicIdentityRow[])) {
          shopsById.set(shop.id, shop);
        }
      } catch (error) {
        recordParticipantSearchWarning(warnings, "shop", "Unable to hydrate registry shop messaging results.", error);
      }
    }

    const shopRows = [...shopsById.values()]
      .filter((shop) =>
        searchMatches(shop.public_username, normalizedQuery)
        || searchMatches(shop.name, normalizedQuery)
        || searchMatches(shop.city, normalizedQuery)
        || registryMatches.shopIds.includes(shop.id)
      );
    const shopParticipantsByLocation = await readShopParticipantsByLocationIds(supabase, shopRows.map((row) => row.id))
      .catch((error) => {
        recordParticipantSearchWarning(warnings, "shop", "Unable to resolve shop messaging participants.", error);
        return new Map<string, ProfileRow[]>();
      });
    for (const shop of shopRows) {
      const primaryShopProfile = pickPrimaryShopProfile(shopParticipantsByLocation.get(shop.id) ?? []);
      const metadata = buildShopMessagingMetadata(supabase, shop);
      const profileId = primaryShopProfile?.id ?? shop.owner_profile_id ?? shop.id;
      const isOwnShop = primaryShopProfile?.id === actor.profile.id || shop.owner_profile_id === actor.profile.id || (actor.kind === "shop" && actor.locationIds?.includes(shop.id));
      const action = isOwnShop
        ? { createThreadInput: null, messageDisabledReason: "This is your shop." }
        : primaryShopProfile || shop.owner_profile_id
          ? buildParticipantSearchAction({
              actor,
              targetType: "shop",
              shopLocationId: shop.id,
              shopContactProfileId: profileId
            })
          : { createThreadInput: null, messageDisabledReason: "Messaging this shop is not available yet." };
      results.set(`shop:${shop.id}`, {
        id: shop.id,
        participantId: shop.id,
        displayName: metadata.displayName ?? "BVRB3R Shop",
        resultType: "shop",
        participantType: "shop",
        role: primaryShopProfile?.role ?? "shop_owner_user",
        avatarUrl: metadata.avatarUrl,
        publicUsername: metadata.publicUsername,
        publicContextLine: metadata.publicContextLine,
        publicProfileHref: metadata.publicProfileHref,
        profileHref: metadata.publicProfileHref,
        bookingHref: null,
        existingThreadId: threadLookup.get(`shop:${shop.id}`) ?? threadLookup.get(`shop-profile:${profileId}`) ?? null,
        ...action,
        subtitle: metadata.publicContextLine ?? "Shop"
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

export async function markMessageThreadRead(user: UserAccount, threadId: string): Promise<{ threadId: string; lastReadAt: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new MessagingServiceError("Messaging is available when Supabase is configured.", 503);
  }

  const actor = await resolveMessagingActor(user, supabase);
  const lastReadAt = new Date().toISOString();
  const updateResult = await supabase
    .from("thread_participants")
    .update({ last_read_at: lastReadAt })
    .eq("thread_id", threadId)
    .eq("profile_id", actor.profile.id)
    .select("id")
    .maybeSingle();

  if (updateResult.error) {
    if (isThreadParticipantReadColumnError(updateResult.error)) {
      throw new MessagingServiceError("Message read state migration is required.", 503);
    }

    throw new MessagingServiceError("Unable to mark this conversation read.", 500);
  }

  if (!updateResult.data) {
    throw new MessagingServiceError("Only thread participants can mark this conversation read.", 403);
  }

  return {
    threadId,
    lastReadAt
  };
}

async function readCreatedMessagingThreadPayload(
  user: UserAccount,
  threadId: string,
  diagnostics?: ReturnType<typeof buildCreateOpenDiagnostics>
) {
  if (diagnostics) {
    diagnostics.returnedThreadId = threadId;
  }

  try {
    const payload = await getMessagingThreadPayload(user, threadId);
    if (!payload.thread?.id) {
      const failureDiagnostics = markCreateOpenFailure(diagnostics, "returned_payload");
      throw new MessagingServiceError("Conversation opened without a thread id.", 500, "missing_thread_id", "returned_payload", failureDiagnostics);
    }

    return payload;
  } catch (error) {
    if (error instanceof MessagingServiceError && error.step === "returned_payload") {
      throw error;
    }

    const failureDiagnostics = markCreateOpenFailure(diagnostics, "thread_readback", error);
    console.warn("[messages] create_thread_readback_failed", {
      threadId,
      errorCode: error instanceof MessagingServiceError ? error.code : null,
      errorStep: error instanceof MessagingServiceError ? error.step : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      diagnostics: failureDiagnostics ?? null
    });
    throw new MessagingServiceError("Unable to open the created conversation.", 500, "thread_readback_failed", "thread_readback", failureDiagnostics);
  }
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

  const shopThreadDiagnostics = "threadType" in input && (input.threadType === "client_shop" || input.threadType === "barber_shop")
    ? buildCreateOpenDiagnostics({
        actorRole: actor.profile.role,
        actorProfileId: actor.profile.id,
        targetType: actor.kind === "shop" ? "profile" : "shop",
        targetIdKind: input.locationId ? isUuidLike(input.locationId) ? "uuid" : "public_reference" : "none",
        resolvedThreadType: input.threadType
      })
    : undefined;

  let shopTarget: ResolvedMessageShopTarget | null = null;
  try {
    shopTarget = await resolveMessageShopTarget(supabase, input.locationId);
  } catch (error) {
    const failureDiagnostics = markCreateOpenFailure(shopThreadDiagnostics, "target_resolution", error);
    throw new MessagingServiceError("Unable to resolve the messaging target.", 500, "target_resolution_failed", "target_resolution", failureDiagnostics);
  }
  const location = shopTarget?.location ?? null;
  let shopParticipants = shopTarget?.participants ?? [];
  if (shopThreadDiagnostics) {
    shopThreadDiagnostics.targetIdKind = location ? location.source === "shop" ? "public_shop_identity" : "location" : "none";
  }

  if (location) {
    try {
      await assertActorCanReachLocation(supabase, actor, location.id);
    } catch (error) {
      const failureDiagnostics = markCreateOpenFailure(shopThreadDiagnostics, "target_resolution", error);
      throw new MessagingServiceError(
        error instanceof Error ? error.message : "Unable to verify the messaging target.",
        error instanceof MessagingServiceError ? error.status : 500,
        error instanceof MessagingServiceError ? error.code : "target_scope_failed",
        "target_resolution",
        failureDiagnostics
      );
    }
  }

  if (actor.kind === "shop") {
    if (!shopParticipants.some((profile) => profile.id === actor.profile.id)) {
      shopParticipants = sortShopProfiles([...shopParticipants, actor.profile]);
    }

    let counterpartProfile: ProfileRow;
    try {
      counterpartProfile = await readProfileById(supabase, input.profileId);
    } catch (error) {
      const failureDiagnostics = markCreateOpenFailure(shopThreadDiagnostics, "target_resolution", error);
      throw new MessagingServiceError("Unable to resolve the messaging target.", 500, "target_resolution_failed", "target_resolution", failureDiagnostics);
    }
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
      createdByProfileId: actor.profile.id,
      request: {
        requestedByProfileId: actor.profile.id,
        requestedToProfileId: counterpartProfile.id
      },
      diagnostics: shopThreadDiagnostics
    });

    return readCreatedMessagingThreadPayload(user, threadId, shopThreadDiagnostics);
  }

  if (!shopParticipants.length && input.profileId) {
    let selectedShopProfile: ProfileRow;
    try {
      selectedShopProfile = await readProfileById(supabase, input.profileId);
    } catch (error) {
      const failureDiagnostics = markCreateOpenFailure(shopThreadDiagnostics, "target_resolution", error);
      throw new MessagingServiceError("Unable to resolve the messaging target.", 500, "target_resolution_failed", "target_resolution", failureDiagnostics);
    }

    if (isShopRole(selectedShopProfile.role)) {
      shopParticipants = [selectedShopProfile];
    }
  }

  const primaryShopProfile = pickPrimaryShopProfile(shopParticipants);
  if (!primaryShopProfile) {
    const failureDiagnostics = markCreateOpenFailure(shopThreadDiagnostics, "target_resolution");
    throw new MessagingServiceError("No shop-facing contact is available for this conversation.", 400, "target_participants_missing", "target_resolution", failureDiagnostics);
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
    createdByProfileId: actor.profile.id,
    request: {
      requestedByProfileId: actor.profile.id,
      requestedToProfileId: primaryShopProfile.id
    },
    diagnostics: shopThreadDiagnostics
  });

  return readCreatedMessagingThreadPayload(user, threadId, shopThreadDiagnostics);
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

  const requestState = await readMessageThreadRequestsByThreadIds(supabase, [threadId]);
  const request = requestState.get(threadId) ?? null;
  if (request?.request_status === "declined") {
    throw new MessagingServiceError("Message request declined.", 403, "message_request_declined", "request_lifecycle");
  }
  if (request?.request_status === "blocked") {
    throw new MessagingServiceError("You cannot message this user.", 403, "message_blocked", "request_lifecycle");
  }
  if (request?.request_status === "reported") {
    throw new MessagingServiceError("Report submitted.", 403, "message_reported", "request_lifecycle");
  }
  if (request?.request_status === "pending") {
    if (request.requested_to_profile_id === actor.profile.id) {
      throw new MessagingServiceError("Accept this message request before replying.", 403, "message_request_pending", "request_lifecycle");
    }

    const existingMessages = await readThreadMessagesForLifecycle(supabase, threadId);
    const introMessages = existingMessages.filter((message) =>
      message.sender_profile_id === actor.profile.id
      && message.message_type === "text"
    );
    if (introMessages.length >= 1) {
      throw new MessagingServiceError("Message request pending.", 403, "message_request_pending_intro_sent", "request_lifecycle");
    }
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
    .select("id, thread_id, sender_profile_id, body, message_type, metadata, created_at")
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
  if (request?.request_status === "pending" && request.requested_by_profile_id === actor.profile.id && !request.first_message_id) {
    const requestUpdate = await supabase
      .from("message_thread_requests")
      .update({
        first_message_id: message.id,
        updated_at: createdAt
      })
      .eq("id", request.id);

    if (requestUpdate.error && !isMissingMessageLifecycleTable(requestUpdate.error)) {
      throw new MessagingServiceError("Unable to update message request state.", 500);
    }
  }

  const senderMetadata = await readPublicMessagingMetadataByProfileIds(supabase, [actor.profile.id])
    .then((metadata) => metadata.get(actor.profile.id) ?? null)
    .catch(() => null);

  return {
    message: {
      id: message.id,
      body: message.body,
      messageType: message.message_type,
      metadata: normalizeMessageMetadata(message.metadata),
      createdAt: message.created_at,
      senderName: senderMetadata?.displayName ?? getPublicFallbackName(actor.profile.role),
      senderRole: actor.profile.role,
      isOwn: true
    }
  };
}

async function readMessageRequestForAction(supabase: SupabaseClient, requestId: string, actorProfileId: string) {
  const result = await supabase
    .from("message_thread_requests")
    .select("id, thread_id, requested_by_profile_id, requested_to_profile_id, request_status, first_message_id, accepted_at, accepted_by_profile_id, declined_at, declined_by_profile_id, blocked_at, blocked_by_profile_id, reported_at, reported_by_profile_id, report_reason, created_at, updated_at")
    .eq("id", requestId)
    .maybeSingle();

  if (result.error) {
    throw new MessagingServiceError("Unable to load the message request.", 500);
  }

  if (!result.data) {
    throw new MessagingServiceError("Message request not found.", 404);
  }

  const request = result.data as MessageThreadRequestRow;
  if (request.requested_by_profile_id !== actorProfileId && request.requested_to_profile_id !== actorProfileId) {
    throw new MessagingServiceError("Only request participants can update this request.", 403);
  }

  return request;
}

export async function updateMessageThreadRequest(user: UserAccount, requestId: string, action: "accept" | "decline" | "block" | "report", input: { reason?: string | null; details?: string | null } = {}) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new MessagingServiceError("Messaging is available when Supabase is configured.", 503);
  }

  const actor = await resolveMessagingActor(user, supabase);
  const request = await readMessageRequestForAction(supabase, requestId, actor.profile.id);
  const now = new Date().toISOString();

  if (action === "accept") {
    if (request.requested_to_profile_id !== actor.profile.id) {
      throw new MessagingServiceError("Only the recipient can accept this request.", 403);
    }

    const update = await supabase
      .from("message_thread_requests")
      .update({
        request_status: "accepted",
        accepted_at: now,
        accepted_by_profile_id: actor.profile.id,
        updated_at: now
      })
      .eq("id", request.id);

    if (update.error) {
      throw new MessagingServiceError("Unable to accept the message request.", 500);
    }

    return getMessagingThreadPayload(user, request.thread_id);
  }

  if (action === "decline") {
    if (request.requested_to_profile_id !== actor.profile.id) {
      throw new MessagingServiceError("Only the recipient can decline this request.", 403);
    }

    const update = await supabase
      .from("message_thread_requests")
      .update({
        request_status: "declined",
        declined_at: now,
        declined_by_profile_id: actor.profile.id,
        updated_at: now
      })
      .eq("id", request.id);

    if (update.error) {
      throw new MessagingServiceError("Unable to decline the message request.", 500);
    }

    return getMessagingThreadPayload(user, request.thread_id);
  }

  if (action === "block") {
    const blockedProfileId = actor.profile.id === request.requested_by_profile_id
      ? request.requested_to_profile_id
      : request.requested_by_profile_id;
    const [requestUpdate, blockInsert] = await Promise.all([
      supabase
        .from("message_thread_requests")
        .update({
          request_status: "blocked",
          blocked_at: now,
          blocked_by_profile_id: actor.profile.id,
          updated_at: now
        })
        .eq("id", request.id),
      supabase
        .from("message_user_blocks")
        .insert({
          blocker_profile_id: actor.profile.id,
          blocked_profile_id: blockedProfileId,
          thread_id: request.thread_id,
          reason: input.reason ?? null
        })
    ]);

    if (requestUpdate.error || blockInsert.error) {
      throw new MessagingServiceError("Unable to block this message request.", 500);
    }

    return getMessagingThreadPayload(user, request.thread_id);
  }

  const reportedProfileId = actor.profile.id === request.requested_by_profile_id
    ? request.requested_to_profile_id
    : request.requested_by_profile_id;
  const reason = cleanText(input.reason) ?? "Message request report";
  const [requestUpdate, reportInsert] = await Promise.all([
    supabase
      .from("message_thread_requests")
      .update({
        request_status: "reported",
        reported_at: now,
        reported_by_profile_id: actor.profile.id,
        report_reason: reason,
        updated_at: now
      })
      .eq("id", request.id),
    supabase
      .from("message_reports")
      .insert({
        thread_id: request.thread_id,
        reported_by_profile_id: actor.profile.id,
        reported_profile_id: reportedProfileId,
        reason,
        details: input.details ?? null
      })
  ]);

  if (requestUpdate.error || reportInsert.error) {
    throw new MessagingServiceError("Unable to report this message request.", 500);
  }

  return getMessagingThreadPayload(user, request.thread_id);
}

type ArchitectMessagingActor = Pick<UserAccount, "id" | "email" | "name" | "role">;

function buildArchitectSupportThreadSummary(input: {
  thread: MessageThreadRow;
  supportProfileId: string;
  participants: ThreadParticipantRow[];
  profilesById: Map<string, ProfileRow>;
  publicMetadataByProfileId: Map<string, PublicMessagingMetadata>;
  publicMetadataByLocationId: Map<string, PublicMessagingMetadata>;
  latestMessageByThreadId: Map<string, MessageRow>;
  appointmentContexts: Map<string, HydratedAppointmentContext>;
  latestAppointmentContextsByThreadId: Map<string, HydratedAppointmentContext>;
  locationLabels: Map<string, string>;
  requestsByThreadId: Map<string, MessageThreadRequestRow>;
  messages: MessageRow[];
}): ArchitectSupportThreadSummary {
  const summary = buildThreadSummary({
    thread: input.thread,
    currentProfileId: input.supportProfileId,
    participants: input.participants,
    profilesById: input.profilesById,
    publicMetadataByProfileId: input.publicMetadataByProfileId,
    publicMetadataByLocationId: input.publicMetadataByLocationId,
    latestMessageByThreadId: input.latestMessageByThreadId,
    appointmentContexts: input.appointmentContexts,
    latestAppointmentContextsByThreadId: input.latestAppointmentContextsByThreadId,
    locationLabels: input.locationLabels,
    requestsByThreadId: input.requestsByThreadId
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
        publicMetadataByLocationId: bundle.publicMetadataByLocationId,
        latestMessageByThreadId: bundle.latestMessageByThreadId,
        appointmentContexts: bundle.appointmentContexts,
        latestAppointmentContextsByThreadId: bundle.latestAppointmentContextsByThreadId,
        locationLabels: bundle.locationLabels,
        requestsByThreadId: bundle.requestsByThreadId,
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
    publicMetadataByLocationId: bundle.publicMetadataByLocationId,
    latestMessageByThreadId: bundle.latestMessageByThreadId,
    appointmentContexts: bundle.appointmentContexts,
    latestAppointmentContextsByThreadId: bundle.latestAppointmentContextsByThreadId,
    locationLabels: bundle.locationLabels,
    requestsByThreadId: bundle.requestsByThreadId,
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
          fullName: metadata?.displayName ?? getPublicFallbackName(profile?.role ?? participant.thread_role),
          role: participant.thread_role,
          isSelf: participant.profile_id === supportProfile.id,
          avatarUrl: metadata?.avatarUrl ?? null,
          publicUsername: metadata?.publicUsername ?? null,
          publicContextLine: metadata?.publicContextLine ?? null,
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
        const senderMetadata = message.sender_profile_id ? bundle.publicMetadataByProfileId.get(message.sender_profile_id) ?? null : null;
        return {
          id: message.id,
          body: message.body,
          messageType: message.message_type,
          createdAt: message.created_at,
          senderName: sender ? senderMetadata?.displayName ?? getPublicFallbackName(sender.role) : null,
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
