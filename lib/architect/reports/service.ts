import { randomUUID } from "node:crypto";
import { CANONICAL_PLATFORM_ADMIN_EMAIL } from "@/lib/auth/demo-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ArchitectActor } from "@/lib/architect/debug/types";
import type { Role } from "@/types/domain";
import type { SafetyReportCategory, SafetyReportStatus, SafetyReportSubjectType } from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type ArchitectReportActionStatus = "received" | "under_review" | "resolved" | "dismissed";

type SafetyReportRow = {
  id: string;
  reporter_role: Role | null;
  reporter_reference: string | null;
  reporter_email: string | null;
  subject_type: SafetyReportSubjectType | null;
  subject_reference: string | null;
  category: SafetyReportCategory | null;
  details: string | null;
  status: SafetyReportStatus | string | null;
  location_reference: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ReportEventRow = {
  id: string;
  report_reference: string | null;
  actor_role: Role | null;
  actor_reference: string | null;
  action_label: string | null;
  notes: string | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
};

type ClientRow = {
  id: string;
  profile_id: string | null;
};

type BarberRow = {
  id: string;
  profile_id: string;
  reference_code: string | null;
  booking_slug: string | null;
};

type BarberPublicProfileRow = {
  barber_reference: string;
  username: string | null;
  display_name: string | null;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
};

type ThreadRow = {
  id: string;
  thread_type: string;
  updated_at: string | null;
};

type ThreadParticipantRow = {
  thread_id: string;
  profile_id: string;
};

export type ArchitectReportSummary = {
  total: number;
  received: number;
  underReview: number;
  resolved: number;
  dismissed: number;
};

export type ArchitectReportView = {
  id: string;
  concernType: string;
  targetType: SafetyReportSubjectType | string;
  targetId: string;
  targetName: string;
  targetHref: string | null;
  reporterName: string;
  reporterId: string | null;
  reporterEmail: string | null;
  reporterSupportThreadId: string | null;
  reporterSupportThreadHref: string | null;
  status: ArchitectReportActionStatus | string;
  dbStatus: string;
  notesPreview: string;
  details: string;
  severity: "low" | "medium" | "high";
  locationReference: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArchitectReportEventView = {
  id: string;
  reportId: string;
  actorRole: Role | string;
  actorReference: string | null;
  actionLabel: string;
  notes: string | null;
  createdAt: string;
};

export type ArchitectReportsPayload = {
  available: boolean;
  viewer: {
    profileId: string;
    fullName: string;
    role: Role;
  };
  summary: ArchitectReportSummary;
  reports: ArchitectReportView[];
};

export type ArchitectReportDetailPayload = {
  available: boolean;
  viewer: ArchitectReportsPayload["viewer"];
  report: ArchitectReportView | null;
  events: ArchitectReportEventView[];
};

export type ArchitectReportStatusUpdatePayload = ArchitectReportDetailPayload & {
  ok: true;
};

export class ArchitectReportsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getSupabase() {
  return createSupabaseAdminClient();
}

function mapDbStatusToView(status: string | null | undefined): ArchitectReportActionStatus | string {
  if (!status || status === "open") return "received";
  if (status === "under_review") return "under_review";
  if (status === "resolved") return "resolved";
  if (status === "dismissed") return "dismissed";
  return status;
}

function mapViewStatusToDb(status: ArchitectReportActionStatus): SafetyReportStatus {
  if (status === "received") return "open";
  return status;
}

function actionLabelForStatus(status: ArchitectReportActionStatus) {
  switch (status) {
    case "received":
      return "Report marked received";
    case "under_review":
      return "Report marked under review";
    case "resolved":
      return "Report resolved";
    case "dismissed":
      return "Report dismissed";
  }
}

function formatConcern(value: string | null | undefined) {
  return (value ?? "unknown")
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function truncate(value: string | null | undefined, maxLength: number) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "No notes provided.";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function severityForCategory(category: string | null | undefined): ArchitectReportView["severity"] {
  if (category === "unsafe_conduct" || category === "harassment" || category === "fraud") {
    return "high";
  }
  if (category === "fake_profile" || category === "fake_review" || category === "payment_dispute") {
    return "medium";
  }
  return "low";
}

function viewerForActor(actor: ArchitectActor): ArchitectReportsPayload["viewer"] {
  return {
    profileId: actor.id,
    fullName: actor.name,
    role: actor.role
  };
}

async function readProfileById(supabase: SupabaseClient, profileId: string) {
  const result = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", profileId)
    .maybeSingle();

  if (result.error) {
    throw new ArchitectReportsError("Unable to resolve report profile context.", 500);
  }

  return result.data as ProfileRow | null;
}

async function readClientReporterProfile(supabase: SupabaseClient, reporterReference: string | null, reporterEmail: string | null) {
  if (reporterReference) {
    const clientResult = await supabase
      .from("clients")
      .select("id, profile_id")
      .eq("id", reporterReference)
      .maybeSingle();

    if (clientResult.error) {
      throw new ArchitectReportsError("Unable to resolve the reporting client.", 500);
    }

    const client = clientResult.data as ClientRow | null;
    if (client?.profile_id) {
      const profile = await readProfileById(supabase, client.profile_id);
      if (profile) return profile;
    }
  }

  if (!reporterEmail) {
    return null;
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("email", reporterEmail)
    .maybeSingle();

  if (profileResult.error) {
    throw new ArchitectReportsError("Unable to resolve the reporting profile.", 500);
  }

  return profileResult.data as ProfileRow | null;
}

async function readSupportProfile(supabase: SupabaseClient) {
  const canonicalResult = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("role", "platform_admin")
    .eq("email", CANONICAL_PLATFORM_ADMIN_EMAIL)
    .maybeSingle();

  if (canonicalResult.error) {
    throw new ArchitectReportsError("Unable to resolve the support profile.", 500);
  }

  if (canonicalResult.data) {
    return canonicalResult.data as ProfileRow;
  }

  const fallbackResult = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("role", "platform_admin")
    .order("full_name")
    .limit(1)
    .maybeSingle();

  if (fallbackResult.error) {
    throw new ArchitectReportsError("Unable to resolve the support profile.", 500);
  }

  return fallbackResult.data as ProfileRow | null;
}

async function readSupportThreadIdForReporter(supabase: SupabaseClient, reporterProfile: ProfileRow | null) {
  if (!reporterProfile) {
    return null;
  }

  const supportProfile = await readSupportProfile(supabase);
  if (!supportProfile) {
    return null;
  }

  const [reporterThreadsResult, supportThreadsResult] = await Promise.all([
    supabase
      .from("thread_participants")
      .select("thread_id, profile_id")
      .eq("profile_id", reporterProfile.id),
    supabase
      .from("thread_participants")
      .select("thread_id, profile_id")
      .eq("profile_id", supportProfile.id)
  ]);

  if (reporterThreadsResult.error || supportThreadsResult.error) {
    throw new ArchitectReportsError("Unable to resolve report support thread.", 500);
  }

  const reporterThreadIds = new Set(((reporterThreadsResult.data ?? []) as ThreadParticipantRow[]).map((row) => row.thread_id));
  const sharedIds = ((supportThreadsResult.data ?? []) as ThreadParticipantRow[])
    .map((row) => row.thread_id)
    .filter((threadId) => reporterThreadIds.has(threadId));

  if (!sharedIds.length) {
    return null;
  }

  const threadResult = await supabase
    .from("message_threads")
    .select("id, thread_type, updated_at")
    .in("id", sharedIds)
    .eq("thread_type", "support")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (threadResult.error) {
    throw new ArchitectReportsError("Unable to resolve report support conversation.", 500);
  }

  const thread = ((threadResult.data ?? []) as ThreadRow[])[0] ?? null;
  return thread?.id ?? null;
}

async function resolveBarberTarget(supabase: SupabaseClient, subjectId: string) {
  const lookupColumns: Array<"id" | "reference_code" | "booking_slug" | "profile_id"> = [
    "id",
    "reference_code",
    "booking_slug",
    "profile_id"
  ];
  let barber: BarberRow | null = null;

  for (const column of lookupColumns) {
    const result = await supabase
      .from("barbers")
      .select("id, profile_id, reference_code, booking_slug")
      .eq(column, subjectId)
      .maybeSingle();

    if (result.error) {
      throw new ArchitectReportsError("Unable to resolve reported barber.", 500);
    }

    if (result.data) {
      barber = result.data as BarberRow;
      break;
    }
  }

  if (!barber) {
    return {
      name: subjectId,
      href: null
    };
  }

  const [profile, publicProfilesResult] = await Promise.all([
    readProfileById(supabase, barber.profile_id),
    supabase
      .from("barber_profiles")
      .select("barber_reference, username, display_name")
      .in("barber_reference", [barber.reference_code, barber.booking_slug, barber.id, barber.profile_id].filter(Boolean))
  ]);

  if (publicProfilesResult.error) {
    throw new ArchitectReportsError("Unable to resolve reported barber public profile.", 500);
  }

  const publicProfile = ((publicProfilesResult.data ?? []) as BarberPublicProfileRow[])[0] ?? null;
  const slug = publicProfile?.username ?? barber.booking_slug ?? barber.reference_code ?? barber.id;

  return {
    name: publicProfile?.display_name ?? profile?.full_name ?? profile?.email ?? barber.reference_code ?? barber.id,
    href: `/barber/${encodeURIComponent(slug)}`
  };
}

async function resolveShopTarget(supabase: SupabaseClient, subjectId: string) {
  const lookupColumns: Array<"id" | "reference_code"> = ["id", "reference_code"];
  for (const column of lookupColumns) {
    const result = await supabase
      .from("locations")
      .select("id, reference_code, name, city, state")
      .eq(column, subjectId)
      .maybeSingle();

    if (result.error) {
      throw new ArchitectReportsError("Unable to resolve reported shop.", 500);
    }

    const location = result.data as LocationRow | null;
    if (location) {
      return {
        name: location.name ?? subjectId,
        href: `/shop/${encodeURIComponent(location.reference_code ?? location.id)}`
      };
    }
  }

  return {
    name: subjectId,
    href: null
  };
}

async function resolveTarget(supabase: SupabaseClient, report: SafetyReportRow) {
  const subjectId = report.subject_reference ?? "unknown";
  if (report.subject_type === "barber") {
    return resolveBarberTarget(supabase, subjectId);
  }

  if (report.subject_type === "shop") {
    return resolveShopTarget(supabase, subjectId);
  }

  if (report.subject_type === "client") {
    const profile = await readClientReporterProfile(supabase, subjectId, null);
    return {
      name: profile?.full_name ?? profile?.email ?? subjectId,
      href: null
    };
  }

  return {
    name: subjectId,
    href: null
  };
}

async function toReportView(supabase: SupabaseClient, report: SafetyReportRow): Promise<ArchitectReportView> {
  const [target, reporterProfile] = await Promise.all([
    resolveTarget(supabase, report),
    readClientReporterProfile(supabase, report.reporter_reference, report.reporter_email)
  ]);
  const supportThreadId = await readSupportThreadIdForReporter(supabase, reporterProfile);
  const dbStatus = report.status ?? "open";

  return {
    id: report.id,
    concernType: formatConcern(report.category),
    targetType: report.subject_type ?? "unknown",
    targetId: report.subject_reference ?? "unknown",
    targetName: target.name,
    targetHref: target.href,
    reporterName: reporterProfile?.full_name ?? reporterProfile?.email ?? report.reporter_email ?? report.reporter_reference ?? "Unknown reporter",
    reporterId: report.reporter_reference,
    reporterEmail: report.reporter_email,
    reporterSupportThreadId: supportThreadId,
    reporterSupportThreadHref: supportThreadId ? `/architect/messages?threadId=${encodeURIComponent(supportThreadId)}` : null,
    status: mapDbStatusToView(dbStatus),
    dbStatus,
    notesPreview: truncate(report.details, 140),
    details: report.details ?? "",
    severity: severityForCategory(report.category),
    locationReference: report.location_reference,
    createdAt: report.created_at ?? new Date(0).toISOString(),
    updatedAt: report.updated_at ?? report.created_at ?? new Date(0).toISOString()
  };
}

function buildSummary(reports: ArchitectReportView[]): ArchitectReportSummary {
  return {
    total: reports.length,
    received: reports.filter((report) => report.status === "received").length,
    underReview: reports.filter((report) => report.status === "under_review").length,
    resolved: reports.filter((report) => report.status === "resolved").length,
    dismissed: reports.filter((report) => report.status === "dismissed").length
  };
}

export async function listArchitectReports(actor: ArchitectActor): Promise<ArchitectReportsPayload> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      available: false,
      viewer: viewerForActor(actor),
      summary: { total: 0, received: 0, underReview: 0, resolved: 0, dismissed: 0 },
      reports: []
    };
  }

  const reportsResult = await supabase
    .from("safety_reports")
    .select("id, reporter_role, reporter_reference, reporter_email, subject_type, subject_reference, category, details, status, location_reference, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (reportsResult.error) {
    throw new ArchitectReportsError("Unable to load trust reports.", 500);
  }

  const reports = await Promise.all(((reportsResult.data ?? []) as SafetyReportRow[]).map((report) => toReportView(supabase, report)));
  return {
    available: true,
    viewer: viewerForActor(actor),
    summary: buildSummary(reports),
    reports
  };
}

async function readReportById(supabase: SupabaseClient, reportId: string) {
  const result = await supabase
    .from("safety_reports")
    .select("id, reporter_role, reporter_reference, reporter_email, subject_type, subject_reference, category, details, status, location_reference, created_at, updated_at")
    .eq("id", reportId)
    .maybeSingle();

  if (result.error) {
    throw new ArchitectReportsError("Unable to load the trust report.", 500);
  }

  return result.data as SafetyReportRow | null;
}

async function readReportEvents(supabase: SupabaseClient, reportId: string): Promise<ArchitectReportEventView[]> {
  const eventsResult = await supabase
    .from("report_events")
    .select("id, report_reference, actor_role, actor_reference, action_label, notes, created_at")
    .eq("report_reference", reportId)
    .order("created_at", { ascending: false });

  if (eventsResult.error) {
    throw new ArchitectReportsError("Unable to load report event history.", 500);
  }

  return ((eventsResult.data ?? []) as ReportEventRow[]).map((event) => ({
    id: event.id,
    reportId: event.report_reference ?? reportId,
    actorRole: event.actor_role ?? "platform_admin",
    actorReference: event.actor_reference,
    actionLabel: event.action_label ?? "Report event",
    notes: event.notes,
    createdAt: event.created_at ?? new Date(0).toISOString()
  }));
}

export async function getArchitectReportDetail(actor: ArchitectActor, reportId: string): Promise<ArchitectReportDetailPayload> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      available: false,
      viewer: viewerForActor(actor),
      report: null,
      events: []
    };
  }

  const report = await readReportById(supabase, reportId);
  if (!report) {
    throw new ArchitectReportsError("Trust report not found.", 404);
  }

  const [reportView, events] = await Promise.all([
    toReportView(supabase, report),
    readReportEvents(supabase, reportId)
  ]);

  return {
    available: true,
    viewer: viewerForActor(actor),
    report: reportView,
    events
  };
}

export async function updateArchitectReportStatus(
  actor: ArchitectActor,
  reportId: string,
  status: ArchitectReportActionStatus
): Promise<ArchitectReportStatusUpdatePayload> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new ArchitectReportsError("Reports are available when Supabase is configured.", 503);
  }

  const existing = await readReportById(supabase, reportId);
  if (!existing) {
    throw new ArchitectReportsError("Trust report not found.", 404);
  }

  const nowIso = new Date().toISOString();
  const dbStatus = mapViewStatusToDb(status);
  const updateResult = await supabase
    .from("safety_reports")
    .update({
      status: dbStatus,
      updated_at: nowIso
    })
    .eq("id", reportId);

  if (updateResult.error) {
    throw new ArchitectReportsError("Unable to update the trust report status.", 500);
  }

  const eventResult = await supabase
    .from("report_events")
    .insert({
      id: `report-event-${randomUUID()}`,
      report_reference: reportId,
      actor_role: actor.role,
      actor_reference: actor.id,
      action_label: actionLabelForStatus(status),
      notes: null,
      created_at: nowIso
    });

  if (eventResult.error) {
    throw new ArchitectReportsError("Report status changed, but event history could not be written.", 500);
  }

  return {
    ok: true,
    ...(await getArchitectReportDetail(actor, reportId))
  };
}
