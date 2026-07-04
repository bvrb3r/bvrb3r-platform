import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccount } from "@/types/domain";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => null
}));

import {
  __resetDemoSettingsStateForTests,
  favoriteTarget,
  followTarget,
  listActivity,
  listNotificationPreferences,
  listSavedFavorites,
  recordActivityEvent,
  saveTarget,
  unfavoriteTarget,
  unfollowTarget,
  unsaveTarget,
  updateAppPreferences,
  updateNotificationPreferences,
  updatePrivacyPreferences
} from "@/lib/settings/service";

const clientUser: UserAccount = {
  id: "profile-client-settings",
  role: "client_user",
  email: "client-settings@bvrb3r.demo",
  password: "",
  name: "Client Settings",
  title: "Client",
  locationIds: [],
  clientId: "client-settings"
};

const barberUser: UserAccount = {
  id: "profile-barber-settings",
  role: "barber_user",
  email: "barber-settings@bvrb3r.demo",
  password: "",
  name: "Barber Settings",
  title: "Barber",
  locationIds: [],
  barberId: "barber-settings"
};

const ownerUser: UserAccount = {
  id: "profile-owner-settings",
  role: "shop_owner_user",
  email: "owner-settings@bvrb3r.demo",
  password: "",
  name: "Owner Settings",
  title: "Owner",
  locationIds: ["shop-settings"],
  ownedShopId: "shop-settings"
};

describe("canonical More settings service", () => {
  beforeEach(() => {
    __resetDemoSettingsStateForTests();
  });

  it("saves notification preferences and records activity", async () => {
    const result = await updateNotificationPreferences(clientUser, {
      sms_enabled: true,
      push_enabled: true,
      quiet_hours_start: "21:00",
      quiet_hours_end: "08:00",
      preferred_contact_channel: "sms"
    });

    expect(result.notificationPreferences).toMatchObject({
      smsEnabled: true,
      pushEnabled: true,
      quietHoursStart: "21:00",
      quietHoursEnd: "08:00",
      preferredContactChannel: "sms"
    });

    const activity = await listActivity(clientUser);
    expect(activity.events).toHaveLength(1);
    expect(activity.events[0]).toMatchObject({ eventType: "notification_preferences_updated" });
  });

  it("preserves hidden quiet-hour notification values when visible fields are saved", async () => {
    await updateNotificationPreferences(clientUser, {
      sms_enabled: true,
      quiet_hours_start: "21:00",
      quiet_hours_end: "08:00",
      preferred_contact_channel: "sms"
    });

    const result = await updateNotificationPreferences(clientUser, {
      sms_enabled: false
    });

    expect(result.notificationPreferences).toMatchObject({
      smsEnabled: false,
      quietHoursStart: "21:00",
      quietHoursEnd: "08:00",
      preferredContactChannel: "sms"
    });
  });

  it("loads current notification preference truth without raw backend labels", async () => {
    await updateNotificationPreferences(clientUser, {
      sms_enabled: true,
      booking_alerts_enabled: false,
      creator_alerts_enabled: true
    });

    const result = await listNotificationPreferences(clientUser);

    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "SMS updates", detail: "On" }),
      expect.objectContaining({ title: "Booking alerts", detail: "Off" }),
      expect.objectContaining({ title: "Culture updates", detail: "On" })
    ]));
    expect(JSON.stringify(result.items)).not.toContain("notification_preferences");
    expect(JSON.stringify(result.items)).not.toContain("push_subscriptions");
  });

  it("does not invent consent when notification preferences have not been saved", async () => {
    const result = await listNotificationPreferences(clientUser);

    expect(result.notificationPreferences).toBeNull();
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "SMS updates", detail: "Not configured yet" }),
      expect.objectContaining({ title: "Booking alerts", detail: "Not configured yet" })
    ]));
  });

  it("saves role-specific app preferences and privacy preferences", async () => {
    const app = await updateAppPreferences(barberUser, {
      default_view: "activity_first",
      preferred_contact_channel: "email",
      rebooking_reminders_enabled: true,
      auto_book_suggestions_enabled: true
    });
    const privacy = await updatePrivacyPreferences(ownerUser, {
      public_profile_visibility: "public",
      follow_visibility: "public",
      marketing_consent: true
    });

    expect(app.appPreferences).toMatchObject({
      defaultView: "activity_first",
      preferredContactChannel: "email",
      rebookingRemindersEnabled: true,
      autoBookSuggestionsEnabled: true
    });
    expect(privacy.privacyPreferences).toMatchObject({
      publicProfileVisibility: "public",
      followVisibility: "public",
      savedItemsVisibility: "private",
      activityVisibility: "private",
      marketingConsent: true
    });
  });

  it("preserves hidden app preference values when a role saves visible fields", async () => {
    await updateAppPreferences(clientUser, {
      default_view: "activity_first",
      preferred_contact_channel: "email",
      rebooking_reminders_enabled: true,
      smart_booking_suggestions_enabled: true
    });

    const result = await updateAppPreferences(clientUser, {
      default_view: "role_default"
    });

    expect(result.appPreferences).toMatchObject({
      defaultView: "role_default",
      preferredContactChannel: "email",
      rebookingRemindersEnabled: true,
      smartBookingSuggestionsEnabled: true
    });
  });

  it("creates and removes saved, favorite, and follow edges without duplicate active records", async () => {
    await saveTarget(clientUser, { targetType: "barber", targetId: "barber-blaze" });
    await saveTarget(clientUser, { targetType: "barber", targetId: "barber-blaze" });
    await favoriteTarget(clientUser, { targetType: "shop", targetId: "shop-ybor" });
    await followTarget(clientUser, { targetType: "barber", targetId: "barber-blaze", visibility: "public" });

    let saved = await listSavedFavorites(clientUser);
    expect(saved.edges).toHaveLength(3);
    expect(saved.edges.filter((edge) => edge.targetId === "barber-blaze" && edge.edgeType === "save")).toHaveLength(1);
    expect(saved.sections?.[0]).toMatchObject({
      title: "Saved barbers",
      items: expect.arrayContaining([expect.objectContaining({ title: "Saved barber" })])
    });
    expect(JSON.stringify(saved.sections)).not.toContain("barber-blaze");

    await unsaveTarget(clientUser, { targetType: "barber", targetId: "barber-blaze" });
    await unfavoriteTarget(clientUser, { targetType: "shop", targetId: "shop-ybor" });
    await unfollowTarget(clientUser, { targetType: "barber", targetId: "barber-blaze" });

    saved = await listSavedFavorites(clientUser);
    expect(saved.edges).toHaveLength(0);

    const activity = await listActivity(clientUser);
    expect(activity.events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "save_created",
      "save_removed",
      "favorite_created",
      "favorite_removed",
      "follow_created",
      "follow_removed"
    ]));
    expect(activity.items.map((item) => item.title)).toContain("Save Created");
  });

  it("records explicit activity events for the account owner only", async () => {
    await recordActivityEvent(ownerUser, {
      eventType: "manual_settings_reviewed",
      targetType: "settings",
      targetId: "activity",
      metadata: { source: "unit_test" }
    });

    expect(await listActivity(ownerUser)).toMatchObject({
      events: [expect.objectContaining({ eventType: "manual_settings_reviewed" })]
    });
    expect((await listActivity(clientUser)).events).toHaveLength(0);
  });
});
