import { createHash, randomBytes } from "node:crypto";
import type {
  AppointmentSource,
  ClientBridgeStage,
  KioskAppointmentSearchResult,
  PaymentOwner,
  QueueLifecycleState
} from "@/types/kiosk";

const SOURCE_LABELS: Record<AppointmentSource, string> = {
  bvrb3r_marketplace: "BVRB3R Marketplace",
  barber_booking_link: "Barber Booking Link",
  shop_booking_link: "Shop Booking Link",
  shop_kiosk: "Shop Kiosk",
  barber_kiosk: "Barber Kiosk",
  walk_in_queue: "Walk-In Queue",
  qr_code: "QR Code",
  rebook: "Rebook",
  favorite_barber: "Favorite Barber",
  referral: "Referral",
  waitlist: "Waitlist",
  chairfill: "ChairFill",
  message: "Message",
  culture_post: "Culture Post",
  shop_owner: "Shop Owner",
  barber_created: "Barber Created",
  booksy: "Booksy",
  square: "Square",
  thecut: "theCut",
  external_calendar: "External Calendar",
  manual_unpaid: "Manual Appointment"
};

const PAYMENT_OWNER_LABELS: Record<PaymentOwner, string> = {
  bvrb3r: "Payment managed by BVRB3R",
  booksy: "Payment managed by Booksy",
  square: "Payment managed by Square",
  thecut: "Payment managed by theCut",
  external_provider: "Payment managed by the original booking provider",
  none: "No payment is attached yet"
};

const EXTERNAL_SOURCES = new Set<AppointmentSource>(["booksy", "square", "thecut", "external_calendar"]);

export function appointmentSourceLabel(source: AppointmentSource) {
  return SOURCE_LABELS[source];
}

export function paymentOwnerLabel(owner: PaymentOwner) {
  return PAYMENT_OWNER_LABELS[owner];
}

export function isExternalAppointmentSource(source: AppointmentSource) {
  return EXTERNAL_SOURCES.has(source);
}

export function paymentOwnerForSource(source: AppointmentSource): PaymentOwner {
  if (source === "booksy") return "booksy";
  if (source === "square") return "square";
  if (source === "thecut") return "thecut";
  if (source === "external_calendar") return "external_provider";
  if (source === "manual_unpaid") return "none";
  return "bvrb3r";
}

export function normalizeAppointmentSource(value?: string | null): AppointmentSource {
  const source = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, AppointmentSource> = {
    bvrb3r: "bvrb3r_marketplace",
    marketplace: "bvrb3r_marketplace",
    client_marketplace: "bvrb3r_marketplace",
    barber_link: "barber_booking_link",
    booking_link: "barber_booking_link",
    shop_link: "shop_booking_link",
    kiosk: "shop_kiosk",
    walk_in: "walk_in_queue",
    walkin: "walk_in_queue",
    square_appointments: "square",
    the_cut: "thecut",
    calendar: "external_calendar",
    external: "external_calendar",
    manual: "manual_unpaid",
    front_desk: "shop_owner"
  };
  if (source in SOURCE_LABELS) return source as AppointmentSource;
  return aliases[source] ?? "manual_unpaid";
}

export function normalizePaymentOwner(value: unknown, source?: AppointmentSource): PaymentOwner {
  const owner = String(value ?? "").trim().toLowerCase();
  if (["bvrb3r", "booksy", "square", "thecut", "external_provider", "none"].includes(owner)) {
    return owner as PaymentOwner;
  }
  return paymentOwnerForSource(source ?? "manual_unpaid");
}

export function assertExternalMoneyIsolation(result: Pick<KioskAppointmentSearchResult, "source" | "paymentOwner">) {
  if (isExternalAppointmentSource(result.source) && result.paymentOwner === "bvrb3r") {
    throw new Error("External appointments cannot be assigned to BVRB3R payment ownership.");
  }
}

export function maskPhone(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `••• ••• ${digits.slice(-4)}`;
}

export function maskEmail(value?: string | null) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export function normalizePhone(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function normalizeEmail(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function contactFingerprint(input: { phone?: string | null; email?: string | null }) {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  if (!phone && !email) return null;
  return createHash("sha256").update(`${phone}|${email}`).digest("hex");
}

export function queryFingerprint(input: Record<string, unknown>) {
  const stable = Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 20);
}

export function createPublicReference(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function createSecureToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function queueStateFromStatus(value?: string | null): QueueLifecycleState {
  const status = String(value ?? "").toLowerCase();
  const map: Record<string, QueueLifecycleState> = {
    called: "almost_ready",
    assigned: "waiting",
    checked_in: "checked_in",
    in_service: "in_chair",
    service_started: "in_chair",
    service_completed: "awaiting_checkout",
    resolved: "completed",
    cancelled: "canceled",
    canceled: "canceled",
    no_show: "no_show"
  };
  if (["created","waiting","almost_ready","ready","checked_in","in_chair","awaiting_checkout","completed","canceled","no_show","removed"].includes(status)) {
    return status as QueueLifecycleState;
  }
  return map[status] ?? "waiting";
}

export function clientBridgeStageFromStatus(value?: string | null): ClientBridgeStage | null {
  const status = String(value ?? "").toLowerCase();
  const map: Record<string, ClientBridgeStage> = {
    offered: "invitation_offered",
    sent: "invitation_offered",
    delivered: "invitation_offered",
    opened: "invitation_opened",
    identity_verified: "identity_verified",
    activated: "account_activated",
    first_native_booking: "first_native_booking",
    converted: "converted",
    retained: "retained"
  };
  return map[status] ?? null;
}

export function sourceAllowsGuestCheckIn(source: AppointmentSource) {
  return isExternalAppointmentSource(source) || source === "manual_unpaid";
}

export function sourceIsAutoBoothEligible(source: AppointmentSource, paymentOwner: PaymentOwner) {
  return !isExternalAppointmentSource(source) && paymentOwner === "bvrb3r";
}
