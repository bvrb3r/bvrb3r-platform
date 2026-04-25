"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BellRing,
  Building2,
  LifeBuoy,
  ShieldCheck
} from "lucide-react";
import { AccountSessionWorkspace } from "@/components/auth/account-session-workspace";
import { BarberFintechReadinessPanel } from "@/components/operations/barber-fintech-readiness-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useBarberFintechReadinessQuery } from "@/lib/fintech/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import {
  useCreateVerificationUploadMutation,
  useStartBarberIdentitySessionMutation,
  useSubmitBarberVerificationMutation,
  useVerificationMe,
  useBarberTrustSummary
} from "@/lib/trust/client";
import {
  useSaveBarberSubtypeMutation,
  type BarberApiError
} from "@/lib/operations/barber-client";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { BarberSubtype, UserAccount } from "@/types/domain";

const subtypeOptions: Array<{ subtype: BarberSubtype; label: string; description: string }> = [
  { subtype: "freelance", label: "Freelance", description: "Independent chair posture with self-managed availability." },
  { subtype: "commission", label: "Commission", description: "Shop commission model with shared schedule and payout rails." },
  { subtype: "blueprint", label: "Booth rent / Blueprint", description: "Booth-rent model with independent revenue posture." }
];

const sectionIdMap = {
  account: "barber-settings-account",
  business: "barber-settings-business",
  verification: "barber-settings-verification",
  payouts: "barber-settings-payouts",
  support: "barber-settings-support"
} as const;

type SettingsSectionKey = keyof typeof sectionIdMap;

function formatStatusLabel(value?: string | null) {
  if (!value) {
    return "Not started";
  }

  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function BarberSettingsScreen({
  user,
  initialSection,
  embedded = false
}: {
  user: UserAccount;
  initialSection?: string;
  embedded?: boolean;
}) {
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const trustQuery = useBarberTrustSummary(true);
  const verificationMeQuery = useVerificationMe(true);
  const readinessQuery = useBarberFintechReadinessQuery(true);
  const saveSubtypeMutation = useSaveBarberSubtypeMutation();
  const uploadMutation = useCreateVerificationUploadMutation();
  const submitVerificationMutation = useSubmitBarberVerificationMutation();
  const identitySessionMutation = useStartBarberIdentitySessionMutation();
  const [selectedSubtype, setSelectedSubtype] = useState<BarberSubtype>(user.barberSubtype ?? "freelance");
  const [verificationCategory, setVerificationCategory] = useState<"identity_verification" | "license_verification" | "payout_verification" | "shop_affiliation_verification">("license_verification");
  const [legalName, setLegalName] = useState(user.name);
  const [fileName, setFileName] = useState("updated-license.pdf");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingState, setIssuingState] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const notificationPreference = mediaQuery.data?.viewer.notificationPreference;
  const verificationProfile = verificationMeQuery.data?.profiles.find((profile) => profile.role === "barber") ?? null;
  const verificationDecision = trustQuery.data?.verificationDecision;
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as SettingsSectionKey | null;

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

  async function handleSaveSubtype() {
    setFeedback(null);
    try {
      await saveSubtypeMutation.mutateAsync(selectedSubtype);
      setFeedback({ tone: "success", message: "Business model saved. Home, Calendar, Checkout, and Profile now reflect the same canonical barber subtype." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleNotificationToggle(
    field: "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled",
    value: boolean
  ) {
    setFeedback(null);
    try {
      await mediaMutation.mutateAsync({
        action: "update_viewer_notification_preference",
        inAppEnabled: field === "inAppEnabled" ? value : notificationPreference?.inAppEnabled ?? true,
        smsEnabled: field === "smsEnabled" ? value : notificationPreference?.smsEnabled ?? false,
        emailEnabled: field === "emailEnabled" ? value : notificationPreference?.emailEnabled ?? true,
        pushEnabled: field === "pushEnabled" ? value : notificationPreference?.pushEnabled ?? true
      });
      setFeedback({ tone: "success", message: "Notification settings updated for this barber account." });
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to update notification settings right now.") });
    }
  }

  async function handleVerificationSubmit() {
    setFeedback(null);
    try {
      await uploadMutation.mutateAsync({
        ownerType: "barber",
        category: verificationCategory,
        fileName,
        contentType: "application/pdf",
        fileSizeBytes: 240_000,
        expiresAt: verificationCategory === "license_verification" && expirationDate ? expirationDate : undefined
      });
      await submitVerificationMutation.mutateAsync({
        category: verificationCategory,
        legalName,
        licenseType: verificationCategory === "license_verification" ? "State barber license" : undefined,
        licenseNumber: verificationCategory === "license_verification" ? licenseNumber : undefined,
        issuingState: verificationCategory === "license_verification" ? issuingState : undefined,
        expirationDate: verificationCategory === "license_verification" ? expirationDate : undefined
      });
      setFeedback({ tone: "success", message: "Verification upload submitted into the canonical trust review lane." });
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to submit verification right now.") });
    }
  }

  async function handleIdentityLaunch() {
    setFeedback(null);
    try {
      const result = await identitySessionMutation.mutateAsync();
      if (result.url && typeof window !== "undefined") {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setFeedback({
        tone: result.degraded ? "info" : "success",
        message: result.degraded
          ? "Identity verification started, but provider sync is degraded. The review lane is still open."
          : "Stripe Identity opened for this barber account."
      });
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to start identity verification right now.") });
    }
  }

  return (
    <div className="space-y-4" data-testid="barber-settings-screen">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      {trustQuery.error ? <FeedbackBanner tone="error" message={readableError(trustQuery.error, "Unable to load barber verification status right now.")} /> : null}
      {readinessQuery.error ? <FeedbackBanner tone="error" message={readableError(readinessQuery.error, "Unable to load payout readiness right now.")} /> : null}

      {!embedded ? (
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Settings</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">
                {user.name}
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
                Private account setup lives here: business model, verification, payout onboarding, notifications, support, and session controls.
              </p>
            </div>
            <div className="rounded-[24px] border border-[#7cff00]/16 bg-[#7cff00]/10 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Private setup</p>
              <p className="mt-2 text-sm font-medium text-white">
                {formatStatusLabel(user.appApprovalStatus)}
              </p>
              <p className="mt-1 text-sm text-white/58">
                {formatStatusLabel(readinessQuery.data?.connectedAccount.operationalStatus)}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="#barber-settings-account" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
              Account
            </Link>
            <Link href="#barber-settings-business" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
              Business model
            </Link>
            <Link href="#barber-settings-verification" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
              Verification
            </Link>
            <Link href="#barber-settings-payouts" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
              Payouts
            </Link>
            <Link href="#barber-settings-support" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
              Support
            </Link>
          </div>
        </Card>
      ) : null}

      <section id="barber-settings-account" className="grid scroll-mt-6 gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Account settings</p>
              <p className="mt-2 text-sm text-white/58">
                Identity, communication posture, and private account details stay here instead of leaking into the public barber profile.
              </p>
            </div>
            <Building2 className="h-5 w-5 text-[#baff69]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Name</p>
              <p className="mt-3 text-lg font-semibold text-white">{user.name}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Email</p>
              <p className="mt-3 text-lg font-semibold text-white">{user.email}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Phone</p>
              <p className="mt-3 text-lg font-semibold text-white">{user.phone ?? "No phone on file"}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Approval</p>
              <p className="mt-3 text-lg font-semibold text-white">{formatStatusLabel(user.appApprovalStatus)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <BellRing className="h-4 w-4 text-[#d7ffab]" />
              Notifications
            </div>
            <div className="mt-4 grid gap-3">
              {[
                { key: "inAppEnabled", label: "In-app alerts" },
                { key: "emailEnabled", label: "Email alerts" },
                { key: "smsEnabled", label: "SMS updates" },
                { key: "pushEnabled", label: "Push notifications" }
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
            <p className="mt-4 text-sm text-white/52">
              Password and security recovery continue through the shared login and reset-password flow.
            </p>
          </div>
        </Card>

        <AccountSessionWorkspace user={user} />
      </section>

      <Card id="barber-settings-business" className="rounded-[32px] scroll-mt-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="surface-label">Business model</p>
            <p className="mt-2 text-sm text-white/58">
              Compensation posture stays private because it affects payout routing, discovery posture, and business controls.
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 text-[#baff69]" />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {subtypeOptions.map((option) => (
            <button
              key={option.subtype}
              type="button"
              onClick={() => setSelectedSubtype(option.subtype)}
              className={`rounded-[22px] border p-4 text-left transition ${selectedSubtype === option.subtype ? "border-[#7cff00]/24 bg-[#7cff00]/10 text-white" : "border-white/8 bg-black/18 text-white/72 hover:border-[#7cff00]/18 hover:text-white"}`}
            >
              <p className="text-base font-semibold">{option.label}</p>
              <p className="mt-2 text-sm leading-6 text-white/58">{option.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/58">
            Current saved subtype: {subtypeOptions.find((option) => option.subtype === (user.barberSubtype ?? selectedSubtype))?.label ?? "Not set"}
          </p>
          <Button type="button" className="h-11 px-4" disabled={saveSubtypeMutation.isPending} onClick={() => void handleSaveSubtype()}>
            {saveSubtypeMutation.isPending ? "Saving..." : "Save business model"}
          </Button>
        </div>
      </Card>

      <section id="barber-settings-verification" className="grid scroll-mt-6 gap-4 lg:grid-cols-[0.94fr_1.06fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Verification and compliance</p>
              <p className="mt-2 text-sm text-white/58">
                License, identity, approval, and trust badge posture live here with the canonical trust service only.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#d7ffab]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-[#7cff00]/18 bg-[#7cff00]/8 p-4">
              <p className="surface-label text-[#d7ffab]">Overall status</p>
              <p className="mt-3 text-2xl font-semibold text-white">{formatStatusLabel(verificationProfile?.overallStatus ?? trustQuery.data?.canonicalOverallStatus)}</p>
              <p className="mt-2 text-sm text-white/62">
                {verificationDecision?.gates.badge?.allowed ? "Public trust signals are eligible to show." : verificationDecision?.gates.badge?.reasons?.[0] ?? "Verification posture is still building."}
              </p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Current requirements</p>
              <div className="mt-3 space-y-2 text-sm text-white/58">
                {verificationProfile?.currentRequirements.length
                  ? verificationProfile.currentRequirements.map((item) => <p key={item}>- {item}</p>)
                  : <p>No current requirements are blocking this barber account.</p>}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">Provider verification</p>
            <div className="mt-3 space-y-3">
              {verificationProfile?.providerStatuses.length ? verificationProfile.providerStatuses.map((provider) => (
                <div key={provider.id} className="rounded-[18px] border border-white/8 bg-black/18 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{provider.providerSubject.replaceAll("_", " ")}</p>
                    {provider.providerStatus ? <span className="status-pill text-white/72">{provider.providerStatus.replaceAll("_", " ")}</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-white/58">{provider.summary}</p>
                </div>
              )) : (
                <div className="rounded-[18px] border border-dashed border-white/10 bg-black/18 px-4 py-4 text-sm text-white/58">
                  Provider-linked verification statuses will show up here after identity or payout onboarding begins.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" className="h-11 px-4" disabled={identitySessionMutation.isPending} onClick={() => void handleIdentityLaunch()}>
              {identitySessionMutation.isPending ? "Opening identity..." : "Start identity review"}
            </Button>
            <Link href="/activation-status" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/20 hover:text-[#d7ffab] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
              View activation status
            </Link>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Secure verification upload</p>
              <p className="mt-2 text-sm text-white/58">
                Submit license or identity updates through the canonical trust path. No fake review state.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-2 block surface-label">Verification category</label>
              <Select value={verificationCategory} onChange={(event) => setVerificationCategory(event.target.value as typeof verificationCategory)}>
                <option value="license_verification">License verification</option>
                <option value="identity_verification">Identity verification</option>
                <option value="payout_verification">Payout verification</option>
                <option value="shop_affiliation_verification">Shop affiliation</option>
              </Select>
            </div>
            <div>
              <label className="mb-2 block surface-label">Legal name</label>
              <Input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block surface-label">Document name</label>
              <Input value={fileName} onChange={(event) => setFileName(event.target.value)} />
            </div>
            {verificationCategory === "license_verification" ? (
              <>
                <Input placeholder="License number" value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} />
                <Input placeholder="Issuing state" value={issuingState} onChange={(event) => setIssuingState(event.target.value)} />
                <Input type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} />
              </>
            ) : null}
            <Button type="button" className="h-11 w-full" disabled={uploadMutation.isPending || submitVerificationMutation.isPending} onClick={() => void handleVerificationSubmit()}>
              {uploadMutation.isPending || submitVerificationMutation.isPending ? "Submitting verification..." : "Upload and submit"}
            </Button>
          </div>
        </Card>
      </section>

      <div id="barber-settings-payouts" className="scroll-mt-6">
        <BarberFintechReadinessPanel />
      </div>

      <Card id="barber-settings-support" className="rounded-[32px] scroll-mt-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="surface-label">Support</p>
            <p className="mt-2 text-sm text-white/58">
              Keep verification, payout, and booking help easy to find without burying it in the operational tabs.
            </p>
          </div>
          <LifeBuoy className="h-5 w-5 text-[#baff69]" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/workspace/messages" className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/72 transition hover:border-[#7cff00]/20 hover:text-white">
            <p className="font-semibold text-white">Contact support</p>
            <p className="mt-2 leading-6 text-white/58">Open the shared support and messaging lane.</p>
          </Link>
          <Link href="/activation-status" className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/72 transition hover:border-[#7cff00]/20 hover:text-white">
            <p className="font-semibold text-white">Approval help</p>
            <p className="mt-2 leading-6 text-white/58">Review approval blockers and current activation requirements.</p>
          </Link>
          <Link href="/dashboard/barber/checkout" className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/72 transition hover:border-[#7cff00]/20 hover:text-white">
            <p className="font-semibold text-white">Payment issues</p>
            <p className="mt-2 leading-6 text-white/58">See payment state, paid tickets, and receipts tied to barber work.</p>
          </Link>
          <Link href="/dashboard/barber/calendar" className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/72 transition hover:border-[#7cff00]/20 hover:text-white">
            <p className="font-semibold text-white">Schedule issues</p>
            <p className="mt-2 leading-6 text-white/58">Jump back into availability, blocked time, and appointment timing.</p>
          </Link>
        </div>
      </Card>
    </div>
  );
}
