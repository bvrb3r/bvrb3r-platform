import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { buildPlatformEventIdempotencyKey, recordRequiredPlatformEvent } from "@/lib/core/platform-events";
import { createMessagingThread, MessagingServiceError, sendThreadMessage } from "@/lib/messages/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

export const SUPPORT_SAFETY_DISCLAIMER = "If someone is in immediate danger, contact local emergency services.";

export const SUPPORT_ISSUE_CATEGORIES = [
  "booking_problem",
  "payment_or_receipt_problem",
  "account_or_login_problem",
  "message_problem",
  "notification_problem",
  "profile_or_settings_problem",
  "shop_or_queue_problem",
  "kiosk_problem",
  "app_bug",
  "feedback_or_feature_request",
  "safety_or_trust_concern",
  "other"
] as const;

export const SUPPORT_ISSUE_SEVERITIES = ["low", "normal", "high", "urgent"] as const;

export type SupportIssueCategory = (typeof SUPPORT_ISSUE_CATEGORIES)[number];
export type SupportIssueSeverity = (typeof SUPPORT_ISSUE_SEVERITIES)[number];
export type SupportIssueRoleScope = "client" | "barber" | "owner";
export type SupportIssueSourceSurface = "client_more" | "barber_more" | "owner_more" | "unknown";

type SupportIssueRouteTarget = {
  ownerLane: "Product" | "Operations" | "Finance" | "Security" | "Compliance" | "Technology" | "Support";
  supportQueue: "booking" | "money" | "account" | "messages" | "notifications" | "profile_settings" | "shop_queue" | "kiosk" | "bug" | "feedback" | "trust_safety" | "general";
  architectSummary: string;
};

export type SupportIssueIntakeInput = {
  category?: unknown;
  severity?: unknown;
  description?: unknown;
  sourceSurface?: unknown;
};

export type SupportIssueSubmissionResult = {
  status: "received";
  category: SupportIssueCategory;
  categoryLabel: string;
  severity: SupportIssueSeverity;
  roleScope: SupportIssueRoleScope;
  threadId: string;
  messageId: string;
  receivedAt: string;
  routeTarget: SupportIssueRouteTarget;
  eventRecorded: true;
};

export class SupportIssueIntakeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "support_issue_intake_error"
  ) {
    super(message);
    this.name = "SupportIssueIntakeError";
  }
}

const CATEGORY_LABELS: Record<SupportIssueCategory, string> = {
  booking_problem: "Booking problem",
  payment_or_receipt_problem: "Payment or receipt problem",
  account_or_login_problem: "Account or login problem",
  message_problem: "Message problem",
  notification_problem: "Notification problem",
  profile_or_settings_problem: "Profile or settings problem",
  shop_or_queue_problem: "Shop or queue problem",
  kiosk_problem: "Kiosk problem",
  app_bug: "App bug",
  feedback_or_feature_request: "Feedback or feature request",
  safety_or_trust_concern: "Safety or trust concern",
  other: "Other"
};

const SEVERITY_LABELS: Record<SupportIssueSeverity, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent"
};

const ROLE_CATEGORY_ALLOWLIST: Record<SupportIssueRoleScope, readonly SupportIssueCategory[]> = {
  client: SUPPORT_ISSUE_CATEGORIES.filter((category) => category !== "shop_or_queue_problem" && category !== "kiosk_problem"),
  barber: SUPPORT_ISSUE_CATEGORIES.filter((category) => category !== "kiosk_problem"),
  owner: SUPPORT_ISSUE_CATEGORIES
};

const ROUTE_TARGETS: Record<SupportIssueCategory, SupportIssueRouteTarget> = {
  booking_problem: {
    ownerLane: "Operations",
    supportQueue: "booking",
    architectSummary: "Booking and appointment operations"
  },
  payment_or_receipt_problem: {
    ownerLane: "Finance",
    supportQueue: "money",
    architectSummary: "Payment and receipt evidence"
  },
  account_or_login_problem: {
    ownerLane: "Security",
    supportQueue: "account",
    architectSummary: "Account access and identity"
  },
  message_problem: {
    ownerLane: "Product",
    supportQueue: "messages",
    architectSummary: "Messaging experience"
  },
  notification_problem: {
    ownerLane: "Product",
    supportQueue: "notifications",
    architectSummary: "Notification consent and delivery posture"
  },
  profile_or_settings_problem: {
    ownerLane: "Product",
    supportQueue: "profile_settings",
    architectSummary: "Profile and settings experience"
  },
  shop_or_queue_problem: {
    ownerLane: "Operations",
    supportQueue: "shop_queue",
    architectSummary: "Shop, queue, or team operations"
  },
  kiosk_problem: {
    ownerLane: "Operations",
    supportQueue: "kiosk",
    architectSummary: "Kiosk operations"
  },
  app_bug: {
    ownerLane: "Technology",
    supportQueue: "bug",
    architectSummary: "Runtime bug report"
  },
  feedback_or_feature_request: {
    ownerLane: "Product",
    supportQueue: "feedback",
    architectSummary: "Product feedback"
  },
  safety_or_trust_concern: {
    ownerLane: "Compliance",
    supportQueue: "trust_safety",
    architectSummary: "Safety, trust, and compliance"
  },
  other: {
    ownerLane: "Support",
    supportQueue: "general",
    architectSummary: "General support triage"
  }
};

function isSupportIssueCategory(value: unknown): value is SupportIssueCategory {
  return typeof value === "string" && SUPPORT_ISSUE_CATEGORIES.includes(value as SupportIssueCategory);
}

function isSupportIssueSeverity(value: unknown): value is SupportIssueSeverity {
  return typeof value === "string" && SUPPORT_ISSUE_SEVERITIES.includes(value as SupportIssueSeverity);
}

export function resolveSupportIssueRoleScope(role: UserAccount["role"] | string | null | undefined): SupportIssueRoleScope | null {
  if (!role) {
    return null;
  }

  if (isClientRole(role as UserAccount["role"])) {
    return "client";
  }

  if (isBarberAccountRole(role as UserAccount["role"])) {
    return "barber";
  }

  if (isShopOwnerRole(role as UserAccount["role"]) || role === "manager" || role === "front_desk") {
    return "owner";
  }

  return null;
}

export function getSupportIssueCategoryOptionsForRole(roleScope: SupportIssueRoleScope) {
  return ROLE_CATEGORY_ALLOWLIST[roleScope].map((value) => ({
    value,
    label: CATEGORY_LABELS[value]
  }));
}

export function getSupportIssueCategoryLabel(category: SupportIssueCategory) {
  return CATEGORY_LABELS[category];
}

export function getSupportIssueSeverityLabel(severity: SupportIssueSeverity) {
  return SEVERITY_LABELS[severity];
}

export function getSupportIssueRouteTarget(category: SupportIssueCategory) {
  return ROUTE_TARGETS[category];
}

export function isSupportIssueCategoryAllowedForRole(category: SupportIssueCategory, roleScope: SupportIssueRoleScope) {
  return ROLE_CATEGORY_ALLOWLIST[roleScope].includes(category);
}

function normalizeSourceSurface(value: unknown): SupportIssueSourceSurface {
  if (value === "client_more" || value === "barber_more" || value === "owner_more") {
    return value;
  }

  return "unknown";
}

export function validateSupportIssueIntakeInput(input: SupportIssueIntakeInput, roleScope: SupportIssueRoleScope) {
  if (!isSupportIssueCategory(input.category)) {
    throw new SupportIssueIntakeError("Choose the support category that best matches this request.", 400, "invalid_category");
  }

  if (!isSupportIssueCategoryAllowedForRole(input.category, roleScope)) {
    throw new SupportIssueIntakeError("This support category is not available for this account role.", 403, "category_not_allowed_for_role");
  }

  if (!isSupportIssueSeverity(input.severity)) {
    throw new SupportIssueIntakeError("Choose a support priority.", 400, "invalid_severity");
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!description) {
    throw new SupportIssueIntakeError("Describe what happened before submitting support.", 400, "description_required");
  }

  if (description.length < 10) {
    throw new SupportIssueIntakeError("Add a little more detail so support can understand the issue.", 400, "description_too_short");
  }

  if (description.length > 1200) {
    throw new SupportIssueIntakeError("Keep the support description under 1,200 characters.", 400, "description_too_long");
  }

  return {
    category: input.category,
    severity: input.severity,
    description,
    sourceSurface: normalizeSourceSurface(input.sourceSurface)
  };
}

function buildSupportIssueMessage(input: {
  category: SupportIssueCategory;
  severity: SupportIssueSeverity;
  description: string;
  roleScope: SupportIssueRoleScope;
  routeTarget: SupportIssueRouteTarget;
}) {
  const lines = [
    "Support intake received",
    `Category: ${getSupportIssueCategoryLabel(input.category)}`,
    `Priority: ${getSupportIssueSeverityLabel(input.severity)}`,
    `Account area: ${input.roleScope === "owner" ? "Shop Owner" : input.roleScope === "barber" ? "Barber" : "Client"}`,
    `Support lane: ${input.routeTarget.architectSummary}`,
    "",
    input.description
  ];

  if (input.category === "safety_or_trust_concern") {
    lines.splice(5, 0, SUPPORT_SAFETY_DISCLAIMER);
  }

  return lines.join("\n");
}

function mapMessagingError(error: MessagingServiceError) {
  return new SupportIssueIntakeError(error.message, error.status, error.code);
}

export async function submitSupportIssueIntake(user: UserAccount, input: SupportIssueIntakeInput): Promise<SupportIssueSubmissionResult> {
  const roleScope = resolveSupportIssueRoleScope(user.role);
  if (!roleScope) {
    throw new SupportIssueIntakeError("Support intake is available to Client, Barber, and Shop Owner accounts.", 403, "unsupported_role");
  }

  const parsed = validateSupportIssueIntakeInput(input, roleScope);
  const routeTarget = getSupportIssueRouteTarget(parsed.category);

  let threadId: string;
  let messageId: string;
  let receivedAt: string;

  try {
    const threadPayload = await createMessagingThread(user, { threadType: "support" });
    const supportThreadId = threadPayload.thread?.id;

    if (!supportThreadId) {
      throw new SupportIssueIntakeError("Support conversation could not be opened.", 500, "support_thread_missing");
    }

    threadId = supportThreadId;

    const messagePayload = await sendThreadMessage(user, threadId, {
      body: buildSupportIssueMessage({
        category: parsed.category,
        severity: parsed.severity,
        description: parsed.description,
        roleScope,
        routeTarget
      })
    });
    messageId = messagePayload.message.id;
    receivedAt = messagePayload.message.createdAt;
  } catch (error) {
    if (error instanceof MessagingServiceError) {
      throw mapMessagingError(error);
    }
    throw error;
  }

  const supabase = createSupabaseAdminClient();
  await recordRequiredPlatformEvent(supabase, {
    eventType: "support_issue_received",
    entityType: "support_issue",
    entityId: messageId,
    actorId: user.id,
    actorRole: user.role,
    source: "api",
    relatedIds: {
      threadId,
      messageId
    },
    payload: {
      category: parsed.category,
      severity: parsed.severity,
      roleScope,
      sourceSurface: parsed.sourceSurface,
      routeTarget,
      descriptionStoredInSupportThread: true
    },
    idempotencyKey: buildPlatformEventIdempotencyKey(["support_issue_received", messageId])
  });

  return {
    status: "received",
    category: parsed.category,
    categoryLabel: getSupportIssueCategoryLabel(parsed.category),
    severity: parsed.severity,
    roleScope,
    threadId,
    messageId,
    receivedAt,
    routeTarget,
    eventRecorded: true
  };
}
