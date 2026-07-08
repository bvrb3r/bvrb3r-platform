"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, FileLock2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { DataStatCard, GlassCard } from "@/design/components";
import {
  useArchitectVerificationActionMutation,
  useArchitectVerificationDetailQuery,
  useVerificationDocumentSignedUrlMutation
} from "@/lib/platform-admin/client";
import { cn } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { ArchitectVerificationDetailPayload } from "@/types/platform-admin";

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function badgeClasses(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("approved") || normalized.includes("verified")) {
    return "border-[#C4F24E]/16 bg-[#C4F24E]/10 text-[#e4f9b8]";
  }

  if (normalized.includes("submitted") || normalized.includes("review") || normalized.includes("pending")) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  if (normalized.includes("rejected") || normalized.includes("needs") || normalized.includes("expired") || normalized.includes("suspended")) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }

  return "border-white/10 bg-black/20 text-white/72";
}

type PendingAction = {
  action: "approve" | "reject" | "request-update" | "suspend" | "reactivate";
  title: string;
  detail: string;
  confirmLabel: string;
  critical?: boolean;
};

export function ArchitectVerificationDetailWorkspace({
  profileId,
  initialData
}: {
  profileId: string;
  initialData: ArchitectVerificationDetailPayload;
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const query = useArchitectVerificationDetailQuery(profileId, initialData);
  const actionMutation = useArchitectVerificationActionMutation(profileId);
  const documentMutation = useVerificationDocumentSignedUrlMutation(profileId);
  const data = query.data ?? initialData;
  const profile = data.profile;

  const openDocument = async (documentId: string) => {
    try {
      const result = await documentMutation.mutateAsync(documentId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  };

  const confirmAction = async () => {
    if (!pendingAction) {
      return;
    }

    if (!reason.trim()) {
      setFeedback({ tone: "error", message: "A reason is required for every verification review action." });
      return;
    }

    try {
      await actionMutation.mutateAsync({
        action: pendingAction.action,
        input: {
          reason: reason.trim(),
          internalNotes: internalNotes.trim() || undefined
        }
      });
      setPendingAction(null);
      setReason("");
      setInternalNotes("");
      setFeedback({ tone: "success", message: `${pendingAction.confirmLabel} completed and logged.` });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  };

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <GlassCard className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/architect/verifications" className="inline-flex items-center gap-2 text-sm text-white/62 transition hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                Back to verification queue
              </Link>
              <h1 className="mt-4 text-3xl font-semibold sm:text-5xl" data-display="true">Verification Detail</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
                Review the canonical verification profile, inspect document metadata, and take founder-only action without exposing raw storage paths or rewriting financial truth.
              </p>
            </div>
            {profile ? (
              <div className="grid gap-3 sm:min-w-[18rem]">
                <DataStatCard
                  label="Current status"
                  value={(
                    <div className="flex flex-wrap gap-2">
                      <span className={cn("status-pill", badgeClasses(profile.canonicalOverallStatus))}>{formatLabel(profile.canonicalOverallStatus)}</span>
                      <span className="status-pill text-white/72">{formatLabel(profile.role)}</span>
                    </div>
                  )}
                  className="border-[#C4F24E]/28 bg-[#C4F24E]/8"
                />
                {profile.userId ? (
                  <Link href={`/architect/users/${profile.userId}`}>
                    <Button type="button" variant="secondary" className="w-full rounded-2xl">
                      Open Account Debug
                    </Button>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </GlassCard>

        {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
        {query.error ? <FeedbackBanner tone="error" message={query.error.message} /> : null}
        {data.warnings.length ? (
          <GlassCard className="border-amber-300/18 bg-amber-300/8 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-100" />
              <div className="space-y-1 text-sm leading-6 text-white/72">
                {data.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            </div>
          </GlassCard>
        ) : null}

        {!profile ? (
          <GlassCard className="p-6">
            <p className="surface-label">Verification profile unavailable</p>
            <p className="mt-3 text-sm leading-7 text-white/58">
              This verification detail view could not be resolved. If the verification tables are still being rolled out, the queue may be operating in a fallback mode until upstream data becomes available again.
            </p>
          </GlassCard>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="rounded-[30px] p-6">
                <p className="surface-label">Summary</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <p className="surface-label">Subject</p>
                    <p className="mt-3 text-lg font-semibold text-white">{profile.subjectName}</p>
                    <p className="mt-2 text-sm text-white/58">{profile.subjectEmail ?? "No email on file"}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <p className="surface-label">Identifiers</p>
                    <p className="mt-3 text-sm text-white/62">Profile {profile.profileId}</p>
                    <p className="mt-1 text-sm text-white/62">User {profile.userId ?? "Not linked yet"}</p>
                    {profile.barberId ? <p className="mt-1 text-sm text-white/62">Barber {profile.barberId}</p> : null}
                    {profile.shopId ? <p className="mt-1 text-sm text-white/62">Shop {profile.shopId}</p> : null}
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <p className="surface-label">Eligibility</p>
                    <p className="mt-3 text-sm text-white/62">Public {profile.publicVerified ? "enabled" : "locked"}</p>
                    <p className="mt-1 text-sm text-white/62">Bookings {profile.canAcceptBookings ? "enabled" : "locked"}</p>
                    <p className="mt-1 text-sm text-white/62">Payouts {profile.canReceivePayouts ? "enabled" : "locked"}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <p className="surface-label">Review timing</p>
                    <p className="mt-3 text-sm text-white/62">Submitted {formatDateTime(profile.submittedAt)}</p>
                    <p className="mt-1 text-sm text-white/62">Last reviewed {formatDateTime(profile.lastReviewedAt)}</p>
                    <p className="mt-1 text-sm text-white/62">Updated {formatDateTime(profile.updatedAt)}</p>
                  </div>
                </div>
              </Card>

              <Card className="rounded-[30px] p-6">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[#d9f985]" />
                  <p className="surface-label">Review actions</p>
                </div>
                <div className="mt-4 grid gap-2">
                  <Button type="button" onClick={() => setPendingAction({ action: "approve", title: `Approve ${profile.subjectName}`, detail: "Use approval only when the subject is acceptable for this review lane and any provider-dependent readiness is already satisfied.", confirmLabel: "Approve verification" })}>Approve</Button>
                  <Button type="button" variant="secondary" onClick={() => setPendingAction({ action: "reject", title: `Reject ${profile.subjectName}`, detail: "Use rejection when the submission is invalid or cannot be approved in its current state.", confirmLabel: "Reject verification" })}>Reject</Button>
                  <Button type="button" variant="secondary" onClick={() => setPendingAction({ action: "request-update", title: `Request update from ${profile.subjectName}`, detail: "Use update requests when the subject needs to resubmit or clarify one or more verification items.", confirmLabel: "Request update" })}>Request update</Button>
                  <Button type="button" variant="secondary" onClick={() => setPendingAction({ action: "suspend", title: `Suspend ${profile.subjectName}`, detail: "Suspension is an explicit platform block. It disables public visibility, bookings, and payout eligibility in the canonical control profile.", confirmLabel: "Suspend verification", critical: true })}>Suspend</Button>
                  <Button type="button" variant="secondary" onClick={() => setPendingAction({ action: "reactivate", title: `Reactivate ${profile.subjectName}`, detail: "Reactivation clears suspension and recomputes eligibility from the current component statuses and provider truth.", confirmLabel: "Reactivate verification" })}>Reactivate</Button>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-[30px] p-6">
                <p className="surface-label">Verification status rail</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Identity", profile.identityStatus],
                    ["License", profile.licenseStatus],
                    ["Business", profile.businessStatus],
                    ["Payout", profile.payoutStatus],
                    ["Compliance", profile.complianceStatus]
                  ].map(([label, status]) => (
                    <div key={`${label}-${status}`} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                      <p className="surface-label">{label}</p>
                      <span className={cn("status-pill mt-3", badgeClasses(status))}>{formatLabel(status)}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[30px] p-6">
                <p className="surface-label">Current requirements</p>
                <div className="mt-4 space-y-3">
                  {profile.currentRequirements.length ? profile.currentRequirements.map((requirement) => (
                    <div key={requirement} className="rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm text-white/62">
                      {requirement}
                    </div>
                  )) : (
                    <div className="rounded-[20px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                      No open requirements are currently blocking this profile.
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {profile.barberDetail ? (
              <Card className="rounded-[30px] p-6">
                <p className="surface-label">Barber verification detail</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Legal name</p><p className="mt-3 text-sm text-white/62">{profile.barberDetail.legalName ?? "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">License type</p><p className="mt-3 text-sm text-white/62">{profile.barberDetail.professionalLicenseType ? formatLabel(profile.barberDetail.professionalLicenseType) : "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">License number</p><p className="mt-3 text-sm text-white/62">{profile.barberDetail.licenseNumber ?? "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Issuing state</p><p className="mt-3 text-sm text-white/62">{profile.barberDetail.issuingState ?? "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Expiration</p><p className="mt-3 text-sm text-white/62">{profile.barberDetail.expirationDate ?? "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Provider posture</p><p className="mt-3 text-sm text-white/62">{[profile.barberDetail.providerIdentityStatus, profile.barberDetail.providerConnectStatus].filter(Boolean).map((value) => formatLabel(value!)).join(" / ") || "No provider status recorded"}</p></div>
                </div>
              </Card>
            ) : null}

            {profile.shopDetail ? (
              <Card className="rounded-[30px] p-6">
                <p className="surface-label">Business verification detail</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Business name</p><p className="mt-3 text-sm text-white/62">{profile.shopDetail.businessName ?? "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">DBA</p><p className="mt-3 text-sm text-white/62">{profile.shopDetail.dbaName ?? "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">EIN last 4</p><p className="mt-3 text-sm text-white/62">{profile.shopDetail.einLast4 ?? "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Registration state</p><p className="mt-3 text-sm text-white/62">{profile.shopDetail.stateOfRegistration ?? "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Business license type</p><p className="mt-3 text-sm text-white/62">{profile.shopDetail.businessLicenseType ? formatLabel(profile.shopDetail.businessLicenseType) : "Not recorded"}</p></div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Shop license number</p><p className="mt-3 text-sm text-white/62">{profile.shopDetail.shopLicenseNumber ?? "Not recorded"}</p></div>
                </div>
              </Card>
            ) : null}

            <Card className="rounded-[30px] p-6">
              <p className="surface-label">Provider status</p>
              <div className="mt-4 grid gap-3">
                {profile.providerLinks.length ? profile.providerLinks.map((provider) => (
                  <div key={provider.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{formatLabel(provider.provider)}</p>
                      <span className="status-pill text-white/72">{formatLabel(provider.providerSubject)}</span>
                      {provider.providerStatus ? (
                        <span className={cn("status-pill", badgeClasses(provider.providerStatus))}>{formatLabel(provider.providerStatus)}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-white/68">{provider.summary}</p>
                    <p className="mt-2 text-sm text-white/58">Reference {provider.providerReferenceId}</p>
                    {provider.disabledReason ? (
                      <p className="mt-2 text-sm text-amber-200">Disabled reason: {provider.disabledReason}</p>
                    ) : null}
                    {provider.lastErrorReason ? (
                      <p className="mt-2 text-sm text-amber-200">Last provider error: {provider.lastErrorReason}</p>
                    ) : null}
                    {provider.remediationMessage ? (
                      <p className="mt-2 text-sm text-white/62">{provider.remediationMessage}</p>
                    ) : null}
                    {provider.requirementsPastDue.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {provider.requirementsPastDue.map((requirement) => (
                          <span key={`${provider.id}-${requirement}`} className="status-pill border-amber-300/20 bg-amber-300/10 text-amber-100">
                            Past due: {requirement}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {provider.requirementsCurrentlyDue.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {provider.requirementsCurrentlyDue.map((requirement) => (
                          <span key={`${provider.id}-current-${requirement}`} className="status-pill text-white/72">
                            Required: {requirement}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-2 text-sm text-white/62">Updated {formatDateTime(provider.updatedAt)}</p>
                  </div>
                )) : (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                    No provider-linked verification state has been recorded for this profile yet.
                  </div>
                )}
              </div>
            </Card>

            <Card className="rounded-[30px] p-6">
              <div className="flex items-center gap-2">
                <FileLock2 className="h-4 w-4 text-[#d9f985]" />
                <p className="surface-label">Verification documents</p>
              </div>
              <div className="mt-4 grid gap-3">
                {profile.documents.length ? profile.documents.map((document) => (
                  <div key={document.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">{document.fileName}</p>
                          <span className={cn("status-pill", badgeClasses(document.status ?? "submitted"))}>{formatLabel(document.status ?? "submitted")}</span>
                        </div>
                        <p className="mt-2 text-sm text-white/58">{document.documentType ? formatLabel(document.documentType) : formatLabel(document.legacyCategory)}</p>
                        <p className="mt-1 text-sm text-white/52">{document.mimeType ?? "Unknown file type"}{document.fileSizeBytes ? ` - ${document.fileSizeBytes.toLocaleString()} bytes` : ""}</p>
                      </div>
                      <Button type="button" variant="secondary" disabled={documentMutation.isPending} onClick={() => openDocument(document.id)}>
                        View file
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-white/62">Uploaded {formatDateTime(document.uploadedAt)}{document.expiresAt ? ` / Expires ${formatDateTime(document.expiresAt)}` : ""}</p>
                    <p className="mt-2 text-sm text-white/58">{document.reviewNotes ?? "No review notes recorded."}</p>
                  </div>
                )) : (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                    No verification documents are currently linked to this profile.
                  </div>
                )}
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-[30px] p-6">
                <p className="surface-label">Review timeline</p>
                <div className="mt-4 grid gap-3">
                  {profile.reviews.length ? profile.reviews.map((review) => (
                    <div key={review.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">{formatLabel(review.actionType)}</p>
                        <span className="status-pill text-white/72">{formatLabel(review.reviewType)}</span>
                      </div>
                      <p className="mt-2 text-sm text-white/58">{review.reviewerLabel} · {formatDateTime(review.createdAt)}</p>
                      <p className="mt-2 text-sm text-white/62">{review.reason ?? "No review reason recorded."}</p>
                      {review.internalNotes ? <p className="mt-2 text-sm text-white/52">{review.internalNotes}</p> : null}
                    </div>
                  )) : (
                    <div className="rounded-[20px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                      No verification review actions have been recorded yet.
                    </div>
                  )}
                </div>
              </Card>

              <Card className="rounded-[30px] p-6">
                <p className="surface-label">Architect audit trail</p>
                <div className="mt-4 grid gap-3">
                  {profile.auditTrail.length ? profile.auditTrail.map((entry) => (
                    <div key={entry.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">{formatLabel(entry.actionType)}</p>
                        <span className={cn("status-pill", badgeClasses(entry.actionClass))}>{formatLabel(entry.actionClass)}</span>
                      </div>
                      <p className="mt-2 text-sm text-white/58">{formatDateTime(entry.createdAt)}</p>
                      <p className="mt-2 text-sm text-white/62">{entry.note ?? "No reason recorded."}</p>
                    </div>
                  )) : (
                    <div className="rounded-[20px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                      No architect audit entries are linked to this verification profile yet.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-3 py-3 sm:items-center sm:px-6">
          <div className="w-full max-w-2xl rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.98))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="surface-label">Confirm verification action</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">{pendingAction.title}</h2>
              </div>
              <span className={cn("status-pill", pendingAction.critical ? "border-rose-400/20 bg-rose-400/10 text-rose-100" : "border-amber-300/20 bg-amber-300/10 text-amber-100")}>
                {pendingAction.critical ? "Critical" : "Sensitive"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/62">{pendingAction.detail}</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block surface-label">Reason</label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  placeholder="Why is this action necessary?"
                  className="min-h-[7rem] w-full rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 py-4 text-sm text-[#f5f1e8] outline-none transition placeholder:text-white/32 focus:border-[#C4F24E]/55 focus:shadow-[0_0_0_4px_rgba(196, 242, 78,0.10)]"
                />
              </div>
              <div>
                <label className="mb-2 block surface-label">Internal notes</label>
                <textarea
                  value={internalNotes}
                  onChange={(event) => setInternalNotes(event.target.value)}
                  rows={3}
                  placeholder="Optional context for internal review history."
                  className="min-h-[6rem] w-full rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 py-4 text-sm text-[#f5f1e8] outline-none transition placeholder:text-white/32 focus:border-[#C4F24E]/55 focus:shadow-[0_0_0_4px_rgba(196, 242, 78,0.10)]"
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" className="min-w-[10rem]" disabled={actionMutation.isPending} onClick={confirmAction}>
                {actionMutation.isPending ? "Applying..." : pendingAction.confirmLabel}
              </Button>
              <Button type="button" variant="secondary" className="min-w-[8rem]" disabled={actionMutation.isPending} onClick={() => {
                setPendingAction(null);
                setReason("");
                setInternalNotes("");
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
