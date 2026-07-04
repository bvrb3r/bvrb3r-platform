import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import type { Role } from "@/types/domain";

export type NotificationConsentRole = "client" | "barber" | "owner";

export type NotificationCategoryId =
  | "booking_updates"
  | "appointment_reminders"
  | "messages"
  | "rebook_prompts"
  | "payment_or_receipt_updates"
  | "shop_or_queue_updates"
  | "product_or_account_updates"
  | "culture_updates"
  | "support_or_issue_updates";

export type NotificationPreferenceField =
  | "in_app_enabled"
  | "sms_enabled"
  | "email_enabled"
  | "push_enabled"
  | "message_alerts_enabled"
  | "booking_alerts_enabled"
  | "payout_alerts_enabled"
  | "creator_alerts_enabled"
  | "rewards_alerts_enabled";

export type NotificationConsentControl = {
  id: string;
  categoryId?: NotificationCategoryId;
  label: string;
  helper: string;
  value: boolean | string;
  preferenceField?: NotificationPreferenceField;
  control: "toggle" | "display";
  posture: "functional" | "not_configured" | "controlled_elsewhere" | "infrastructure_missing";
  required?: boolean;
};

export type NotificationConsentModel = {
  role: NotificationConsentRole;
  title: string;
  summary: string;
  controls: NotificationConsentControl[];
  channelControls: NotificationConsentControl[];
  categoryControls: NotificationConsentControl[];
  infrastructureNotes: NotificationConsentControl[];
};

const sharedChannelControls: NotificationConsentControl[] = [
  {
    id: "channel-in-app",
    label: "In-app alerts",
    helper: "Account notices and role updates inside BVRB3R. This uses the existing notification preference save path.",
    value: true,
    preferenceField: "in_app_enabled",
    control: "toggle",
    posture: "functional"
  },
  {
    id: "channel-sms",
    label: "SMS updates",
    helper: "Only saved as consent posture. SMS delivery is not configured yet.",
    value: false,
    preferenceField: "sms_enabled",
    control: "toggle",
    posture: "functional"
  },
  {
    id: "channel-email",
    label: "Email updates",
    helper: "Only saved as consent posture. Email delivery is not configured yet.",
    value: true,
    preferenceField: "email_enabled",
    control: "toggle",
    posture: "functional"
  },
  {
    id: "channel-push",
    label: "Push reminders",
    helper: "Device registration exists, but consent alone does not send notifications.",
    value: false,
    preferenceField: "push_enabled",
    control: "toggle",
    posture: "functional"
  }
];

const infrastructureNotes: NotificationConsentControl[] = [
  {
    id: "infrastructure-push",
    label: "Push delivery posture",
    helper: "Device registration is connected through the mobile push subscription foundation; delivery still depends on runtime/provider readiness.",
    value: "Device registration connected; delivery not guaranteed from this setting.",
    control: "display",
    posture: "controlled_elsewhere"
  },
  {
    id: "infrastructure-email",
    label: "Email delivery posture",
    helper: "No role notification email delivery control is connected to this settings surface.",
    value: "Not configured yet",
    control: "display",
    posture: "infrastructure_missing"
  },
  {
    id: "infrastructure-sms",
    label: "SMS delivery posture",
    helper: "No SMS delivery provider control is connected to this settings surface.",
    value: "Not configured yet",
    control: "display",
    posture: "infrastructure_missing"
  }
];

const roleCategoryControls: Record<NotificationConsentRole, NotificationConsentControl[]> = {
  client: [
    {
      id: "client-booking-updates",
      categoryId: "booking_updates",
      label: "Booking confirmations and updates",
      helper: "Booking confirmations, changes, and client appointment status updates.",
      value: true,
      preferenceField: "booking_alerts_enabled",
      control: "toggle",
      posture: "functional",
      required: true
    },
    {
      id: "client-appointment-reminders",
      categoryId: "appointment_reminders",
      label: "Appointment reminders",
      helper: "Reminder scheduling uses booking alert consent until reminder-specific persistence exists.",
      value: "Controlled by booking update consent",
      control: "display",
      posture: "controlled_elsewhere",
      required: true
    },
    {
      id: "client-messages",
      categoryId: "messages",
      label: "Barber and shop messages",
      helper: "Conversation and support message alerts.",
      value: true,
      preferenceField: "message_alerts_enabled",
      control: "toggle",
      posture: "functional",
      required: true
    },
    {
      id: "client-rebook-prompts",
      categoryId: "rebook_prompts",
      label: "Rebook reminders",
      helper: "Client rebooking prompts are controlled by the Preferences card, not this notification save action.",
      value: "Controlled by Preferences",
      control: "display",
      posture: "controlled_elsewhere"
    },
    {
      id: "client-payments-receipts",
      categoryId: "payment_or_receipt_updates",
      label: "Receipt and payment updates",
      helper: "Receipt delivery is tied to payment records. A separate receipt notification category is not configured yet.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured",
      required: true
    },
    {
      id: "client-favorite-updates",
      categoryId: "shop_or_queue_updates",
      label: "Favorite barber or shop updates",
      helper: "Favorite and shop update delivery needs follow/save-specific preference persistence before it can be toggled.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "client-product-account",
      categoryId: "product_or_account_updates",
      label: "Product and account updates",
      helper: "Critical account notices stay operational; product update marketing requires separate consent proof.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "client-culture-updates",
      categoryId: "culture_updates",
      label: "Culture updates",
      helper: "Culture and creator eligibility notices for client creator tools.",
      value: false,
      preferenceField: "creator_alerts_enabled",
      control: "toggle",
      posture: "functional"
    },
    {
      id: "client-support-issue-updates",
      categoryId: "support_or_issue_updates",
      label: "Support and issue updates",
      helper: "Support conversations currently follow message alert consent.",
      value: "Controlled by message alert consent",
      control: "display",
      posture: "controlled_elsewhere",
      required: true
    }
  ],
  barber: [
    {
      id: "barber-booking-updates",
      categoryId: "booking_updates",
      label: "New bookings and schedule changes",
      helper: "New bookings, cancellations, reschedules, and schedule changes.",
      value: true,
      preferenceField: "booking_alerts_enabled",
      control: "toggle",
      posture: "functional",
      required: true
    },
    {
      id: "barber-appointment-reminders",
      categoryId: "appointment_reminders",
      label: "Appointment reminders",
      helper: "Reminder delivery uses booking alert consent until reminder-specific persistence exists.",
      value: "Controlled by booking alert consent",
      control: "display",
      posture: "controlled_elsewhere",
      required: true
    },
    {
      id: "barber-messages",
      categoryId: "messages",
      label: "Client messages",
      helper: "Client, support, and shop relationship message alerts.",
      value: true,
      preferenceField: "message_alerts_enabled",
      control: "toggle",
      posture: "functional",
      required: true
    },
    {
      id: "barber-rebook-prompts",
      categoryId: "rebook_prompts",
      label: "Client rebook prompts",
      helper: "Client rebook prompts are controlled by the Preferences card.",
      value: "Controlled by Preferences",
      control: "display",
      posture: "controlled_elsewhere"
    },
    {
      id: "barber-payment-posture",
      categoryId: "payment_or_receipt_updates",
      label: "Payout and money posture",
      helper: "Private payout readiness and money movement notices.",
      value: true,
      preferenceField: "payout_alerts_enabled",
      control: "toggle",
      posture: "functional",
      required: true
    },
    {
      id: "barber-queue-updates",
      categoryId: "shop_or_queue_updates",
      label: "Queue and walk-in updates",
      helper: "Queue and walk-in delivery needs queue-specific persistence before it can be toggled.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "barber-product-account",
      categoryId: "product_or_account_updates",
      label: "Product and account updates",
      helper: "Critical account notices stay operational; product update marketing requires separate consent proof.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "barber-culture-updates",
      categoryId: "culture_updates",
      label: "Culture updates",
      helper: "Barber Culture updates need a dedicated preference before delivery can be controlled here.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "barber-support-issue-updates",
      categoryId: "support_or_issue_updates",
      label: "Support and issue updates",
      helper: "Support conversations currently follow message alert consent.",
      value: "Controlled by message alert consent",
      control: "display",
      posture: "controlled_elsewhere",
      required: true
    }
  ],
  owner: [
    {
      id: "owner-booking-updates",
      categoryId: "booking_updates",
      label: "Shop bookings and schedule changes",
      helper: "Shop booking updates, schedule changes, and operational booking notices.",
      value: true,
      preferenceField: "booking_alerts_enabled",
      control: "toggle",
      posture: "functional",
      required: true
    },
    {
      id: "owner-appointment-reminders",
      categoryId: "appointment_reminders",
      label: "Team appointment reminders",
      helper: "Reminder delivery uses booking alert consent until reminder-specific persistence exists.",
      value: "Controlled by booking alert consent",
      control: "display",
      posture: "controlled_elsewhere",
      required: true
    },
    {
      id: "owner-messages",
      categoryId: "messages",
      label: "Shop and team messages",
      helper: "Shop, team, client, and support message alerts.",
      value: true,
      preferenceField: "message_alerts_enabled",
      control: "toggle",
      posture: "functional",
      required: true
    },
    {
      id: "owner-rebook-prompts",
      categoryId: "rebook_prompts",
      label: "Client rebook prompts",
      helper: "Shop-level rebook automation needs a separate owner preference before it can be toggled.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "owner-money-posture",
      categoryId: "payment_or_receipt_updates",
      label: "Money posture alerts",
      helper: "Private shop payout readiness, business notices, and money movement updates.",
      value: true,
      preferenceField: "payout_alerts_enabled",
      control: "toggle",
      posture: "functional",
      required: true
    },
    {
      id: "owner-shop-queue",
      categoryId: "shop_or_queue_updates",
      label: "Kiosk, walk-in, and queue updates",
      helper: "Kiosk and queue delivery needs queue-specific persistence before it can be toggled.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "owner-product-account",
      categoryId: "product_or_account_updates",
      label: "Product and account updates",
      helper: "Critical account notices stay operational; product update marketing requires separate consent proof.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "owner-culture-updates",
      categoryId: "culture_updates",
      label: "Culture updates",
      helper: "Owner Culture updates need a dedicated preference before delivery can be controlled here.",
      value: "Not configured yet",
      control: "display",
      posture: "not_configured"
    },
    {
      id: "owner-support-issue-updates",
      categoryId: "support_or_issue_updates",
      label: "Support and issue updates",
      helper: "Support conversations currently follow message alert consent.",
      value: "Controlled by message alert consent",
      control: "display",
      posture: "controlled_elsewhere",
      required: true
    }
  ]
};

function uniqueControls(controls: NotificationConsentControl[]) {
  const seen = new Set<string>();
  return controls.filter((control) => {
    const key = control.preferenceField ?? control.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function resolveNotificationConsentRole(role: Role | string | null | undefined): NotificationConsentRole | null {
  if (isClientRole(role)) {
    return "client";
  }

  if (isBarberAccountRole(role)) {
    return "barber";
  }

  if (isShopOwnerRole(role) || role === "manager" || role === "front_desk") {
    return "owner";
  }

  return null;
}

export function getNotificationConsentModel(role: NotificationConsentRole): NotificationConsentModel {
  const categoryControls = roleCategoryControls[role];
  const title = role === "client" ? "Client notification consent" : role === "barber" ? "Barber notification consent" : "Shop owner notification consent";
  const summary = role === "client"
    ? "Client booking, messaging, receipt, rebook, Culture, and support notification posture."
    : role === "barber"
      ? "Barber booking, messaging, queue, payout posture, rebook, Culture, and support notification posture."
      : "Shop owner team, schedule, queue, money posture, messaging, Culture, and support notification posture.";

  return {
    role,
    title,
    summary,
    channelControls: sharedChannelControls,
    categoryControls,
    infrastructureNotes,
    controls: uniqueControls([...sharedChannelControls, ...categoryControls, ...infrastructureNotes])
  };
}
