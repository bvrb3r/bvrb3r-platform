import { describe, expect, it } from "vitest";
import { resolveMoreSettingModalSpec } from "@/components/dashboard/more/more-setting-modal-registry";
import { getNotificationConsentModel, resolveNotificationConsentRole } from "@/lib/notifications/consent";

describe("notification consent model", () => {
  it("maps canonical account roles to role-aware notification consent", () => {
    expect(resolveNotificationConsentRole("client_user")).toBe("client");
    expect(resolveNotificationConsentRole("barber_user")).toBe("barber");
    expect(resolveNotificationConsentRole("shop_owner_user")).toBe("owner");
    expect(resolveNotificationConsentRole("platform_admin")).toBeNull();
  });

  it("renders client notification categories without fake delivery toggles", () => {
    const model = getNotificationConsentModel("client");
    const categories = model.categoryControls.map((control) => control.categoryId);

    expect(categories).toEqual(expect.arrayContaining([
      "booking_updates",
      "appointment_reminders",
      "messages",
      "rebook_prompts",
      "payment_or_receipt_updates",
      "shop_or_queue_updates",
      "product_or_account_updates",
      "culture_updates",
      "support_or_issue_updates"
    ]));
    expect(model.categoryControls.find((control) => control.categoryId === "rebook_prompts")).toMatchObject({
      control: "display",
      posture: "controlled_elsewhere",
      value: "Controlled by Preferences"
    });
    expect(model.categoryControls.find((control) => control.categoryId === "payment_or_receipt_updates")).toMatchObject({
      control: "display",
      posture: "not_configured",
      value: "Not configured yet"
    });
    expect(model.categoryControls.find((control) => control.categoryId === "culture_updates")).toMatchObject({
      control: "toggle",
      preferenceField: "creator_alerts_enabled"
    });
  });

  it("uses read-only fields for display-only categories in the More modal contract", () => {
    const spec = resolveMoreSettingModalSpec({
      roleScope: "owner",
      sectionTitle: "BVRB3R App Settings",
      row: {
        title: "Notifications & Alerts",
        subtitle: "Messages, reminders, shop alerts, payout alerts, and business alerts"
      }
    });
    const fields = spec.fields ?? [];

    expect(spec.saveAction).toBe("update_notification_preferences");
    expect(spec.loadEndpoint).toBe("/api/settings/more?kind=notification-preferences");
    expect(fields.find((field) => field.label === "Kiosk, walk-in, and queue updates")).toMatchObject({
      type: "readonly",
      editable: false,
      value: "Not configured yet"
    });
    expect(fields.find((field) => field.label === "Money posture alerts")).toMatchObject({
      type: "toggle",
      key: "payout_alerts_enabled"
    });
    expect(fields.find((field) => field.label === "SMS delivery posture")).toMatchObject({
      type: "readonly",
      editable: false,
      value: "Not configured yet"
    });
  });

  it("keeps backend/provider names out of user-facing notification labels", () => {
    const labels = [
      ...getNotificationConsentModel("client").controls,
      ...getNotificationConsentModel("barber").controls,
      ...getNotificationConsentModel("owner").controls
    ].map((control) => control.label.toLowerCase());

    expect(labels.join(" ")).not.toContain("notification_preferences");
    expect(labels.join(" ")).not.toContain("push_subscriptions");
    expect(labels.join(" ")).not.toContain("native_push_tokens");
    expect(labels.join(" ")).not.toContain("resend");
    expect(labels.join(" ")).not.toContain("twilio");
  });
});
