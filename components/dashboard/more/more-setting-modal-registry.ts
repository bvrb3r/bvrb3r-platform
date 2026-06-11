"use client";

import type { MoreSectionRow } from "@/components/dashboard/more/more-components";

export type MoreSettingRoleScope = "client" | "barber" | "owner" | "shared";
export type MoreSettingMode = "editable" | "read_only" | "requirements" | "ledger" | "verification" | "legal" | "support";
export type MoreSettingPrivacyLevel = "public" | "private" | "financial" | "compliance";

export type MoreSettingField = {
  key: string;
  label: string;
  helper?: string;
  type: "text" | "textarea" | "toggle" | "select" | "multi_select" | "time_range" | "money" | "number" | "file" | "readonly" | "status" | "ledger_filter";
  value?: string | boolean | number | string[] | null;
  required?: boolean;
  editable?: boolean;
  private?: boolean;
  public?: boolean;
  options?: Array<{ label: string; value: string }>;
};

export type MoreSettingModalSpec = {
  key: string;
  roleScope: MoreSettingRoleScope;
  sectionKey: string;
  title: string;
  eyebrow: string;
  helper: string;
  mode: MoreSettingMode;
  statusLabel?: string;
  destinationLabel?: string;
  lockedReason?: string;
  requirements?: string[];
  fields?: MoreSettingField[];
  validations?: string[];
  permissions?: string[];
  dataSources?: string[];
  syncTargets?: string[];
  privacyLevel?: MoreSettingPrivacyLevel;
  loadAction?: string;
  saveAction?: string;
  resetAction?: string;
  auditEventName?: string;
  algorithmSignals?: string[];
  missingSavePath?: string;
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeTitle(row: MoreSectionRow) {
  return row.title.toLowerCase();
}

function inferMode(row: MoreSectionRow, roleScope: MoreSettingRoleScope): MoreSettingMode {
  const title = row.title.toLowerCase();
  const subtitle = row.subtitle.toLowerCase();

  if (title.includes("legal")) {
    return "legal";
  }

  if (title.includes("help") || title.includes("support")) {
    return "support";
  }

  if (title.includes("identity") || title.includes("license") || title.includes("business verification")) {
    return "verification";
  }

  if (title.includes("transactions") || title.includes("activity") || title.includes("performance")) {
    return "ledger";
  }

  if (
    title.includes("requirements") ||
    title.includes("creator status") ||
    title.includes("creator payouts") ||
    (roleScope === "client" && title.includes("stripe connect")) ||
    subtitle.includes("locked")
  ) {
    return "requirements";
  }

  if (title.includes("payouts") || title.includes("tax") || title.includes("stripe connect")) {
    return "read_only";
  }

  return "editable";
}

function privacyLevelFor(row: MoreSectionRow): MoreSettingPrivacyLevel {
  const title = row.title.toLowerCase();

  if (title.includes("wallet") || title.includes("billing") || title.includes("stripe") || title.includes("payout") || title.includes("transactions") || title.includes("tax") || title.includes("rewards")) {
    return "financial";
  }

  if (title.includes("verification") || title.includes("security") || title.includes("password") || title.includes("privacy") || title.includes("legal")) {
    return "compliance";
  }

  if (title.includes("profile") || title.includes("culture") || title.includes("content")) {
    return "public";
  }

  return "private";
}

function requirementsFor(row: MoreSectionRow, roleScope: MoreSettingRoleScope) {
  const title = normalizeTitle(row);

  if (title.includes("creator") || title.includes("stripe connect")) {
    return [
      "Verified account",
      "Clean account status",
      "Wallet ready",
      "Loyalty history",
      "Qualifying auto-book or booking activity",
      "Creator or Culture approval"
    ];
  }

  if (title.includes("identity")) {
    return roleScope === "client"
      ? ["Creator payout eligibility started", "Government ID status", "Account ownership proof", "Verification review"]
      : ["Government ID status", "Account ownership proof", "Verification review"];
  }

  if (title.includes("license")) {
    return ["Barber license upload", "License state", "Review status"];
  }

  if (title.includes("business verification")) {
    return ["Shop license", "LLC or business document", "EIN or tax details", "Required uploads"];
  }

  return [];
}

function fieldsFor(row: MoreSectionRow, roleScope: MoreSettingRoleScope): MoreSettingField[] {
  const title = normalizeTitle(row);
  const status = row.status ?? "Current account state";

  if (title.includes("notifications")) {
    return [
      { key: "in_app_enabled", label: "In-app alerts", helper: "Messages, account notices, and role updates inside BVRB3R.", type: "toggle", value: true, editable: false, private: true },
      { key: "sms_enabled", label: "SMS updates", helper: "Booking, payout, support, and reminder texts only when consent is active.", type: "toggle", value: false, editable: false, private: true },
      { key: "email_enabled", label: "Email updates", helper: "Receipts, account notices, and role-safe operational email.", type: "toggle", value: true, editable: false, private: true },
      { key: "quiet_hours", label: "Quiet hours", helper: "Automation must respect this window before outreach.", type: "time_range", value: "Not configured", editable: false, private: true }
    ];
  }

  if (title.includes("preferences")) {
    return [
      { key: "default_view", label: "Default dashboard behavior", helper: "Controls how this role lands in BVRB3R.", type: "select", value: "Role default", editable: false, private: true, options: [{ label: "Role default", value: "role_default" }] },
      { key: "preferred_contact_channel", label: "Preferred contact channel", helper: "Used by support and app automation when consent allows outreach.", type: "select", value: "In-app first", editable: false, private: true, options: [{ label: "In-app first", value: "in_app" }] },
      { key: "automation_consent", label: "Useful suggestions", helper: "Allows role-safe reminders and next-best-action prompts.", type: "toggle", value: false, editable: false, private: true }
    ];
  }

  if (roleScope === "owner" && (title.includes("booth rent") || title.includes("commission") || title.includes("fees"))) {
    return [
      { key: "default_booth_rent_amount", label: "Default booth rent amount", helper: "Shop-level default charged to booth-rent barbers when that operating model is enabled.", type: "money", value: 0, editable: false, private: true },
      { key: "booth_rent_frequency", label: "Booth rent frequency", helper: "Allowed values should be daily, weekly, or monthly once compensation persistence is wired.", type: "select", value: "Not configured", editable: false, private: true, options: [{ label: "Not configured", value: "not_configured" }] },
      { key: "barber_commission_percent", label: "Barber commission percent", helper: "Must pair with shop commission percent to equal 100 when fixed commission is enabled.", type: "number", value: 0, editable: false, private: true },
      { key: "shop_commission_percent", label: "Shop commission percent", helper: "Must pair with barber commission percent to equal 100 when fixed commission is enabled.", type: "number", value: 0, editable: false, private: true },
      { key: "commission_cap", label: "Commission cap", helper: "Optional cap if supported by the compensation rules table/service.", type: "money", value: "Not supported yet", editable: false, private: true },
      { key: "platform_fee_display", label: "Platform fee display", helper: "Read-only platform fees must come from the Money/fintech source of truth.", type: "readonly", value: "Read-only", editable: false, private: true },
      { key: "per_barber_overrides", label: "Per-barber override summary", helper: "Relationship-specific overrides belong on shop_barber_relationships/staff relationship records when available.", type: "readonly", value: "No canonical override editor wired", editable: false, private: true }
    ];
  }

  if (title.includes("saved") || title.includes("favorites")) {
    if (roleScope === "barber") {
      return [
        { key: "saved_clients", label: "Saved clients", helper: "Private saved client connections for follow-up, notes, and future relationship signals.", type: "readonly", value: "Canonical barber saved-client graph required.", editable: false, private: true },
        { key: "saved_marketplace_entities", label: "Saved marketplace items", helper: "Saved barbers, shops, styles, services, and platform items for discovery and marketplace recommendations.", type: "readonly", value: "Canonical barber favorites graph required.", editable: false, private: true },
        { key: "follow_visibility", label: "Follow visibility", helper: "Follows must respect privacy controls, blocks, mutes, and reports before becoming public signals.", type: "readonly", value: "Private by default", editable: false, private: true }
      ];
    }

    if (roleScope === "owner") {
      return [
        { key: "saved_barbers", label: "Saved barbers and team prospects", helper: "Private owner saves for recruiting, team planning, and future shop relationship signals.", type: "readonly", value: "Canonical owner engagement graph required.", editable: false, private: true },
        { key: "saved_marketplace_entities", label: "Saved shops, clients, styles, services, and platform items", helper: "Private saved items for owner discovery, marketplace, and operations recommendations.", type: "readonly", value: "Canonical owner favorites graph required.", editable: false, private: true },
        { key: "follow_visibility", label: "Follow visibility", helper: "Public follow/message actions must add block, mute, report, and privacy controls before launch.", type: "readonly", value: "Private by default", editable: false, private: true }
      ];
    }

    return [
      { key: "saved_barbers", label: "Saved barbers", helper: "Manage preferred barbers and default booking choices.", type: "readonly", value: "Saved items load from client favorites.", editable: false, private: true },
      { key: "saved_shops", label: "Saved shops", helper: "Manage preferred shops and location defaults.", type: "readonly", value: "Saved items load from client favorites.", editable: false, private: true },
      { key: "saved_styles_items", label: "Saved styles and platform items", helper: "Private discovery and Culture saves for future recommendations.", type: "readonly", value: "Private by default", editable: false, private: true },
      { key: "default_saved_item", label: "Default favorite", helper: "Used by search, booking, and reminders when configured.", type: "readonly", value: "Not configured in this modal yet.", editable: false, private: true }
    ];
  }

  if (title.includes("culture profile")) {
    return [
      { key: "profile_visibility", label: "Culture profile visibility", helper: "Public creator profile visibility.", type: "select", value: "Current public profile setting", editable: false, public: true, options: [{ label: "Current public profile setting", value: "current" }] },
      { key: "creator_bio", label: "Creator bio", helper: "Public-safe bio shown in Culture when supported.", type: "textarea", value: "Managed by the public profile editor until the canonical modal save action is wired.", editable: false, public: true },
      { key: "interests", label: "Interests", helper: "Public-safe Culture interests and categories.", type: "multi_select", value: ["Current public profile categories"], editable: false, public: true }
    ];
  }

  if (title.includes("content settings")) {
    return [
      { key: "default_post_visibility", label: "Default post visibility", helper: "Controls who can see new Culture posts.", type: "select", value: "Profile default", editable: false, public: true, options: [{ label: "Profile default", value: "default" }] },
      { key: "comments_allowed", label: "Allow comments", helper: "Moderation setting for creator posts.", type: "toggle", value: false, editable: false, public: true },
      { key: "sharing_allowed", label: "Allow sharing", helper: "Controls whether posts can be shared when posting is available.", type: "toggle", value: false, editable: false, public: true }
    ];
  }

  if (title.includes("wallet") || title.includes("billing")) {
    return [
      { key: "default_payment_method", label: "Default payment method", helper: "Tokenized card or billing method. Raw card numbers never render here.", type: "readonly", value: row.needsAction ? "No default payment method saved" : "Default billing method on file", editable: false, private: true },
      { key: "billing_scope", label: "Billing scope", helper: row.subtitle, type: "readonly", value: roleScope === "client" ? "Bookings, auto-booking, subscriptions, tools, ads, and promotions" : roleScope === "barber" ? "Bookings, subscriptions, and tools" : "Shop subscriptions, tools, ads, and promotions", editable: false, private: true }
    ];
  }

  if (title.includes("stripe connect")) {
    return [
      { key: "connect_status", label: "Connect status", helper: "Payout onboarding and bank readiness.", type: "status", value: status, editable: false, private: true },
      { key: "connect_access", label: "Connect access", helper: roleScope === "client" ? "Creator-only. Locked until creator payout eligibility unlocks." : "Managed through the existing Stripe Connect onboarding/status flow.", type: "readonly", value: roleScope === "client" ? "Creator payout gate required" : "Available in payout workspace", editable: false, private: true }
    ];
  }

  if (title.includes("payout")) {
    return [
      { key: "payout_status", label: "Payout status", helper: "Role payout readiness and history.", type: "status", value: status, editable: false, private: true },
      { key: "payout_scope", label: "Payout scope", helper: row.subtitle, type: "readonly", value: row.subtitle, editable: false, private: true }
    ];
  }

  if (title.includes("rewards")) {
    return [
      { key: "points", label: "Points and credits", helper: "Current points, credits, loyalty progress, and referrals.", type: "readonly", value: "Loaded from rewards and points ledger.", editable: false, private: true },
      { key: "referral_preferences", label: "Referral preferences", helper: "Invite and referral behavior when rewards settings are available.", type: "readonly", value: "Managed by rewards/referrals workspace.", editable: false, private: true }
    ];
  }

  if (title.includes("transactions") || title.includes("activity") || title.includes("performance")) {
    return [
      { key: "ledger_filter", label: "View filter", helper: "This modal can show the ledger/report scope without exposing raw IDs.", type: "ledger_filter", value: "All activity", editable: false, private: true },
      { key: "reporting_scope", label: "Reporting scope", helper: row.subtitle, type: "readonly", value: "Real metrics only. No placeholder metrics are generated.", editable: false, private: true }
    ];
  }

  if (title.includes("tax")) {
    return [
      { key: "tax_status", label: "Tax document status", helper: "Tax forms and documents tied to payout eligibility.", type: "status", value: status, editable: false, private: true },
      { key: "tax_ids_hidden", label: "Private tax data", helper: "Raw tax identifiers are never rendered in this modal.", type: "readonly", value: "Protected", editable: false, private: true }
    ];
  }

  if (title.includes("identity") || title.includes("license") || title.includes("business verification")) {
    return [
      { key: "verification_status", label: "Verification status", helper: row.subtitle, type: "status", value: status, editable: false, private: true },
      { key: "document_upload", label: "Document upload", helper: "Uploads must use the existing verification document flow.", type: "file", value: "Managed by verification workflow", editable: false, private: true }
    ];
  }

  if (title.includes("password") || title.includes("account security")) {
    return [
      { key: "email_status", label: "Email verification", helper: "Email login and account recovery state.", type: "status", value: title.includes("account security") ? status : "Use current account verification state", editable: false, private: true },
      { key: "phone_status", label: "Phone verification", helper: "Phone login, support, and booking update state.", type: "status", value: "Use current account verification state", editable: false, private: true },
      { key: "sessions", label: "Device/session protection", helper: "Session management must stay private.", type: "readonly", value: "Protected", editable: false, private: true }
    ];
  }

  if (title.includes("privacy")) {
    return [
      { key: "public_visibility", label: "Public visibility", helper: "Controls profile/contact visibility by role.", type: "select", value: "Role-safe default", editable: false, public: true, options: [{ label: "Role-safe default", value: "role_safe" }] },
      { key: "data_use", label: "Data use preferences", helper: "Booking, rewards, reminders, discovery, and communication visibility.", type: "multi_select", value: ["Booking data", "Reminder preferences"], editable: false, private: true }
    ];
  }

  if (title.includes("legal")) {
    return [
      { key: "agreements", label: "Agreements", helper: row.subtitle, type: "readonly", value: "Current legal acknowledgments load from legal acceptance records.", editable: false, private: true },
      { key: "required_acknowledgments", label: "Required acknowledgments", helper: "Only unresolved required agreements should request action.", type: "status", value: status, editable: false, private: true }
    ];
  }

  if (title.includes("help") || title.includes("support")) {
    return [
      { key: "support_scope", label: "Support scope", helper: row.subtitle, type: "readonly", value: title.includes("contact") ? "Support conversation" : "Help resources", editable: false, private: true },
      { key: "privacy", label: "Private account details", helper: "Support can use authorized account context without exposing it publicly.", type: "readonly", value: "Protected", editable: false, private: true }
    ];
  }

  return [
    { key: "current_state", label: row.title, helper: row.subtitle, type: "readonly", value: status, editable: false, private: true }
  ];
}

function dataSourcesFor(row: MoreSectionRow, roleScope: MoreSettingRoleScope): string[] {
  const title = normalizeTitle(row);
  const base = ["profiles"];

  if (roleScope === "owner" && (title.includes("booth rent") || title.includes("commission") || title.includes("fees"))) {
    return [...base, "compensation_rules or canonical shop compensation settings", "shop_barber_relationships/staff relationship overrides", "fintech platform fee configuration"];
  }

  if (title.includes("notifications") || title.includes("preferences") || title.includes("privacy")) {
    return [...base, "role app preferences", "notification preferences", "automation preferences"];
  }

  if (title.includes("saved") || title.includes("favorites")) {
    return [...base, "role engagement graph", "favorites/saves/follows records", "privacy preferences", "block/mute/report records before public follow or message actions"];
  }

  if (title.includes("creator") || title.includes("culture") || title.includes("content")) {
    return [...base, "client creator eligibility", "Culture profile settings", "creator/content preferences"];
  }

  if (title.includes("wallet") || title.includes("stripe") || title.includes("payout") || title.includes("transactions") || title.includes("tax") || title.includes("rewards")) {
    return [...base, "payment methods", "payments", "payment routing records", "Stripe Connect status", "rewards/points ledger", "tax document status"];
  }

  if (title.includes("verification") || title.includes("security") || title.includes("password") || title.includes("legal")) {
    return [...base, "verification records", "legal acknowledgments", "account contact verification"];
  }

  if (roleScope === "barber") {
    return [...base, "barbers", "services", "availability rules", "shop_barber_relationships"];
  }

  if (roleScope === "owner") {
    return [...base, "shops", "shop policies", "team roles", "compensation rules"];
  }

  return [...base, "clients"];
}

function syncTargetsFor(row: MoreSectionRow, roleScope: MoreSettingRoleScope): string[] {
  const title = normalizeTitle(row);

  if (roleScope === "owner" && (title.includes("booth rent") || title.includes("commission") || title.includes("fees"))) {
    return ["Owner More row state", "Owner Money", "barber shop relationship summaries", "future payout routing assumptions", "team relationship summaries"];
  }

  if (title.includes("saved") || title.includes("favorites")) {
    return ["More row state", "private saved/favorite graph", "discovery signals", "marketplace signals", "Culture signals", "messaging-safe relationship signals"];
  }

  if (title.includes("notifications") || title.includes("preferences")) {
    return ["More row state", "automation consent signals", "notification delivery rules"];
  }

  if (title.includes("privacy")) {
    return ["More row state", "public profile visibility", "search/discovery visibility", "messages participant privacy"];
  }

  if (title.includes("culture") || title.includes("content") || title.includes("creator")) {
    return ["Client More", "Culture profile", "creator eligibility gates", "creator payout readiness"];
  }

  if (title.includes("wallet") || title.includes("stripe") || title.includes("payout") || title.includes("transactions") || title.includes("tax") || title.includes("rewards")) {
    return ["More row state", "wallet/billing surfaces", "money/payout readiness", "private financial ledger"];
  }

  if (title.includes("verification") || title.includes("security") || title.includes("password") || title.includes("legal")) {
    return ["More row state", "trust gates", "account security posture", "private compliance records"];
  }

  if (roleScope === "barber") {
    return ["Barber More", "public barber profile", "booking/search", "kiosk eligibility"];
  }

  if (roleScope === "owner") {
    return ["Owner More", "shop profile", "team/shop operations", "kiosk eligibility"];
  }

  return ["Client More", "booking defaults", "search/discovery preferences"];
}

function validationsFor(row: MoreSectionRow): string[] {
  const title = normalizeTitle(row);

  if (title.includes("booth rent") || title.includes("commission") || title.includes("fees")) {
    return ["Owner must own the shop", "Booth rent amount must be non-negative", "Frequency must be daily, weekly, or monthly", "Barber percent plus shop percent must equal 100", "Platform fees stay read-only"];
  }

  if (title.includes("notifications")) {
    return ["Channel consent must be explicit", "Quiet hours must be valid", "Automated outreach must respect frequency caps"];
  }

  if (title.includes("wallet") || title.includes("stripe") || title.includes("payout")) {
    return ["Never collect raw card or bank data", "Use tokenized provider flows only", "Do not expose Stripe/payment/payout IDs"];
  }

  if (title.includes("verification") || title.includes("tax")) {
    return ["Documents stay private", "Raw government/tax identifiers never render", "Status must come from verification records"];
  }

  if (title.includes("privacy")) {
    return ["Private phone/email stay private", "Public profile visibility must be role-safe", "Consent changes must sync before outreach"];
  }

  if (title.includes("saved") || title.includes("favorites")) {
    return ["Favorites and saves remain private by default", "Follows require privacy controls before public display", "No phone, email, payment, payout, verification, or private identity data can sync to public graph surfaces"];
  }

  return ["Validate role permissions", "Save only to the canonical source of truth", "Refresh More state after save"];
}

function permissionsFor(roleScope: MoreSettingRoleScope): string[] {
  if (roleScope === "barber") {
    return ["Signed-in barber account", "Owns barber profile", "Role-safe business setting"];
  }

  if (roleScope === "owner") {
    return ["Signed-in shop owner account", "Owns or administers shop", "Role-safe owner setting"];
  }

  if (roleScope === "client") {
    return ["Signed-in client account", "Owns client profile", "Role-safe client setting"];
  }

  return ["Signed-in account", "Role-safe setting"];
}

function auditEventFor(row: MoreSectionRow) {
  return `${slugify(row.title).replace(/-/g, "_")}_setting_reviewed`;
}

function algorithmSignalsFor(row: MoreSectionRow): string[] | undefined {
  const title = normalizeTitle(row);

  if (title.includes("notifications")) {
    return ["notification_preferences", "quiet_hours", "outreach_consent"];
  }

  if (title.includes("preferences") || title.includes("saved") || title.includes("favorites")) {
    return ["booking_defaults", "favorite_entities", "next_best_action_preferences"];
  }

  if (title.includes("creator") || title.includes("culture") || title.includes("content")) {
    return ["creator_eligibility", "culture_profile_visibility", "creator_safety_status"];
  }

  if (title.includes("wallet") || title.includes("payout") || title.includes("stripe")) {
    return ["financial_readiness", "payout_eligibility"];
  }

  return undefined;
}

function missingSavePathFor(row: MoreSectionRow, mode: MoreSettingMode) {
  if (mode !== "editable") {
    return undefined;
  }

  const title = normalizeTitle(row);

  if (title.includes("booth rent") || title.includes("commission") || title.includes("fees")) {
    return "Wire owner compensation settings to compensation_rules or the canonical shop relationship compensation service before enabling Save Changes. Relationship-specific overrides should persist through shop_barber_relationships/staff relationship records, not local UI state.";
  }

  if (title.includes("notifications")) {
    return "Wire this modal to the existing notification_preferences/profile notification service before enabling Save Changes. Until then, outreach consent, quiet hours, and channel preferences cannot be saved from this popup.";
  }

  if (title.includes("preferences")) {
    return "Wire this modal to a canonical role app preferences source such as client_preferences or user_app_preferences before enabling Save Changes. Until then, dashboard defaults and algorithm signals cannot be saved from this popup.";
  }

  if (title.includes("saved") || title.includes("favorites")) {
    return "Wire this modal to the canonical role engagement graph for private saves, favorites, follows, likes/reactions, and privacy-controlled relationship signals before enabling Save Changes. Until then, saved items cannot be changed from this popup without risking fake local-only state.";
  }

  return `Wire ${slugify(row.title).replace(/-/g, "_")}_settings_save to the existing role-safe service before enabling Save Changes here.`;
}

export function resolveMoreSettingModalSpec({
  row,
  roleScope = "shared",
  sectionTitle
}: {
  row: MoreSectionRow;
  roleScope?: MoreSettingRoleScope;
  sectionTitle?: string;
}): MoreSettingModalSpec {
  const mode = inferMode(row, roleScope);
  const sectionKey = slugify(sectionTitle ?? "more");
  const fields = fieldsFor(row, roleScope);

  return {
    key: `${roleScope}-${sectionKey}-${slugify(row.title)}`,
    roleScope,
    sectionKey,
    title: row.title,
    eyebrow: sectionTitle ?? "More settings",
    helper: row.subtitle,
    mode,
    statusLabel: row.status,
    destinationLabel: row.href ? "Open the full workspace only for deeper workflows; this modal shows the current settings contract first." : undefined,
    lockedReason: mode === "requirements" ? "This setting needs requirements or setup before changes can be saved." : undefined,
    requirements: requirementsFor(row, roleScope),
    fields,
    validations: validationsFor(row),
    permissions: permissionsFor(roleScope),
    dataSources: dataSourcesFor(row, roleScope),
    syncTargets: syncTargetsFor(row, roleScope),
    privacyLevel: privacyLevelFor(row),
    loadAction: `${roleScope}_${sectionKey}_${slugify(row.title).replace(/-/g, "_")}_load`,
    saveAction: undefined,
    auditEventName: auditEventFor(row),
    algorithmSignals: algorithmSignalsFor(row),
    missingSavePath: missingSavePathFor(row, mode)
  };
}
