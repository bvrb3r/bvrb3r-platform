import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeAccountRole } from "@/lib/auth/roles";
import type { Role, UserAccount } from "@/types/domain";
import { isRetiredRevenueShareAccountRole } from "@/lib/doctrine/legacy-data-aliases";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type SettingValue = string | boolean | number | string[] | null | undefined;
type SettingValues = Record<string, SettingValue>;
type EngagementEdgeType = "follow" | "save" | "favorite";
type TargetType = "client" | "barber" | "shop" | "service" | "style" | "culture_post" | "platform_item";

export type NotificationPreferencesPayload = {
  inAppEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  messageAlertsEnabled: boolean;
  bookingAlertsEnabled: boolean;
  payoutAlertsEnabled: boolean;
  creatorAlertsEnabled: boolean;
  rewardsAlertsEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  preferredContactChannel: string;
};

export type AppPreferencesPayload = {
  defaultView: string;
  preferredContactChannel: string;
  rebookingRemindersEnabled: boolean;
  autoBookSuggestionsEnabled: boolean;
  smartBookingSuggestionsEnabled: boolean;
  clientRebookPromptsEnabled: boolean;
  openSlotSuggestionsEnabled: boolean;
  shopOperatingView: string;
  ownerReportView: string;
  preferences: Record<string, unknown>;
  automationPreferences: Record<string, unknown>;
};

export type PrivacyPreferencesPayload = {
  publicProfileVisibility: string;
  followVisibility: "private" | "followers" | "public";
  savedItemsVisibility: "private";
  activityVisibility: "private";
  marketingConsent: boolean;
  preferences: Record<string, unknown>;
};

export type EngagementTargetInput = {
  targetType: TargetType | string;
  targetId: string;
  targetProfileId?: string | null;
  visibility?: "private" | "followers" | "public";
  metadata?: Record<string, unknown>;
};

export type EngagementEdgeRecord = EngagementTargetInput & {
  id: string;
  actorProfileId: string;
  actorRole: Role;
  edgeType: EngagementEdgeType;
  status: "active" | "removed";
  createdAt: string;
  updatedAt: string;
};

export type ActivityEventRecord = {
  id: string;
  actorProfileId: string;
  actorRole: Role;
  eventType: string;
  targetType?: string | null;
  targetId?: string | null;
  targetProfileId?: string | null;
  engagementEdgeId?: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type SettingsDisplayItem = {
  key: string;
  title: string;
  detail: string;
  meta?: string;
};

export type SettingsDisplaySection = {
  key: string;
  title: string;
  emptyText: string;
  items: SettingsDisplayItem[];
};

type DemoSettingsState = {
  notificationPreferences: Map<string, NotificationPreferencesPayload>;
  appPreferences: Map<string, AppPreferencesPayload>;
  privacyPreferences: Map<string, PrivacyPreferencesPayload>;
  edges: Map<string, EngagementEdgeRecord>;
  activity: ActivityEventRecord[];
};

const demoSettingsState: DemoSettingsState = {
  notificationPreferences: new Map(),
  appPreferences: new Map(),
  privacyPreferences: new Map(),
  edges: new Map(),
  activity: []
};

function nowIso() {
  return new Date().toISOString();
}

function actorRole(user: UserAccount): Role {
  return normalizeAccountRole(user.role);
}

function actorKey(user: UserAccount) {
  return `${user.id}:${actorRole(user)}`;
}

function edgeKey(user: UserAccount, edgeType: EngagementEdgeType, input: EngagementTargetInput) {
  return `${user.id}:${edgeType}:${input.targetType}:${input.targetId}`;
}

function assertSignedIn(user: UserAccount) {
  if (!user.id || user.id === "guest-user") {
    throw new Error("A signed-in account is required for canonical settings.");
  }
}

function cleanChannel(value: SettingValue) {
  const channel = typeof value === "string" ? value.trim() : "";
  return ["in_app", "sms", "email", "push"].includes(channel) ? channel : "in_app";
}

function cleanTime(value: SettingValue) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

function boolValue(value: SettingValue, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function hasSettingValue(values: SettingValues, ...keys: string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(values, key));
}

function notificationValue(values: SettingValues, snakeKey: string, camelKey: string) {
  return values[snakeKey] ?? values[camelKey];
}

function normalizeNotificationPreferences(values: SettingValues = {}, previous?: NotificationPreferencesPayload): NotificationPreferencesPayload {
  const previousChannel = previous?.preferredContactChannel ?? "in_app";

  return {
    inAppEnabled: boolValue(notificationValue(values, "in_app_enabled", "inAppEnabled"), previous?.inAppEnabled ?? true),
    smsEnabled: boolValue(notificationValue(values, "sms_enabled", "smsEnabled"), previous?.smsEnabled ?? false),
    emailEnabled: boolValue(notificationValue(values, "email_enabled", "emailEnabled"), previous?.emailEnabled ?? true),
    pushEnabled: boolValue(notificationValue(values, "push_enabled", "pushEnabled"), previous?.pushEnabled ?? false),
    messageAlertsEnabled: boolValue(notificationValue(values, "message_alerts_enabled", "messageAlertsEnabled"), previous?.messageAlertsEnabled ?? true),
    bookingAlertsEnabled: boolValue(notificationValue(values, "booking_alerts_enabled", "bookingAlertsEnabled"), previous?.bookingAlertsEnabled ?? true),
    payoutAlertsEnabled: boolValue(notificationValue(values, "payout_alerts_enabled", "payoutAlertsEnabled"), previous?.payoutAlertsEnabled ?? true),
    creatorAlertsEnabled: boolValue(notificationValue(values, "creator_alerts_enabled", "creatorAlertsEnabled"), previous?.creatorAlertsEnabled ?? false),
    rewardsAlertsEnabled: boolValue(notificationValue(values, "rewards_alerts_enabled", "rewardsAlertsEnabled"), previous?.rewardsAlertsEnabled ?? true),
    quietHoursStart: hasSettingValue(values, "quiet_hours_start", "quietHoursStart") ? cleanTime(notificationValue(values, "quiet_hours_start", "quietHoursStart")) : previous?.quietHoursStart ?? null,
    quietHoursEnd: hasSettingValue(values, "quiet_hours_end", "quietHoursEnd") ? cleanTime(notificationValue(values, "quiet_hours_end", "quietHoursEnd")) : previous?.quietHoursEnd ?? null,
    preferredContactChannel: hasSettingValue(values, "preferred_contact_channel", "preferredContactChannel") ? cleanChannel(notificationValue(values, "preferred_contact_channel", "preferredContactChannel")) : previousChannel
  };
}

function normalizeAppPreferences(values: SettingValues = {}, previous?: AppPreferencesPayload): AppPreferencesPayload {
  const defaultView = typeof values.default_view === "string" ? values.default_view : typeof values.defaultView === "string" ? values.defaultView : previous?.defaultView ?? "role_default";
  const preferredContactChannel = hasSettingValue(values, "preferred_contact_channel", "preferredContactChannel")
    ? cleanChannel(values.preferred_contact_channel ?? values.preferredContactChannel)
    : previous?.preferredContactChannel ?? "in_app";
  const rebookingRemindersEnabled = boolValue(values.rebooking_reminders_enabled ?? values.rebookingRemindersEnabled, previous?.rebookingRemindersEnabled ?? false);
  const smartBookingSuggestionsEnabled = boolValue(values.smart_booking_suggestions_enabled ?? values.smartBookingSuggestionsEnabled, previous?.smartBookingSuggestionsEnabled ?? false);
  const clientRebookPromptsEnabled = boolValue(values.client_rebook_prompts_enabled ?? values.clientRebookPromptsEnabled, previous?.clientRebookPromptsEnabled ?? rebookingRemindersEnabled);
  const openSlotSuggestionsEnabled = boolValue(values.open_slot_suggestions_enabled ?? values.openSlotSuggestionsEnabled, previous?.openSlotSuggestionsEnabled ?? false);
  const autoBookSuggestionsEnabled = boolValue(values.auto_book_suggestions_enabled ?? values.autoBookSuggestionsEnabled, previous?.autoBookSuggestionsEnabled ?? (smartBookingSuggestionsEnabled || openSlotSuggestionsEnabled));
  const shopOperatingView = typeof values.shop_operating_view === "string" ? values.shop_operating_view : typeof values.shopOperatingView === "string" ? values.shopOperatingView : previous?.shopOperatingView ?? "role_default";
  const ownerReportView = typeof values.owner_report_view === "string" ? values.owner_report_view : typeof values.ownerReportView === "string" ? values.ownerReportView : previous?.ownerReportView ?? "role_default";

  return {
    defaultView,
    preferredContactChannel,
    rebookingRemindersEnabled,
    autoBookSuggestionsEnabled,
    smartBookingSuggestionsEnabled,
    clientRebookPromptsEnabled,
    openSlotSuggestionsEnabled,
    shopOperatingView,
    ownerReportView,
    preferences: {
      defaultView,
      preferredContactChannel,
      shopOperatingView,
      ownerReportView
    },
    automationPreferences: {
      allowRebookReminders: rebookingRemindersEnabled,
      allowSmartBookingSuggestions: smartBookingSuggestionsEnabled,
      allowClientRebookPrompts: clientRebookPromptsEnabled,
      allowOpenSlotSuggestions: openSlotSuggestionsEnabled,
      allowAutoBookSuggestions: autoBookSuggestionsEnabled
    }
  };
}

function normalizePrivacyPreferences(values: SettingValues = {}): PrivacyPreferencesPayload {
  const followVisibility = values.follow_visibility === "public" || values.follow_visibility === "followers" ? values.follow_visibility : "private";
  const publicProfileVisibility = typeof values.public_profile_visibility === "string" ? values.public_profile_visibility : "role_safe";

  return {
    publicProfileVisibility,
    followVisibility,
    savedItemsVisibility: "private",
    activityVisibility: "private",
    marketingConsent: boolValue(values.marketing_consent ?? values.marketingConsent, false),
    preferences: {
      publicProfileVisibility,
      followVisibility,
      savedItemsVisibility: "private",
      activityVisibility: "private"
    }
  };
}

function toNotificationRow(user: UserAccount, payload: NotificationPreferencesPayload) {
  return {
    profile_id: user.id,
    role: actorRole(user),
    user_email: user.email,
    client_reference: user.clientId ?? null,
    barber_reference: user.barberId ?? null,
    in_app_enabled: payload.inAppEnabled,
    sms_enabled: payload.smsEnabled,
    email_enabled: payload.emailEnabled,
    push_enabled: payload.pushEnabled,
    message_alerts_enabled: payload.messageAlertsEnabled,
    booking_alerts_enabled: payload.bookingAlertsEnabled,
    payout_alerts_enabled: payload.payoutAlertsEnabled,
    creator_alerts_enabled: payload.creatorAlertsEnabled,
    rewards_alerts_enabled: payload.rewardsAlertsEnabled,
    quiet_hours_start: payload.quietHoursStart,
    quiet_hours_end: payload.quietHoursEnd,
    preferred_contact_channel: payload.preferredContactChannel,
    notification_preferences: payload,
    updated_at: nowIso()
  };
}

function notificationPayloadFromRow(row: Record<string, unknown> | null | undefined) {
  if (!row) {
    return undefined;
  }

  const storedPreferences = row.notification_preferences && typeof row.notification_preferences === "object" && !Array.isArray(row.notification_preferences)
    ? row.notification_preferences as Record<string, SettingValue>
    : {};

  return normalizeNotificationPreferences({
    in_app_enabled: (row.in_app_enabled as SettingValue) ?? storedPreferences.in_app_enabled ?? storedPreferences.inAppEnabled,
    sms_enabled: (row.sms_enabled as SettingValue) ?? storedPreferences.sms_enabled ?? storedPreferences.smsEnabled,
    email_enabled: (row.email_enabled as SettingValue) ?? storedPreferences.email_enabled ?? storedPreferences.emailEnabled,
    push_enabled: (row.push_enabled as SettingValue) ?? storedPreferences.push_enabled ?? storedPreferences.pushEnabled,
    message_alerts_enabled: (row.message_alerts_enabled as SettingValue) ?? storedPreferences.message_alerts_enabled ?? storedPreferences.messageAlertsEnabled,
    booking_alerts_enabled: (row.booking_alerts_enabled as SettingValue) ?? storedPreferences.booking_alerts_enabled ?? storedPreferences.bookingAlertsEnabled,
    payout_alerts_enabled: (row.payout_alerts_enabled as SettingValue) ?? storedPreferences.payout_alerts_enabled ?? storedPreferences.payoutAlertsEnabled,
    creator_alerts_enabled: (row.creator_alerts_enabled as SettingValue) ?? storedPreferences.creator_alerts_enabled ?? storedPreferences.creatorAlertsEnabled,
    rewards_alerts_enabled: (row.rewards_alerts_enabled as SettingValue) ?? storedPreferences.rewards_alerts_enabled ?? storedPreferences.rewardsAlertsEnabled,
    quiet_hours_start: (row.quiet_hours_start as SettingValue) ?? storedPreferences.quiet_hours_start ?? storedPreferences.quietHoursStart,
    quiet_hours_end: (row.quiet_hours_end as SettingValue) ?? storedPreferences.quiet_hours_end ?? storedPreferences.quietHoursEnd,
    preferred_contact_channel: (row.preferred_contact_channel as SettingValue) ?? storedPreferences.preferred_contact_channel ?? storedPreferences.preferredContactChannel
  });
}

async function loadExistingNotificationPreferences(supabase: SupabaseClient, user: UserAccount) {
  const query = supabase
    .from("notification_preferences")
    .select("in_app_enabled, sms_enabled, email_enabled, push_enabled, message_alerts_enabled, booking_alerts_enabled, payout_alerts_enabled, creator_alerts_enabled, rewards_alerts_enabled, quiet_hours_start, quiet_hours_end, preferred_contact_channel, notification_preferences")
    .eq("role", actorRole(user));
  const scopedQuery = user.email ? query.eq("user_email", user.email) : query.eq("profile_id", user.id);
  const result = await scopedQuery.maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return notificationPayloadFromRow(result.data as Record<string, unknown> | null);
}

function toAppPreferencesRow(user: UserAccount, payload: AppPreferencesPayload) {
  return {
    profile_id: user.id,
    role: actorRole(user),
    preferences: payload.preferences,
    automation_preferences: payload.automationPreferences,
    default_view: payload.defaultView,
    preferred_contact_channel: payload.preferredContactChannel,
    rebooking_reminders_enabled: payload.rebookingRemindersEnabled,
    auto_book_suggestions_enabled: payload.autoBookSuggestionsEnabled,
    updated_at: nowIso()
  };
}

function appPreferencesPayloadFromRow(row: Record<string, unknown> | null | undefined) {
  if (!row) {
    return undefined;
  }

  const preferences = row.preferences && typeof row.preferences === "object" && !Array.isArray(row.preferences)
    ? row.preferences as Record<string, SettingValue>
    : {};
  const automationPreferences = row.automation_preferences && typeof row.automation_preferences === "object" && !Array.isArray(row.automation_preferences)
    ? row.automation_preferences as Record<string, SettingValue>
    : {};

  return normalizeAppPreferences({
    default_view: (row.default_view as SettingValue) ?? preferences.defaultView ?? preferences.default_view,
    preferred_contact_channel: (row.preferred_contact_channel as SettingValue) ?? preferences.preferredContactChannel ?? preferences.preferred_contact_channel,
    rebooking_reminders_enabled: (row.rebooking_reminders_enabled as SettingValue) ?? automationPreferences.allowRebookReminders ?? automationPreferences.rebooking_reminders_enabled,
    auto_book_suggestions_enabled: (row.auto_book_suggestions_enabled as SettingValue) ?? automationPreferences.allowAutoBookSuggestions ?? automationPreferences.auto_book_suggestions_enabled,
    smart_booking_suggestions_enabled: automationPreferences.allowSmartBookingSuggestions ?? automationPreferences.smart_booking_suggestions_enabled,
    client_rebook_prompts_enabled: automationPreferences.allowClientRebookPrompts ?? automationPreferences.client_rebook_prompts_enabled,
    open_slot_suggestions_enabled: automationPreferences.allowOpenSlotSuggestions ?? automationPreferences.open_slot_suggestions_enabled,
    shop_operating_view: preferences.shopOperatingView ?? preferences.shop_operating_view,
    owner_report_view: preferences.ownerReportView ?? preferences.owner_report_view
  });
}

async function loadExistingAppPreferences(supabase: SupabaseClient, user: UserAccount) {
  const result = await supabase
    .from("user_app_preferences")
    .select("preferences, automation_preferences, default_view, preferred_contact_channel, rebooking_reminders_enabled, auto_book_suggestions_enabled")
    .eq("profile_id", user.id)
    .eq("role", actorRole(user))
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return appPreferencesPayloadFromRow(result.data as Record<string, unknown> | null);
}

function toPrivacyPreferencesRow(user: UserAccount, payload: PrivacyPreferencesPayload) {
  return {
    profile_id: user.id,
    role: actorRole(user),
    preferences: payload.preferences,
    public_profile_visibility: payload.publicProfileVisibility,
    follow_visibility: payload.followVisibility,
    saved_items_visibility: payload.savedItemsVisibility,
    activity_visibility: payload.activityVisibility,
    marketing_consent: payload.marketingConsent,
    updated_at: nowIso()
  };
}

function edgeFromRow(row: Record<string, unknown>): EngagementEdgeRecord {
  return {
    id: String(row.id),
    actorProfileId: String(row.actor_profile_id),
    actorRole: row.actor_role as Role,
    edgeType: row.edge_type as EngagementEdgeType,
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    targetProfileId: typeof row.target_profile_id === "string" ? row.target_profile_id : null,
    visibility: (row.visibility as EngagementEdgeRecord["visibility"]) ?? "private",
    status: (row.status as EngagementEdgeRecord["status"]) ?? "active",
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function activityFromRow(row: Record<string, unknown>): ActivityEventRecord {
  return {
    id: String(row.id),
    actorProfileId: String(row.actor_profile_id),
    actorRole: row.actor_role as Role,
    eventType: String(row.event_type),
    targetType: typeof row.target_type === "string" ? row.target_type : null,
    targetId: typeof row.target_id === "string" ? row.target_id : null,
    targetProfileId: typeof row.target_profile_id === "string" ? row.target_profile_id : null,
    engagementEdgeId: typeof row.engagement_edge_id === "string" ? row.engagement_edge_id : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    occurredAt: String(row.occurred_at)
  };
}

function safeMetadataLabel(metadata: Record<string, unknown>) {
  const label = metadata.label ?? metadata.title ?? metadata.name ?? metadata.displayName;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function targetTypeLabel(value?: string | null) {
  if (!value) {
    return "account";
  }

  switch (value) {
    case "barber":
      return "barber";
    case "shop":
      return "shop";
    case "client":
      return "client";
    case "service":
      return "service";
    case "style":
      return "style";
    case "culture_post":
      return "Culture item";
    case "platform_item":
      return "platform item";
    default:
      return titleCase(value).toLowerCase();
  }
}

function edgeTitle(edge: EngagementEdgeRecord) {
  const label = safeMetadataLabel(edge.metadata ?? {});
  if (label) {
    return label;
  }

  const action = edge.edgeType === "follow" ? "Followed" : edge.edgeType === "favorite" ? "Favorite" : "Saved";
  return `${action} ${targetTypeLabel(edge.targetType)}`;
}

function edgeDetail(edge: EngagementEdgeRecord) {
  const privacy = edge.visibility === "public" ? "Privacy-controlled follow" : "Private";
  return `${privacy} ${edge.edgeType} record for a ${targetTypeLabel(edge.targetType)}.`;
}

function isClientSettingsRole(role: Role) {
  return role === "client" || role === "client_user";
}

function isBarberSettingsRole(role: Role) {
  return role === "barber" || role === "barber_user" || role === "freelance_barber" || isRetiredRevenueShareAccountRole(role) || role === "booth_rent_barber";
}

function savedSectionsFor(role: Role, edges: EngagementEdgeRecord[]): SettingsDisplaySection[] {
  if (isClientSettingsRole(role)) {
    return [
      {
        key: "client-saved-barbers",
        title: "Saved barbers",
        emptyText: "No saved barbers yet.",
        items: edges.filter((edge) => edge.targetType === "barber").map(displayEdge)
      },
      {
        key: "client-saved-shops",
        title: "Saved shops",
        emptyText: "No saved shops yet.",
        items: edges.filter((edge) => edge.targetType === "shop").map(displayEdge)
      },
      {
        key: "client-saved-items",
        title: "Saved styles and platform items",
        emptyText: "No saved styles or platform items yet.",
        items: edges.filter((edge) => ["style", "service", "culture_post", "platform_item"].includes(edge.targetType)).map(displayEdge)
      }
    ];
  }

  if (isBarberSettingsRole(role)) {
    return [
      {
        key: "barber-saved-clients",
        title: "Saved clients",
        emptyText: "No saved clients yet.",
        items: edges.filter((edge) => edge.targetType === "client").map(displayEdge)
      },
      {
        key: "barber-saved-marketplace",
        title: "Saved marketplace items",
        emptyText: "No saved marketplace items yet.",
        items: edges.filter((edge) => edge.targetType !== "client").map(displayEdge)
      }
    ];
  }

  return [
    {
      key: "owner-saved-prospects",
      title: "Saved barbers and team prospects",
      emptyText: "No saved barber prospects yet.",
      items: edges.filter((edge) => edge.targetType === "barber").map(displayEdge)
    },
    {
      key: "owner-saved-marketplace",
      title: "Saved shop and marketplace items",
      emptyText: "No saved shop or marketplace items yet.",
      items: edges.filter((edge) => edge.targetType !== "barber").map(displayEdge)
    }
  ];
}

function displayEdge(edge: EngagementEdgeRecord): SettingsDisplayItem {
  return {
    key: `${edge.edgeType}-${edge.targetType}-${edge.createdAt}`,
    title: edgeTitle(edge),
    detail: edgeDetail(edge),
    meta: `Updated ${new Date(edge.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
  };
}

function displayActivity(event: ActivityEventRecord): SettingsDisplayItem {
  const label = safeMetadataLabel(event.metadata ?? {});
  const title = label ?? titleCase(event.eventType);
  const detail = event.targetType
    ? `${titleCase(event.eventType)} on ${targetTypeLabel(event.targetType)}.`
    : `${titleCase(event.eventType)}.`;

  return {
    key: `${event.eventType}-${event.occurredAt}`,
    title,
    detail,
    meta: `Recorded ${new Date(event.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
  };
}

function displayToggleState(value: boolean) {
  return value ? "On" : "Off";
}

function displayNotificationPreferenceItems(payload: NotificationPreferencesPayload): SettingsDisplayItem[] {
  return [
    { key: "in-app-alerts", title: "In-app alerts", detail: displayToggleState(payload.inAppEnabled), meta: "Current channel consent" },
    { key: "sms-updates", title: "SMS updates", detail: displayToggleState(payload.smsEnabled), meta: "Current channel consent" },
    { key: "email-updates", title: "Email updates", detail: displayToggleState(payload.emailEnabled), meta: "Current channel consent" },
    { key: "push-reminders", title: "Push reminders", detail: displayToggleState(payload.pushEnabled), meta: "Current channel consent" },
    { key: "message-alerts", title: "Message alerts", detail: displayToggleState(payload.messageAlertsEnabled), meta: "Current category consent" },
    { key: "booking-alerts", title: "Booking alerts", detail: displayToggleState(payload.bookingAlertsEnabled), meta: "Current category consent" },
    { key: "payout-alerts", title: "Payout and money posture alerts", detail: displayToggleState(payload.payoutAlertsEnabled), meta: "Current category consent" },
    { key: "culture-updates", title: "Culture updates", detail: displayToggleState(payload.creatorAlertsEnabled), meta: "Current category consent" },
    { key: "rewards-alerts", title: "Rewards alerts", detail: displayToggleState(payload.rewardsAlertsEnabled), meta: "Current category consent" },
    { key: "preferred-contact-channel", title: "Preferred contact channel", detail: titleCase(payload.preferredContactChannel), meta: "Current consent preference" }
  ];
}

function displayUnconfiguredNotificationPreferenceItems(): SettingsDisplayItem[] {
  return [
    "In-app alerts",
    "SMS updates",
    "Email updates",
    "Push reminders",
    "Message alerts",
    "Booking alerts",
    "Payout and money posture alerts",
    "Culture updates",
    "Rewards alerts",
    "Preferred contact channel"
  ].map((title) => ({
    key: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    title,
    detail: "Not configured yet",
    meta: "No saved consent record"
  }));
}

async function maybeSupabase() {
  return createSupabaseAdminClient();
}

async function persistActivityToSupabase(supabase: SupabaseClient, user: UserAccount, input: {
  eventType: string;
  targetType?: string | null;
  targetId?: string | null;
  targetProfileId?: string | null;
  engagementEdgeId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const result = await supabase.from("user_activity_events").insert({
    actor_profile_id: user.id,
    actor_role: actorRole(user),
    event_type: input.eventType,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    target_profile_id: input.targetProfileId ?? null,
    engagement_edge_id: input.engagementEdgeId ?? null,
    metadata: input.metadata ?? {},
    occurred_at: nowIso()
  }).select("*").single();

  if (result.error) {
    throw result.error;
  }

  return result.data as Record<string, unknown>;
}

export async function recordActivityEvent(user: UserAccount, input: {
  eventType: string;
  targetType?: string | null;
  targetId?: string | null;
  targetProfileId?: string | null;
  engagementEdgeId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ActivityEventRecord> {
  assertSignedIn(user);
  const supabase = await maybeSupabase();
  const occurredAt = nowIso();

  if (supabase) {
    const row = await persistActivityToSupabase(supabase, user, input);
    return {
      id: String(row.id),
      actorProfileId: String(row.actor_profile_id),
      actorRole: row.actor_role as Role,
      eventType: String(row.event_type),
      targetType: row.target_type ? String(row.target_type) : null,
      targetId: row.target_id ? String(row.target_id) : null,
      targetProfileId: row.target_profile_id ? String(row.target_profile_id) : null,
      engagementEdgeId: row.engagement_edge_id ? String(row.engagement_edge_id) : null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      occurredAt: String(row.occurred_at)
    };
  }

  const record: ActivityEventRecord = {
    id: crypto.randomUUID(),
    actorProfileId: user.id,
    actorRole: actorRole(user),
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId,
    targetProfileId: input.targetProfileId,
    engagementEdgeId: input.engagementEdgeId,
    metadata: input.metadata ?? {},
    occurredAt
  };
  demoSettingsState.activity.unshift(record);
  return record;
}

export async function updateNotificationPreferences(user: UserAccount, values: SettingValues) {
  assertSignedIn(user);
  const supabase = await maybeSupabase();
  const existing = supabase
    ? await loadExistingNotificationPreferences(supabase, user)
    : demoSettingsState.notificationPreferences.get(actorKey(user));
  const payload = normalizeNotificationPreferences(values, existing);

  if (supabase) {
    const result = await supabase
      .from("notification_preferences")
      .upsert(toNotificationRow(user, payload), { onConflict: "role,user_email" })
      .select("*")
      .single();

    if (result.error) {
      throw result.error;
    }
  } else {
    demoSettingsState.notificationPreferences.set(actorKey(user), payload);
  }

  const activity = await recordActivityEvent(user, {
    eventType: "notification_preferences_updated",
    targetType: "settings",
    targetId: "notifications",
    metadata: { channels: payload }
  });

  return { notificationPreferences: payload, activity };
}

export async function listNotificationPreferences(user: UserAccount) {
  assertSignedIn(user);
  const supabase = await maybeSupabase();
  const payload = supabase
    ? await loadExistingNotificationPreferences(supabase, user)
    : demoSettingsState.notificationPreferences.get(actorKey(user));

  return {
    notificationPreferences: payload ?? null,
    items: payload ? displayNotificationPreferenceItems(payload) : displayUnconfiguredNotificationPreferenceItems(),
    emptyText: "Notification preference consent has not been configured yet."
  };
}

export async function updateAppPreferences(user: UserAccount, values: SettingValues) {
  assertSignedIn(user);
  const supabase = await maybeSupabase();
  const existing = supabase
    ? await loadExistingAppPreferences(supabase, user)
    : demoSettingsState.appPreferences.get(actorKey(user));
  const payload = normalizeAppPreferences(values, existing);

  if (supabase) {
    const result = await supabase
      .from("user_app_preferences")
      .upsert(toAppPreferencesRow(user, payload), { onConflict: "profile_id,role" })
      .select("*")
      .single();

    if (result.error) {
      throw result.error;
    }
  } else {
    demoSettingsState.appPreferences.set(actorKey(user), payload);
  }

  const activity = await recordActivityEvent(user, {
    eventType: "app_preferences_updated",
    targetType: "settings",
    targetId: "preferences",
    metadata: { preferences: payload.preferences, automationPreferences: payload.automationPreferences }
  });

  return { appPreferences: payload, activity };
}

export async function updatePrivacyPreferences(user: UserAccount, values: SettingValues) {
  assertSignedIn(user);
  const payload = normalizePrivacyPreferences(values);
  const supabase = await maybeSupabase();

  if (supabase) {
    const result = await supabase
      .from("privacy_preferences")
      .upsert(toPrivacyPreferencesRow(user, payload), { onConflict: "profile_id,role" })
      .select("*")
      .single();

    if (result.error) {
      throw result.error;
    }
  } else {
    demoSettingsState.privacyPreferences.set(actorKey(user), payload);
  }

  const activity = await recordActivityEvent(user, {
    eventType: "privacy_preferences_updated",
    targetType: "settings",
    targetId: "privacy",
    metadata: { preferences: payload.preferences }
  });

  return { privacyPreferences: payload, activity };
}

async function setEngagementEdge(user: UserAccount, edgeType: EngagementEdgeType, input: EngagementTargetInput, status: "active" | "removed") {
  assertSignedIn(user);
  if (!input.targetType || !input.targetId) {
    throw new Error("A target type and target id are required for engagement edges.");
  }

  const visibility = input.visibility ?? "private";
  const supabase = await maybeSupabase();
  const updatedAt = nowIso();

  if (supabase) {
    const result = await supabase
      .from("user_engagement_edges")
      .upsert({
        actor_profile_id: user.id,
        actor_role: actorRole(user),
        edge_type: edgeType,
        target_type: input.targetType,
        target_id: input.targetId,
        target_profile_id: input.targetProfileId ?? null,
        visibility,
        status,
        metadata: input.metadata ?? {},
        updated_at: updatedAt,
        deleted_at: status === "removed" ? updatedAt : null
      }, { onConflict: "actor_profile_id,edge_type,target_type,target_id" })
      .select("*")
      .single();

    if (result.error) {
      throw result.error;
    }

    await recordActivityEvent(user, {
      eventType: `${edgeType}_${status === "active" ? "created" : "removed"}`,
      targetType: input.targetType,
      targetId: input.targetId,
      targetProfileId: input.targetProfileId,
      engagementEdgeId: String(result.data.id),
      metadata: { visibility }
    });

    return result.data;
  }

  const key = edgeKey(user, edgeType, input);
  const current = demoSettingsState.edges.get(key);
  const record: EngagementEdgeRecord = {
    id: current?.id ?? crypto.randomUUID(),
    actorProfileId: user.id,
    actorRole: actorRole(user),
    edgeType,
    targetType: input.targetType,
    targetId: input.targetId,
    targetProfileId: input.targetProfileId,
    visibility,
    status,
    metadata: input.metadata ?? {},
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt
  };
  demoSettingsState.edges.set(key, record);
  await recordActivityEvent(user, {
    eventType: `${edgeType}_${status === "active" ? "created" : "removed"}`,
    targetType: input.targetType,
    targetId: input.targetId,
    targetProfileId: input.targetProfileId,
    engagementEdgeId: record.id,
    metadata: { visibility }
  });
  return record;
}

export function followTarget(user: UserAccount, input: EngagementTargetInput) {
  return setEngagementEdge(user, "follow", input, "active");
}

export function unfollowTarget(user: UserAccount, input: EngagementTargetInput) {
  return setEngagementEdge(user, "follow", input, "removed");
}

export function saveTarget(user: UserAccount, input: EngagementTargetInput) {
  return setEngagementEdge(user, "save", input, "active");
}

export function unsaveTarget(user: UserAccount, input: EngagementTargetInput) {
  return setEngagementEdge(user, "save", input, "removed");
}

export function favoriteTarget(user: UserAccount, input: EngagementTargetInput) {
  return setEngagementEdge(user, "favorite", input, "active");
}

export function unfavoriteTarget(user: UserAccount, input: EngagementTargetInput) {
  return setEngagementEdge(user, "favorite", input, "removed");
}

export async function listSavedFavorites(user: UserAccount) {
  assertSignedIn(user);
  const supabase = await maybeSupabase();
  const role = actorRole(user);

  if (supabase) {
    const result = await supabase
      .from("user_engagement_edges")
      .select("id, actor_profile_id, actor_role, edge_type, target_type, target_id, target_profile_id, visibility, status, metadata, created_at, updated_at")
      .eq("actor_profile_id", user.id)
      .in("edge_type", ["follow", "save", "favorite"])
      .eq("status", "active")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (result.error) {
      throw result.error;
    }

    const edges = (result.data ?? []).map((row) => edgeFromRow(row as Record<string, unknown>));
    return { edges, sections: savedSectionsFor(role, edges) };
  }

  const edges = [...demoSettingsState.edges.values()]
    .filter((edge) => edge.actorProfileId === user.id && edge.actorRole === role && edge.status === "active")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    edges,
    sections: savedSectionsFor(role, edges)
  };
}

export async function listActivity(user: UserAccount, limit = 50) {
  assertSignedIn(user);
  const supabase = await maybeSupabase();

  if (supabase) {
    const result = await supabase
      .from("user_activity_events")
      .select("id, actor_profile_id, actor_role, event_type, target_type, target_id, target_profile_id, engagement_edge_id, metadata, occurred_at")
      .eq("actor_profile_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (result.error) {
      throw result.error;
    }

    const events = (result.data ?? []).map((row) => activityFromRow(row as Record<string, unknown>));
    return { events, items: events.map(displayActivity), emptyText: "No account activity yet." };
  }

  const events = demoSettingsState.activity
    .filter((event) => event.actorProfileId === user.id && event.actorRole === actorRole(user))
    .slice(0, limit);

  return {
    events,
    items: events.map(displayActivity),
    emptyText: "No account activity yet."
  };
}

export function __resetDemoSettingsStateForTests() {
  demoSettingsState.notificationPreferences.clear();
  demoSettingsState.appPreferences.clear();
  demoSettingsState.privacyPreferences.clear();
  demoSettingsState.edges.clear();
  demoSettingsState.activity = [];
}
