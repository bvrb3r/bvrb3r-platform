"use client";

import type { Route } from "next";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  Camera,
  CalendarDays,
  Copy,
  CreditCard,
  Gift,
  Heart,
  KeyRound,
  LifeBuoy,
  MailPlus,
  MapPinned,
  MessageSquareText,
  ReceiptText,
  Repeat2,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
} from "lucide-react";
import { ClientActivationGate } from "@/components/activation/tier1-activation-gates";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientPaymentMethodsPanel } from "@/components/client-experience/client-payment-methods-panel";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { AccountQuickEditModal, type AccountQuickEditInput, type AccountQuickEditLocationOption } from "@/components/dashboard/account/account-quick-edit-modal";
import {
  MoreActivationGate,
  MoreControlHub,
  MoreIdentityReadinessCard,
  MoreLogoutCard,
  MorePageHeader,
  MoreSectionGroup,
  type MoreSectionGroup as MoreSectionGroupConfig
} from "@/components/dashboard/more/more-components";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Avatar, DataStatCard, StatusBadge } from "@/design/components";
import { useClientBookingsQuery, useClientMembershipQuery } from "@/lib/booking/client";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";
import { useCreateReferralInviteMutation, useClientReferralSummary } from "@/lib/engagement/client";
import { getClientFacingBarberName } from "@/lib/marketplace/client-facing";
import { getResolvedDefaultPaymentMethod, type ClientPaymentMethodView } from "@/lib/payments/client";
import { usePointsBalanceQuery, usePointsHistoryQuery } from "@/lib/points/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { formatPublicCityStateLocation, formatPublicUsernameLine } from "@/lib/profile/public-identity-summary";
import { uploadMediaAsset } from "@/lib/storage/media";
import { currency } from "@/lib/utils";

type PickerInput = HTMLInputElement & {
  showPicker?: () => void;
};

const sectionIdMap = {
  activity: "profile-activity",
  preferences: "profile-preferences",
  location: "profile-account",
  wallet: "profile-wallet",
  rewards: "profile-rewards",
  referrals: "profile-referrals",
  settings: "profile-settings"
} as const;

type ProfileSectionKey = keyof typeof sectionIdMap;

function openFilePicker(input: HTMLInputElement | null) {
  const picker = input as PickerInput | null;
  if (!picker) {
    return;
  }

  if (typeof picker.showPicker === "function") {
    try {
      picker.showPicker();
      return;
    } catch {
      // Fall through to click() if showPicker is unavailable in the browser.
    }
  }

  picker.click();
}

function validateProfilePhoto(file: File | null) {
  if (!file) {
    return "Choose an image to upload.";
  }

  if (!file.type.startsWith("image/")) {
    return "Only image uploads are supported here.";
  }

  if (file.size > 8 * 1024 * 1024) {
    return "Images must stay under 8 MB.";
  }

  return null;
}

function getPaymentMethodTitle(method: ClientPaymentMethodView | null) {
  if (!method) {
    return "No default payment method";
  }

  if (method.nickname?.trim()) {
    return method.nickname.trim();
  }

  return method.label;
}

function getPaymentMethodDetail(method: ClientPaymentMethodView | null) {
  if (!method) {
    return "Add a payment method to keep booking and rebooking fast.";
  }

  const month = method.expMonth ? String(method.expMonth).padStart(2, "0") : null;
  const year = method.expYear ? String(method.expYear).slice(-2) : null;
  const expiry = month && year ? `Exp ${month}/${year}` : null;
  return [method.nickname ? method.label : null, expiry, "Default for bookings"].filter(Boolean).join(" · ");
}

function formatOccurredAt(iso?: string | null) {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function initialsForName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatPreferredLocation(location?: { city?: string; state?: string; postalCode?: string } | null) {
  if (!location) {
    return "";
  }

  return [location.city, location.state, location.postalCode].map((part) => part?.trim()).filter(Boolean).join(", ");
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ") || parts[0] || ""
  };
}

function parseCityStateLabel(label: string) {
  const [city = "", state = ""] = label.split(",").map((part) => part.trim());
  return { city, state };
}

function addLocationOption(
  options: Map<string, AccountQuickEditLocationOption>,
  location?: { city?: string | null; state?: string | null } | null
) {
  const city = location?.city?.trim();
  const state = location?.state?.trim();
  if (!city) {
    return;
  }

  const label = [city, state].filter(Boolean).join(", ");
  options.set(label.toLowerCase(), { label, city, state: state ?? "" });
}

export function ClientProfileScreen({
  payload,
  isSignedInClient,
  initialSection,
  authEmail,
  authPhone,
  emailVerified = false,
  phoneVerified = false
}: {
  payload: ClientProfilePayload;
  isSignedInClient: boolean;
  initialSection?: string;
  authEmail?: string;
  authPhone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}) {
  const queryClient = useQueryClient();
  const mediaQuery = useProfileMediaWorkspaceQuery(isSignedInClient);
  const mediaMutation = useMutateProfileMediaMutation();
  const bookingsQuery = useClientBookingsQuery(isSignedInClient);
  const membershipQuery = useClientMembershipQuery(isSignedInClient);
  const pointsBalanceQuery = usePointsBalanceQuery(isSignedInClient);
  const pointsHistoryQuery = usePointsHistoryQuery(isSignedInClient);
  const referralSummaryQuery = useClientReferralSummary(isSignedInClient);
  const inviteMutation = useCreateReferralInviteMutation();

  const [mediaFeedback, setMediaFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [referralFeedback, setReferralFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [locationFeedback, setLocationFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [accountEditorOpen, setAccountEditorOpen] = useState(false);
  const [savedAccountName, setSavedAccountName] = useState<string | null>(null);
  const [savedAccountEmail, setSavedAccountEmail] = useState<string | null>(null);
  const [savedAccountPhone, setSavedAccountPhone] = useState<string | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState(() => ({
    city: payload.client?.preferredLocation?.city ?? "",
    state: payload.client?.preferredLocation?.state ?? ""
  }));
  const [savedClientLocation, setSavedClientLocation] = useState(payload.client?.preferredLocation ?? null);
  const [locationModalError, setLocationModalError] = useState<string | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const profileInputRef = useRef<HTMLInputElement | null>(null);

  const client = payload.client;
  const favoriteBarber = payload.favoriteBarber;
  const favoriteBarberName = favoriteBarber
    ? getClientFacingBarberName({
      username: favoriteBarber.profile.username,
      barberName: favoriteBarber.barber.name
    })
    : "";
  const preferredShops = payload.preferredShops;
  const paymentMethods = payload.paymentMethods;
  const defaultPaymentMethod = getResolvedDefaultPaymentMethod(paymentMethods);
  const clientName = savedAccountName ?? client?.fullName ?? (isSignedInClient ? "Client" : "Client preview");
  const clientEmail = (savedAccountEmail ?? client?.email?.trim()) || authEmail?.trim() || "No email on file yet";
  const clientPhone = (savedAccountPhone ?? client?.phone?.trim()) || authPhone?.trim() || "";
  const clientPhotoUrl = mediaQuery.data?.viewer.profilePhotoUrl;
  const clientPublicUsernameLine = formatPublicUsernameLine(mediaQuery.data?.clientProfile?.publicUsername);
  const clientPublicLocationLine = formatPublicCityStateLocation({
    city: mediaQuery.data?.clientProfile?.publicCity ?? savedClientLocation?.city,
    state: mediaQuery.data?.clientProfile?.publicState ?? savedClientLocation?.state
  });
  const pointsBalance = pointsBalanceQuery.data ?? null;
  const pointsHistory = pointsHistoryQuery.data ?? null;
  const recentPointsActivity = pointsHistory?.activity.slice(0, 3) ?? [];
  const bookingsPayload = bookingsQuery.data ?? null;
  const upcomingAppointments = bookingsPayload?.upcoming ?? [];
  const pastAppointments = bookingsPayload?.history ?? [];
  const lastVisit = pastAppointments.find((appointment) => appointment.status === "completed") ?? pastAppointments[0] ?? null;
  const lastVisitLabel = formatOccurredAt(lastVisit?.start);
  const membership = membershipQuery.data ?? null;
  const activeMembership = membership?.subscription ?? null;
  const membershipValue = membership?.value ?? null;
  const referralSummary = referralSummaryQuery.data ?? null;
  const primaryShop = preferredShops[0] ?? null;
  const savedClientLocationLabel = formatPreferredLocation(savedClientLocation);
  const localBookingAreaTitle = primaryShop?.name ?? (savedClientLocationLabel || "No local booking area saved yet");
  const localBookingAreaDetail = primaryShop
    ? [primaryShop.neighborhood, primaryShop.city, primaryShop.state].filter(Boolean).join(", ")
    : savedClientLocationLabel
      ? "Saved client booking area."
      : "Save a city so client search can start near your preferred booking area.";
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as ProfileSectionKey | null;
  const notificationPreference = mediaQuery.data?.viewer.notificationPreference ?? payload.notificationPreference;
  const hasPhone = clientPhone.length > 0;
  const rewardsPoints = pointsBalance?.unlockedPoints ?? 0;
  const favoriteCount = (favoriteBarber ? 1 : 0) + preferredShops.length;
  const bookingReady = Boolean(defaultPaymentMethod && (favoriteBarber || preferredShops.length || savedClientLocation));
  const supportedLocationOptions = (() => {
    const options = new Map<string, AccountQuickEditLocationOption>();
    preferredShops.forEach((shop) => addLocationOption(options, shop));
    favoriteBarber?.shopLocations?.forEach((location) => addLocationOption(options, location));
    addLocationOption(options, savedClientLocation);
    return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
  })();
  const clientMoreSections: MoreSectionGroupConfig[] = [
    {
      title: "Compliance & Security",
      subtitle: "Login, privacy, and account protection controls.",
      rows: [
        { title: "Password & Login", subtitle: "Open the shared contact and sign-in verification flow.", href: "/verify-contact", icon: <KeyRound className="h-5 w-5" /> },
        { title: "Privacy", subtitle: "Review what BVRB3R uses for booking, rewards, and reminders.", href: "/contact", icon: <ShieldCheck className="h-5 w-5" /> },
        { title: "Account Security", subtitle: "Keep email and phone verification current.", href: "/verify-contact", status: emailVerified || phoneVerified ? "Verified" : "Needs setup", tone: emailVerified || phoneVerified ? "green" : "yellow", icon: <ShieldCheck className="h-5 w-5" /> }
      ]
    },
    {
      title: "Support",
      subtitle: "Help and account questions stay reachable from Messages.",
      rows: [
        { title: "Help Center", subtitle: "Guides and support resources.", href: "/contact", icon: <LifeBuoy className="h-5 w-5" /> },
        { title: "Contact Support", subtitle: "Start a support conversation inside Messages.", href: `${CLIENT_PRIMARY_TAB_HREFS.messages}?thread=support` as Route, icon: <MessageSquareText className="h-5 w-5" /> }
      ]
    }
  ];

  useEffect(() => {
    if (!selectedSection) {
      return;
    }

    const target = document.getElementById(sectionIdMap[selectedSection]);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSection]);

  useEffect(() => {
    setSavedClientLocation(client?.preferredLocation ?? null);
    setLocationDraft({
      city: client?.preferredLocation?.city ?? "",
      state: client?.preferredLocation?.state ?? ""
    });
  }, [client?.clientReference, client?.preferredLocation]);

  async function handleNotificationToggle(
    field: "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled",
    value: boolean
  ) {
    setMediaFeedback(null);

    try {
      await mediaMutation.mutateAsync({
        action: "update_viewer_notification_preference",
        inAppEnabled: field === "inAppEnabled" ? value : notificationPreference?.inAppEnabled ?? true,
        smsEnabled: field === "smsEnabled" ? value : notificationPreference?.smsEnabled ?? false,
        emailEnabled: field === "emailEnabled" ? value : notificationPreference?.emailEnabled ?? true,
        pushEnabled: field === "pushEnabled" ? value : notificationPreference?.pushEnabled ?? true
      });
      setMediaFeedback({
        tone: "success",
        message: "Notification preferences updated."
      });
    } catch (error) {
      setMediaFeedback({
        tone: "error",
        message: readableError(error, "Unable to update notification preferences right now.")
      });
    }
  }

  async function handleProfileUpload(file: File) {
    setMediaFeedback(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const uploaded = await uploadMediaAsset(
        `profiles/client/${client?.clientReference ?? clientEmail}/${Date.now()}.${extension}`,
        file
      );

      await mediaMutation.mutateAsync({
        action: "set_viewer_photo",
        storagePath: uploaded.path,
        imageUrl: uploaded.publicUrl
      });

      setMediaFeedback({
        tone: "success",
        message: "Profile photo updated."
      });
    } catch (error) {
      setMediaFeedback({
        tone: "error",
        message: readableError(error, "Unable to update your profile photo.")
      });
    }
  }

  async function handleProfileRemove() {
    setMediaFeedback(null);
    try {
      await mediaMutation.mutateAsync({ action: "remove_viewer_photo" });
      setMediaFeedback({
        tone: "success",
        message: "Profile photo removed."
      });
    } catch (error) {
      setMediaFeedback({
        tone: "error",
        message: readableError(error, "Unable to remove your profile photo.")
      });
    }
  }

  async function handleCopyInviteLink() {
    if (!referralSummary?.inviteLink) {
      return;
    }

    setReferralFeedback(null);

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralSummary.inviteLink);
      }

      setReferralFeedback({
        tone: "success",
        message: "Invite link copied."
      });
    } catch (error) {
      setReferralFeedback({
        tone: "error",
        message: readableError(error, "Unable to copy the invite link right now.")
      });
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      setReferralFeedback({
        tone: "error",
        message: "Enter an email address to send an invite."
      });
      return;
    }

    setReferralFeedback(null);

    try {
      await inviteMutation.mutateAsync({ referredClientEmail: inviteEmail.trim() });
      setInviteEmail("");
      setReferralFeedback({
        tone: "success",
        message: "Invite sent. Rewards only post after a qualified paid service is completed."
      });
    } catch (error) {
      setReferralFeedback({
        tone: "error",
        message: readableError(error, "Unable to send the invite right now.")
      });
    }
  }

  function scrollToSection(sectionKey: ProfileSectionKey) {
    const target = document.getElementById(sectionIdMap[sectionKey]);
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function openLocationModal() {
    const city = primaryShop?.city ?? savedClientLocation?.city ?? locationDraft.city;
    const state = primaryShop?.state ?? savedClientLocation?.state ?? locationDraft.state;
    setLocationDraft({ city, state });
    setLocationModalError(null);
    setLocationModalOpen(true);
  }

  async function handleLocationSave() {
    setLocationFeedback(null);
    setLocationModalError(null);
    if (!locationDraft.city.trim()) {
      setLocationModalError("Enter a city to save your booking location.");
      return;
    }

    setIsSavingLocation(true);
    try {
      const response = await fetch("/api/client/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: locationDraft.city.trim(),
          state: locationDraft.state.trim()
        })
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
        code?: string;
        location?: { city: string; state: string; postalCode?: string };
        client?: { preferredLocation?: { city: string; state: string; postalCode?: string } | null };
      };
      if (!response.ok) {
        const reason = body.reason ? ` (${body.reason})` : "";
        throw new Error(`${body.error ?? "Unable to save location."}${reason}`);
      }

      const savedLocation = body.location ?? body.client?.preferredLocation ?? null;
      if (!savedLocation) {
        throw new Error("Location save response did not include a saved location.");
      }

      setSavedClientLocation(savedLocation);
      setLocationDraft({
        city: savedLocation.city,
        state: savedLocation.state
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-home"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-search"] })
      ]);
      setLocationModalOpen(false);
      setLocationFeedback({ tone: "success", message: "Location saved for faster booking." });
    } catch (error) {
      const message = readableError(error, "Unable to save location right now.");
      setLocationModalError(message);
      setLocationFeedback({ tone: "error", message });
    } finally {
      setIsSavingLocation(false);
    }
  }

  async function handleAccountSave(input: AccountQuickEditInput) {
    if (!isSignedInClient) {
      throw new Error("Sign in before saving account details.");
    }

    const { city, state } = parseCityStateLabel(input.cityLocation);
    const { firstName, lastName } = splitFullName(input.fullName);
    if (!firstName || !lastName) {
      throw new Error("Enter a first and last name.");
    }

    const contactResponse = await fetch("/api/auth/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        phone: input.phone,
        email: input.email || undefined
      })
    });
    const contactBody = (await contactResponse.json().catch(() => ({}))) as { error?: string };
    if (!contactResponse.ok) {
      throw new Error(contactBody.error ?? "Unable to save account contact details.");
    }

    if (city) {
      const locationResponse = await fetch("/api/client/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, state })
      });
      const locationBody = (await locationResponse.json().catch(() => ({}))) as {
        error?: string;
        location?: { city: string; state: string; postalCode?: string };
        client?: { preferredLocation?: { city: string; state: string; postalCode?: string } | null };
      };
      if (!locationResponse.ok) {
        throw new Error(locationBody.error ?? "Unable to save client location.");
      }
      const savedLocation = locationBody.location ?? locationBody.client?.preferredLocation ?? { city, state };
      setSavedClientLocation(savedLocation);
    }

    if (input.defaultPaymentMethodId && input.defaultPaymentMethodId !== defaultPaymentMethod?.id) {
      const paymentResponse = await fetch(`/api/payments/methods/${encodeURIComponent(input.defaultPaymentMethodId)}/default`, {
        method: "POST"
      });
      const paymentBody = (await paymentResponse.json().catch(() => ({}))) as { error?: string };
      if (!paymentResponse.ok) {
        throw new Error(paymentBody.error ?? "Unable to set the default payment method.");
      }
    }

    setSavedAccountName(input.fullName);
    setSavedAccountEmail(input.email);
    setSavedAccountPhone(input.phone);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["payments", "methods"] }),
      queryClient.invalidateQueries({ queryKey: ["client-home"] }),
      queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["marketplace"] })
    ]);
  }

  function handleAccountPaymentAction() {
    setAccountEditorOpen(false);
    window.setTimeout(() => scrollToSection("wallet"), 0);
  }

  return (
    <div className="space-y-4" data-testid="client-profile-screen">
      <MorePageHeader
        title="More"
        subtitle="Manage your account, booking activity, payments, rewards, and preferences."
      />

      {mediaFeedback ? <FeedbackBanner tone={mediaFeedback.tone} message={mediaFeedback.message} /> : null}
      {referralFeedback ? <FeedbackBanner tone={referralFeedback.tone} message={referralFeedback.message} /> : null}
      {locationFeedback ? <FeedbackBanner tone={locationFeedback.tone} message={locationFeedback.message} /> : null}
      {pointsBalanceQuery.error ? <FeedbackBanner tone="error" message="Rewards are unavailable right now. The rest of your profile is still ready." /> : null}
      {membershipQuery.error ? <FeedbackBanner tone="error" message="Membership status could not be loaded right now." /> : null}
      {referralSummaryQuery.error ? <FeedbackBanner tone="error" message="Invite progress is unavailable right now." /> : null}

      <MoreIdentityReadinessCard
        variant="client"
        imageUrl={clientPhotoUrl}
        initials={initialsForName(clientName)}
        title={clientName}
        subtitle={clientEmail}
        roleLabel="CLIENT ACCOUNT"
        badges={[
          { label: emailVerified || phoneVerified ? "Verified" : "Verification needed", tone: emailVerified || phoneVerified ? "green" : "yellow" },
          { label: defaultPaymentMethod ? "Wallet ready" : "Add payment", tone: defaultPaymentMethod ? "green" : "yellow" },
          { label: "Rewards setup", tone: rewardsPoints ? "green" : "muted" }
        ]}
        metaLines={[
          { label: "Username", value: clientPublicUsernameLine },
          { label: "Phone", value: clientPhone || "Phone not set" },
          { label: "Contact email", value: clientEmail === "No email on file yet" ? "Email not set" : clientEmail },
          { label: "Location", value: clientPublicLocationLine }
        ]}
        primaryAction={{ label: "Edit Account", onClick: () => setAccountEditorOpen(true) }}
        secondaryAction={{ label: "Public Profile", href: "/dashboard/client/public-profile" }}
        tiles={[
          { label: "Account", value: emailVerified || phoneVerified ? "Verified" : "Needs setup", helper: "Email and phone readiness.", tone: emailVerified || phoneVerified ? "green" : "yellow", href: "#profile-account" },
          { label: "Wallet", value: defaultPaymentMethod ? "Card ready" : "Add payment", helper: getPaymentMethodTitle(defaultPaymentMethod), tone: defaultPaymentMethod ? "green" : "yellow", href: "#profile-wallet" },
          { label: "Rewards", value: `${rewardsPoints} pts`, helper: pointsBalance?.explanation.progressLabel ?? "Not active yet", tone: rewardsPoints ? "green" : "muted", href: "#profile-rewards" },
          { label: "Favorites", value: favoriteCount ? `${favoriteCount} saved` : "Add favorites", helper: "Barbers and shops you trust.", tone: favoriteCount ? "green" : "muted", href: "#profile-preferences" },
          { label: "Booking", value: bookingReady ? "Ready" : "Needs setup", helper: "Payment, favorites, and location.", tone: bookingReady ? "green" : "yellow", href: "#profile-activity" }
        ]}
      />

      <MoreActivationGate
        title="Your BVRB3R setup"
        subtitle="Finish these steps so booking, payments, rewards, and reminders work smoothly."
      >
        <ClientActivationGate
          input={{
            emailVerified,
            phoneVerified: hasPhone && phoneVerified,
            hasDefaultPaymentMethod: Boolean(defaultPaymentMethod),
            hasLocation: Boolean(primaryShop ?? savedClientLocation ?? client?.favoriteShopReference),
            hasPreferredSupply: Boolean(favoriteBarber ?? preferredShops.length)
          }}
          actionHandlers={{
            "client-payment": () => scrollToSection("wallet"),
            "client-location": openLocationModal,
            "client-email": () => window.location.assign("/verify-contact"),
            "client-phone": () => window.location.assign("/verify-contact"),
            "client-preferred-supply": () => window.location.assign("/dashboard/client/search")
          }}
        />
      </MoreActivationGate>

      <MoreControlHub
        title="Personal Control Hub"
        subtitle="Manage how BVRB3R knows you, bills you, reminds you, and tracks your activity."
        rows={[
          { href: "#profile-account", title: "Account", subtitle: "Name, contact, and profile photo", icon: <Camera className="h-5 w-5" /> },
          { href: "#client-public-profile", title: "Public Profile", subtitle: "Culture profile and public identity", icon: <UserRound className="h-5 w-5" /> },
          { href: "#profile-wallet", title: "Wallet", subtitle: "Cards and booking default", icon: <CreditCard className="h-5 w-5" /> },
          { href: CLIENT_PRIMARY_TAB_HREFS.activity, title: "Activity", subtitle: "Appointments and receipts", icon: <ReceiptText className="h-5 w-5" /> },
          { href: "#profile-rewards", title: "Rewards", subtitle: "Points and referrals", icon: <Gift className="h-5 w-5" /> },
          { href: "#profile-preferences", title: "Favorites", subtitle: "Saved barbers and shops", icon: <Heart className="h-5 w-5" /> },
          { href: "#profile-settings", title: "Notifications", subtitle: "Messages and reminders", icon: <BellRing className="h-5 w-5" /> },
          { href: "/verify-contact", title: "Privacy", subtitle: "Contact and security", icon: <ShieldCheck className="h-5 w-5" /> },
          { href: "/contact", title: "Help", subtitle: "Support resources", icon: <LifeBuoy className="h-5 w-5" /> }
        ]}
      />

      <ClientSectionBlock
        eyebrow="Account & Profile"
        title="Account & Profile"
        subtitle="Your identity, contact details, and payment default."
      >
        <div id="profile-account" className="scroll-mt-6 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(7,7,7,0.99))] p-5 shadow-[0_22px_44px_rgba(0,0,0,0.2)] sm:p-6">
          <input
            ref={profileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0] ?? null;
              event.currentTarget.value = "";
              const error = validateProfilePhoto(file);
              if (error) {
                setMediaFeedback({ tone: "error", message: error });
                return;
              }

              await handleProfileUpload(file!);
            }}
          />

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                <Avatar
                  src={clientPhotoUrl}
                  alt={clientName}
                  initials={initialsForName(clientName)}
                  className="h-24 w-24 rounded-[28px] text-2xl shadow-[0_18px_34px_rgba(0,0,0,0.22)]"
                />

                {isSignedInClient ? (
                  <button
                    type="button"
                    aria-label="Edit profile photo"
                    onClick={() => openFilePicker(profileInputRef.current)}
                    className="absolute -bottom-2 -right-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7ffab]/24 bg-black/90 text-[#d7ffab] transition hover:border-[#d7ffab]/40"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="min-w-0">
                <p className="text-2xl font-semibold text-white" data-display="true">{clientName}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/76">
                    {getPaymentMethodTitle(defaultPaymentMethod)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/76">
                    {paymentMethods.length} saved payment method{paymentMethods.length === 1 ? "" : "s"}
                  </span>
                  {emailVerified ? <StatusBadge tone="green">Verified</StatusBadge> : <StatusBadge tone="neutral">Email pending</StatusBadge>}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {isSignedInClient && clientPhotoUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 rounded-full px-4"
                  disabled={mediaMutation.isPending}
                  onClick={() => void handleProfileRemove()}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove Photo
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-4">
              <p className="surface-label">Email</p>
              <p className="mt-3 text-lg font-semibold text-white break-all">{clientEmail}</p>
              <p className="mt-2 text-sm text-white/58">
                {emailVerified ? "Verified email" : "Email verification status is still pending."}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-4">
              <p className="surface-label">Phone</p>
              <p className="mt-3 text-lg font-semibold text-white">{hasPhone ? clientPhone : "Phone required"}</p>
              <p className="mt-2 text-sm text-white/58">
                {hasPhone
                  ? phoneVerified
                    ? "Verified phone"
                    : "Phone verification is still pending."
                  : "Add and verify your phone before booking flows that require contact confirmation."}
              </p>
              {!hasPhone ? (
                <div className="mt-4">
                  <ClientActionLink href="/verify-contact" size="md" variant="secondary">
                    Add Phone
                  </ClientActionLink>
                </div>
              ) : null}
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-4">
              <p className="surface-label">Default payment</p>
              <p className="mt-3 text-lg font-semibold text-white">{getPaymentMethodTitle(defaultPaymentMethod)}</p>
              <p className="mt-2 text-sm text-white/58">
                {getPaymentMethodDetail(defaultPaymentMethod)}
              </p>
              <div className="mt-4">
                <Link
                  href="#profile-wallet"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[13px] font-semibold text-white/86 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
                >
                  Manage in Wallet
                </Link>
              </div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-4">
              <p className="surface-label">Local booking area</p>
              <p className="mt-3 text-lg font-semibold text-white">{localBookingAreaTitle}</p>
              <p className="mt-2 text-sm text-white/58">
                {localBookingAreaDetail}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[13px] font-semibold text-white/86 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
                  onClick={openLocationModal}
                >
                  Edit Location
                </button>
              </div>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Public Profile"
        title="Client Public Profile"
        subtitle="Your culture profile for follows, posts, and social discovery inside BVRB3R."
      >
        <div id="client-public-profile" className="scroll-mt-6 rounded-[30px] border border-white/10 bg-black/20 p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
            <Avatar
              src={clientPhotoUrl}
              alt={clientName}
              initials={initialsForName(clientName)}
              className="h-24 w-24 rounded-[28px] border-2 border-[#d7ffab]/30 text-2xl"
            />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Culture profile</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{clientName}</h3>
              <p className="mt-2 text-sm leading-6 text-white/58">
                Client public profiles appear only in Culture, follow, and social surfaces. Barber and shop marketplace search stays reserved for bookable businesses.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <label className="block text-sm font-bold text-white/72">
                  Display name
                  <Input value={clientName} readOnly className="mt-2" />
                </label>
                <label className="block text-sm font-bold text-white/72">
                  @username
                  <Input value="" readOnly placeholder="Set public username next" className="mt-2" />
                </label>
                <label className="block text-sm font-bold text-white/72 md:col-span-2">
                  Bio
                  <textarea
                    readOnly
                    rows={3}
                    placeholder="Tell the BVRB3R culture feed what styles, shops, and cuts you follow."
                    className="mt-2 w-full rounded-[14px] border border-white/10 bg-[#101010] px-4 py-3 text-base text-white outline-none placeholder:text-white/38 sm:text-sm"
                  />
                </label>
              </div>
              <div className="mt-5 rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4 text-sm leading-6 text-white/58">
                Public culture feed editing is staged here. Save controls will activate when Culture posting and public client handles are connected.
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" disabled className="min-h-11 rounded-full px-5">Save profile</Button>
                <Button type="button" variant="secondary" className="min-h-11 rounded-full px-5" onClick={() => scrollToSection("activity")}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Booking Activity"
        title="Booking Activity"
        subtitle="Appointments, receipts, history, and rebooking stay close to your account."
      >
        <div id="profile-activity" className="scroll-mt-6 rounded-[30px] border border-white/10 bg-black/20 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <DataStatCard
              label="Upcoming"
              value={bookingsQuery.isLoading && !bookingsPayload ? "..." : String(upcomingAppointments.length)}
              detail="Appointments still ahead."
              icon={<CalendarDays className="h-4 w-4" />}
            />
            <DataStatCard
              label="Past"
              value={bookingsQuery.isLoading && !bookingsPayload ? "..." : String(pastAppointments.length)}
              detail="Receipts and completed records."
              icon={<ReceiptText className="h-4 w-4" />}
            />
            <DataStatCard
              label="Last visit"
              value={lastVisitLabel ?? "No visits yet"}
              detail={lastVisit?.view?.barber?.name ?? "Completed visits appear here."}
              icon={<Repeat2 className="h-4 w-4" />}
            />
          </div>

          {bookingsQuery.error ? (
            <div className="mt-4 rounded-[22px] border border-[#ffd166]/18 bg-[#ffd166]/8 px-4 py-3 text-sm text-[#ffe7a3]">
              Appointment activity could not refresh here. Your appointment detail page is still available.
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.activity} size="md">
              View appointments
            </ClientActionLink>
            <ClientActionLink
              href={(favoriteBarber?.bookingCtaHref ?? `${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers`) as Route}
              size="md"
              variant="secondary"
            >
              Rebook
            </ClientActionLink>
            <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.activity} size="md" variant="secondary">
              View receipts
            </ClientActionLink>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Favorites"
        title="Favorites"
        subtitle="Keep the barbers and shops you want to get back to quickly."
      >
        <div id="profile-preferences" className="grid scroll-mt-6 gap-4 xl:grid-cols-2">
          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Heart className="h-4 w-4 text-[#d7ffab]" />
              Preferred Barbers
            </div>
            <div className="mt-4 space-y-3">
              {favoriteBarber ? (
                <div className="rounded-[24px] border border-white/8 bg-black/18 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={favoriteBarber.profile.profilePhotoUrl}
                      alt={favoriteBarberName}
                      initials={initialsForName(favoriteBarberName)}
                      className="h-16 w-16 rounded-[20px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-white">{favoriteBarberName}</p>
                      <p className="mt-1 text-sm text-white/58">
                        {favoriteBarber.shopLocations[0]?.name ?? favoriteBarber.profile.headline ?? "Preferred barber"}
                      </p>
                      <p className="mt-2 text-sm text-white/72">
                        {favoriteBarber.proof?.reviewScore ? `${favoriteBarber.proof.reviewScore.toFixed(1)} rating` : "Trusted favorite"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <ClientActionLink href={(favoriteBarber.bookingCtaHref ?? `${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers`) as Route} size="md">
                      Book
                    </ClientActionLink>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-4">
                  <p className="text-lg font-semibold text-white">No preferred barbers yet</p>
                  <div className="mt-4">
                    <ClientActionLink href={`${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers` as Route} size="md">
                      Find Barbers
                    </ClientActionLink>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Store className="h-4 w-4 text-[#baff69]" />
              Preferred Shops
            </div>
            <div className="mt-4 space-y-3">
              {preferredShops.length ? preferredShops.map((shop) => (
                <div key={shop.id} className="rounded-[24px] border border-white/8 bg-black/18 p-4">
                  <p className="text-lg font-semibold text-white">{shop.name}</p>
                  <p className="mt-2 text-sm text-white/58">{[shop.neighborhood, shop.city, shop.state].filter(Boolean).join(", ")}</p>
                  <div className="mt-4">
                    <ClientActionLink
                      href={`${CLIENT_PRIMARY_TAB_HREFS.search}?type=shops&q=${encodeURIComponent(shop.name)}&locationId=${encodeURIComponent(shop.id)}` as never}
                      size="md"
                    >
                      View Barbers
                    </ClientActionLink>
                  </div>
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-4">
                  <p className="text-lg font-semibold text-white">No preferred shops yet</p>
                  <div className="mt-4">
                    <ClientActionLink href={`${CLIENT_PRIMARY_TAB_HREFS.search}?type=shops` as Route} size="md" variant="secondary">
                      Find Barber Shops
                    </ClientActionLink>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Wallet"
        title="Payments & Wallet"
        subtitle="Saved payment methods and the booking default stay here."
      >
        <div id="profile-wallet" className="scroll-mt-6 space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <CreditCard className="h-4 w-4 text-[#baff69]" />
              Default payment method
            </div>
            <p className="mt-4 text-lg font-semibold text-white">{getPaymentMethodTitle(defaultPaymentMethod)}</p>
            <p className="mt-2 text-sm text-white/58">
              {getPaymentMethodDetail(defaultPaymentMethod)}
            </p>
          </div>
          <ClientPaymentMethodsPanel initialMethods={paymentMethods} isSignedInClient={isSignedInClient} />
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Rewards & Loyalty"
        title="Rewards & Loyalty"
        subtitle="BVR Points, progress, and membership stay compact here."
      >
        <div id="profile-rewards" className="scroll-mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <DataStatCard
              label="BVR Points"
              value={`${pointsBalance?.unlockedPoints ?? 0} pts`}
              icon={<Gift className="h-4 w-4" />}
              className="border-[#a8ff47]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(8,8,8,0.98))]"
            />
            <DataStatCard label="Pending" value={`${pointsBalance?.pendingPoints ?? 0} pts`} />
            <DataStatCard label="Value" value={currency(pointsBalance?.inAppValue ?? 0)} />
            <DataStatCard label="Progress" value={pointsBalance?.explanation.progressLabel ?? "No milestone yet"} />
            <DataStatCard
              label="Membership"
              value={activeMembership?.planName ?? "No membership"}
              detail={membershipValue?.valueMessage ?? "Membership updates appear here when active."}
            />
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Gift className="h-4 w-4 text-[#d7ffab]" />
              Rewards activity
            </div>
            <div className="mt-4 space-y-3">
              {recentPointsActivity.length ? recentPointsActivity.map((item) => (
                <div key={item.id} className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="mt-2 text-sm text-white/58">{item.detail}</p>
                    </div>
                    <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#e8ffc2]">
                      {item.amountLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/42">
                    {formatOccurredAt(item.occurredAt) ?? "Recently"}
                  </p>
                </div>
              )) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-black/18 px-4 py-4 text-sm text-white/58">
                  No rewards activity yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Invite & Earn"
        title="Invite & Earn"
        subtitle="Share your code and earn when a qualified paid service closes."
      >
        <div id="profile-referrals" className="scroll-mt-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <Copy className="h-4 w-4 text-[#d7ffab]" />
                Referral code
              </div>
              <p className="mt-4 text-2xl font-semibold text-white">{referralSummary?.referralCode?.code ?? "No code yet"}</p>
              <p className="mt-2 text-sm text-white/58">
                {referralSummary?.referralCode
                  ? `${referralSummary.referralCode.rewardPoints} pts credit after the invited client completes a qualified paid service.`
                  : "Referral rewards appear here when your invite code is ready."}
              </p>
              <div className="mt-4 rounded-[20px] border border-white/8 bg-black/18 px-4 py-4 text-sm text-white/72">
                {referralSummary?.inviteLink ?? "No share link available yet."}
              </div>
              <div className="mt-4">
                <Button
                  type="button"
                  className="min-h-11 rounded-full px-5"
                  onClick={() => void handleCopyInviteLink()}
                  disabled={!referralSummary?.inviteLink}
                >
                  <Copy className="h-4 w-4" />
                  Copy Invite Link
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <MailPlus className="h-4 w-4 text-[#baff69]" />
                Direct invite
              </div>
              <p className="mt-4 text-sm text-white/58">Invite someone directly and track the real lifecycle from shared to credited.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="friend@example.com"
                  className="sm:flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 rounded-full px-5"
                  disabled={!isSignedInClient || inviteMutation.isPending}
                  onClick={() => void handleInvite()}
                >
                  <MailPlus className="h-4 w-4" />
                  {inviteMutation.isPending ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Shared</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.invited ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Signed up</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.signedUp ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Booked</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.booked ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Completed</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.completed ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
              <p className="surface-label text-[#d7ffab]">Credited</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.credited ?? 0}</p>
              <p className="mt-2 text-sm text-white/64">{referralSummary?.totals.rewardPointsEarned ?? 0} pts earned</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <ShieldCheck className="h-4 w-4 text-[#d7ffab]" />
              Recent referral progress
            </div>
            <div className="mt-4 space-y-3">
              {referralSummary?.recentReferrals.length ? referralSummary.recentReferrals.slice(0, 3).map((referral) => (
                <div key={referral.id} className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{referral.referredClientEmail}</p>
                      <p className="mt-2 text-sm text-white/58">{formatOccurredAt(referral.creditedAt ?? referral.completedAt ?? referral.bookedAt ?? referral.signedUpAt ?? referral.createdAt) ?? "Recently"}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#d7ffab]">
                      {referral.status.replaceAll("_", " ")}
                    </span>
                  </div>
                </div>
              )) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-black/18 px-4 py-4 text-sm text-white/58">
                  No referral progress yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Preferences"
        title="Preferences"
        subtitle="Notification controls and location preferences stay in one place."
      >
        <div id="profile-settings" className="grid scroll-mt-6 gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <BellRing className="h-4 w-4 text-[#baff69]" />
              Notification preferences
            </div>
            <p className="mt-3 text-sm text-white/58">Adjust the real notification channels already supported on your account.</p>
            <div className="mt-4 space-y-3">
              {[
                { key: "inAppEnabled", label: "In-app alerts" },
                { key: "smsEnabled", label: "Text updates" },
                { key: "emailEnabled", label: "Email updates" },
                { key: "pushEnabled", label: "Push alerts" }
              ].map((item) => {
                const checked = notificationPreference?.[item.key as keyof NonNullable<typeof notificationPreference>] ?? false;
                return (
                  <label key={item.key} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/72">
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={checked as boolean}
                      disabled={mediaMutation.isPending}
                      onChange={(event) => void handleNotificationToggle(item.key as "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled", event.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-black"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <MapPinned className="h-4 w-4 text-[#d7ffab]" />
              Location preference
            </div>
            <p className="mt-3 text-lg font-semibold text-white">{localBookingAreaTitle}</p>
            <p className="mt-2 text-sm text-white/58">
              Browser-level location permission is controlled by your device. In BVRB3R, nearby matching follows your saved booking area and preferred shop.
            </p>
            <div className="mt-4">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[13px] font-semibold text-white/84 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
                onClick={openLocationModal}
              >
                {savedClientLocation || primaryShop ? "Edit Location" : "Add Location"}
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <ShieldCheck className="h-4 w-4 text-[#d7ffab]" />
              Privacy & Security
            </div>
            <p className="mt-3 text-lg font-semibold text-white">Secure your contact details</p>
            <p className="mt-2 text-sm text-white/58">
              Keep your email and phone verification current through the shared contact verification flow.
            </p>
            <div className="mt-4">
              <ClientActionLink href="/verify-contact" size="md" variant="secondary">
                Open Contact Settings
              </ClientActionLink>
            </div>
          </div>

        </div>
      </ClientSectionBlock>

      {clientMoreSections.map((group) => <MoreSectionGroup key={group.title} group={group} />)}

      <MoreLogoutCard />

      <AccountQuickEditModal
        open={accountEditorOpen}
        variant="client"
        displayName={clientName}
        publicUsername={clientPublicUsernameLine}
        fullName={clientName}
        email={clientEmail === "No email on file yet" ? "" : clientEmail}
        phone={clientPhone}
        cityLocation={savedClientLocationLabel || primaryShop?.city || ""}
        defaultPaymentMethodLabel={getPaymentMethodTitle(defaultPaymentMethod)}
        paymentOptions={paymentMethods.map((method) => ({
          id: method.id,
          label: getPaymentMethodTitle(method),
          isDefault: method.id === defaultPaymentMethod?.id
        }))}
        defaultPaymentMethodId={defaultPaymentMethod?.id ?? null}
        managePaymentHref="/dashboard/client/more?section=wallet"
        locationOptions={supportedLocationOptions}
        requireLocationOption={supportedLocationOptions.length > 0}
        emailVerified={emailVerified}
        phoneVerified={phoneVerified}
        onClose={() => setAccountEditorOpen(false)}
        onPaymentAction={handleAccountPaymentAction}
        onSave={handleAccountSave}
      />

      {locationModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.58),0_0_34px_rgba(163,255,18,0.12)]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Quick setup</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Set location</h2>
              <p className="mt-2 text-sm text-white/58">Search still works without this. Saving a city helps booking flows move faster.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold text-white/72">
                City
                <Input value={locationDraft.city} onChange={(event) => {
                  setLocationModalError(null);
                  setLocationDraft((current) => ({ ...current, city: event.target.value }));
                }} className="mt-2" />
              </label>
              <label className="block text-sm font-bold text-white/72">
                State
                <Input value={locationDraft.state} onChange={(event) => {
                  setLocationModalError(null);
                  setLocationDraft((current) => ({ ...current, state: event.target.value }));
                }} className="mt-2" />
              </label>
            </div>
            {locationModalError ? <div className="mt-4"><FeedbackBanner tone="error" message={locationModalError} /></div> : null}
            <div className="mt-5 flex gap-3">
              <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={() => setLocationModalOpen(false)}>Cancel</Button>
              <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={isSavingLocation} aria-busy={isSavingLocation} onClick={() => void handleLocationSave()}>
                {isSavingLocation ? "Saving..." : "Save location"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
