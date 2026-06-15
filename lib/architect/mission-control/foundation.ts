import type {
  ActionRegistryEntry,
  ArchitectIncident,
  ArchitectMissionIncidentType,
  CodexFailureClass,
  CoreLoopValidator,
  HiveAgentEntry,
  MissionControlFoundation,
  MissionControlLane,
  MissionControlStatus,
  MissionDepartment,
  MissionDepartmentLane,
  MissionEvidenceCard,
  MissionIncidentDefinition,
  MissionLaneId,
  MissionSeverity,
  SourceVaultEntry
} from "@/lib/architect/mission-control/types";

type BooleanCheck = {
  label: string;
  passed?: boolean;
  evidenceWhenPass: string;
  evidenceWhenFail: string;
  evidenceWhenMissing: string;
};

type CoreLoopFixture = {
  cultureSocial?: {
    publicPostsExist?: boolean;
    authorIdentityHydrates?: boolean;
    commentsRouteExists?: boolean;
    commentPreviewExists?: boolean;
    engagementActionsExist?: boolean;
    bookCtaExistsForBookableBarber?: boolean;
  };
  cultureBooking?: {
    bookingCtaUrlHasAttribution?: boolean;
    bookingFormAcceptsAttribution?: boolean;
    appointmentCreatedThroughBooking?: boolean;
    appointmentAppearsOnBarberCalendar?: boolean;
    regressionTestExists?: boolean;
  };
  bookingAvailability?: {
    selectedBarberResolves?: boolean;
    selectedServiceResolves?: boolean;
    canonicalLocationResolves?: boolean;
    availabilityRulesGenerateSlots?: boolean;
    noAppointmentBeforeFinalConfirm?: boolean;
  };
  barberCalendar?: {
    appointmentAppearsOnCommandCalendar?: boolean;
    barberCanCompleteOwnService?: boolean;
    ownerCannotCompleteBarberService?: boolean;
  };
  shopRelationship?: {
    ownerInviteCanExist?: boolean;
    barberCanAccept?: boolean;
    activeRelationshipAppearsInOwnerHome?: boolean;
    pendingInvitesExcludedFromActiveCount?: boolean;
    acceptedBarberAppearsInScoreboard?: boolean;
    profileRoleRemainsBarberUser?: boolean;
  };
  ownerCommandCalendar?: {
    activeBarbersFromRelationships?: boolean;
    pendingInvitesExcluded?: boolean;
    shopProductionUsesShopContext?: boolean;
    ownerTimelineShopWide?: boolean;
    ownerCompleteServiceHidden?: boolean;
  };
  paymentRouting?: {
    appointmentExists?: boolean;
    paymentExists?: boolean;
    statusHistoryExists?: boolean;
    routingExistsOrClearFailure?: boolean;
    noPayoutBeforeCompletion?: boolean;
  };
};

export const MISSION_CONTROL_LANES: MissionControlLane[] = [
  { id: "ceo", label: "CEO", href: "/architect/ceo", purpose: "Global platform truth, risks, and executive decisions." },
  { id: "product", label: "Product", href: "/architect/product", purpose: "Client, Barber, Owner, Culture, and booking readiness." },
  { id: "technology", label: "Technology", href: "/architect/technology", purpose: "Deployments, tests, APIs, database health, and schema constraints." },
  { id: "operations", label: "Operations", href: "/architect/operations", purpose: "Appointments, calendars, shop relationships, kiosks, and command calendars." },
  { id: "finance", label: "Finance", href: "/architect/finance", purpose: "Payments, routing, payout readiness, fees, and money-risk posture." },
  { id: "marketing", label: "Marketing", href: "/architect/marketing", purpose: "Culture demand, attribution, referrals, and campaign readiness." },
  { id: "compliance", label: "Compliance", href: "/architect/compliance", purpose: "Verification, consent, integrity, trust gates, and policy visibility." },
  { id: "security", label: "Security", href: "/architect/security", purpose: "Role access, route protection, unsafe action prevention, and audit coverage." },
  { id: "content_community", label: "Content & Community", href: "/architect/content-community", purpose: "Culture moderation, reports, comments, creators, and community health." }
];

export const SOURCE_VAULT_REGISTRY: SourceVaultEntry[] = [
  { id: "platform-blueprint", sourceName: "Platform Blueprint", category: "Blueprint", purpose: "Anchor product systems and role boundaries.", linkedSystemArea: "Global architecture", status: "Active", ingestionStatus: "registered, not ingested" },
  { id: "supabase-master-truth", sourceName: "Supabase Master Truth", category: "Database", purpose: "Define canonical tables, constraints, and read models.", linkedSystemArea: "Technology", status: "Needs Review", ingestionStatus: "registered, not ingested" },
  { id: "app-master-build-logic", sourceName: "App Master Build Logic", category: "Build logic", purpose: "Map app loops to implementation rules.", linkedSystemArea: "Product", status: "Active", ingestionStatus: "registered, not ingested" },
  { id: "culture-feed-plan", sourceName: "Culture Feed Plan", category: "Culture", purpose: "Govern social feed, engagement, comments, and booking attribution.", linkedSystemArea: "Marketing", status: "Active", ingestionStatus: "registered, not ingested" },
  { id: "kiosk-plan", sourceName: "Kiosk Plan", category: "Operations", purpose: "Track front-door shop mode readiness.", linkedSystemArea: "Operations", status: "Needs Review", ingestionStatus: "registered, not ingested" },
  { id: "money-flow", sourceName: "Money Flow", category: "Finance", purpose: "Define payment, routing, payout, refund, and risk rules.", linkedSystemArea: "Finance", status: "Active", ingestionStatus: "registered, not ingested" },
  { id: "role-completion-map", sourceName: "Role Completion Map", category: "Roles", purpose: "Track role activation and completion gates.", linkedSystemArea: "Product", status: "Needs Review", ingestionStatus: "registered, not ingested" },
  { id: "architect-super-master-plan", sourceName: "Architect Super Master Plan", category: "Architect", purpose: "Define Mission Control, agents, vaults, and executive decision posture.", linkedSystemArea: "CEO", status: "Active", ingestionStatus: "registered, not ingested" },
  { id: "barber-master-plan", sourceName: "Barber Master Plan / BARB3R doctrine", category: "Barber", purpose: "Govern chair command, barber growth, and service operations.", linkedSystemArea: "Operations", status: "Needs Review", ingestionStatus: "registered, not ingested" },
  { id: "design-master-plan", sourceName: "Design Master Plan", category: "Design", purpose: "Keep Architect internal, technical, and evidence-backed.", linkedSystemArea: "Product", status: "Needs Review", ingestionStatus: "registered, not ingested" },
  { id: "debugging-doctrine", sourceName: "Debugging Doctrine", category: "Debug", purpose: "Codify safe diagnosis, repair boundaries, and validation packets.", linkedSystemArea: "Technology", status: "Active", ingestionStatus: "registered, not ingested" }
];

export const ACTION_REGISTRY: ActionRegistryEntry[] = [
  { id: "inspect-booking", label: "Inspect booking", riskClass: "Safe read-only", department: "Operations", description: "Read booking state and related appointment evidence.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-appointment", label: "Inspect appointment", riskClass: "Safe read-only", department: "Operations", description: "Read appointment, service, calendar, and status-history evidence.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-payment", label: "Inspect payment", riskClass: "Safe read-only", department: "Finance", description: "Read payment and routing evidence without money mutation.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-shop-relationship", label: "Inspect shop relationship", riskClass: "Safe read-only", department: "Operations", description: "Read shop/barber relationship and owner-home sync evidence.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-culture-post", label: "Inspect Culture post", riskClass: "Safe read-only", department: "Content & Community", description: "Read public Culture post, author, engagement, and report evidence.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-deployment-status", label: "Inspect deployment status", riskClass: "Safe read-only", department: "Technology", description: "Read deployment fingerprint and regression posture.", allowed: true, approvalRequired: false, status: "Needs Review" },
  { id: "inspect-regression-status", label: "Inspect regression status", riskClass: "Safe read-only", department: "Technology", description: "Read known regression coverage without claiming health from absence of data.", allowed: true, approvalRequired: false, status: "Needs Review" },
  { id: "generate-codex-packet", label: "Generate Codex packet", riskClass: "Safe low-risk", department: "Technology", description: "Draft a patch packet with symptom, evidence, files, tests, and no-touch rules.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "generate-sql-diagnostic", label: "Generate SQL diagnostic snippet", riskClass: "Safe low-risk", department: "Technology", description: "Draft read-only SQL diagnostics for Architect review.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "validate-production-health", label: "Validate production health", riskClass: "Safe low-risk", department: "CEO", description: "Run read-only validators and persist validation evidence when supported.", allowed: true, approvalRequired: false, status: "Needs Review" },
  { id: "repair-missing-routing", label: "Repair missing routing", riskClass: "Needs approval", department: "Finance", description: "Repair a missing routing ledger only through guarded, schema-aware code paths.", allowed: true, approvalRequired: true, status: "Warning" },
  { id: "repair-status-history", label: "Repair missing status history", riskClass: "Needs approval", department: "Operations", description: "Repair lifecycle history only after appointment truth is confirmed.", allowed: false, approvalRequired: true, status: "Needs Review" },
  { id: "send-user-notification", label: "Send user notification", riskClass: "Needs approval", department: "Marketing", description: "Draft or send user-facing notices only after executive approval.", allowed: false, approvalRequired: true, status: "Needs Review" },
  { id: "run-deployment-action", label: "Run deployment action", riskClass: "Needs approval", department: "Technology", description: "Promote or roll back deployments only with explicit approval.", allowed: false, approvalRequired: true, status: "Needs Review" },
  { id: "refund", label: "Refund", riskClass: "Unsafe / blocked", department: "Finance", description: "Blocked in Architect v1. Requires Stripe truth and explicit future workflow.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "payout-release", label: "Payout release", riskClass: "Unsafe / blocked", department: "Finance", description: "Blocked in Architect v1. Never release payout from repair/debug flows.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "mutate-role", label: "Mutate role", riskClass: "Unsafe / blocked", department: "Security", description: "Blocked. Shop relationships must not mutate account role identity.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "delete-appointment", label: "Delete appointment", riskClass: "Unsafe / blocked", department: "Operations", description: "Blocked. Appointment deletion is not a Mission Control repair.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "change-payment-status", label: "Change payment status without Stripe truth", riskClass: "Unsafe / blocked", department: "Finance", description: "Blocked. Payment status must follow provider truth.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "change-money-rules", label: "Change commission or booth-rent rules", riskClass: "Unsafe / blocked", department: "Finance", description: "Blocked. Money-rule mutation is an executive/product change, not a repair.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "change-production-schema", label: "Change production schema", riskClass: "Unsafe / blocked", department: "Technology", description: "Blocked from v1 UI. Schema work requires migration review.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "accept-shop-relationship-for-barber", label: "Accept shop relationship on behalf of barber", riskClass: "Unsafe / blocked", department: "Operations", description: "Blocked. Barber consent is required for active shop membership.", allowed: false, approvalRequired: true, status: "Failed" }
];

export const HIVE_AGENT_REGISTRY: HiveAgentEntry[] = [
  { id: "architect-prime", name: "Architect Prime", department: "Architect Prime", job: "Govern the intelligence layer and keep Mission Control evidence-backed.", dataAccess: "Architect registry, incidents, validators, source vault.", actionAccess: "Read-only review and packet drafting.", autonomyLevel: "Level 0 Read-only", successMetric: "No fake Pass states and no unsafe actions.", failureRule: "Escalate when evidence is missing or money/account mutation is requested.", currentStatus: "Needs Review" },
  { id: "client-manager", name: "Client Manager", department: "Product", job: "Watch client booking, saving, comments, and trust loops.", dataAccess: "Client-safe workflow evidence.", actionAccess: "Draft recommendations only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Client loop regressions are surfaced with evidence.", failureRule: "Do not unlock client posting or mutate booking state.", currentStatus: "Needs Review" },
  { id: "barber-growth-manager", name: "Barber Growth Manager", department: "Operations", job: "Watch barber chair command, services, availability, and calendar readiness.", dataAccess: "Barber workflow and calendar evidence.", actionAccess: "Draft recommendations only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Bookable barber blockers are detected.", failureRule: "Do not complete services or mutate availability.", currentStatus: "Needs Review" },
  { id: "shop-owner-manager", name: "Shop Owner Manager", department: "Operations", job: "Watch shop command calendar, active team, owner KPIs, and relationship sync.", dataAccess: "Shop relationship and owner-home evidence.", actionAccess: "Draft recommendations only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Owner active-barber sync issues are detected.", failureRule: "Do not accept barber invites or mutate roles.", currentStatus: "Needs Review" },
  { id: "architect-manager", name: "Architect Manager", department: "Technology", job: "Watch Architect route protection, debug tooling, and packet quality.", dataAccess: "Architect routes, incidents, tests, and validators.", actionAccess: "Read-only and packet generation.", autonomyLevel: "Level 0 Read-only", successMetric: "Architect remains gated and evidence-backed.", failureRule: "Block unsafe repairs.", currentStatus: "Needs Review" },
  { id: "booking-monitor-agent", name: "Booking Monitor Agent", department: "Operations", job: "Watch Culture-to-booking, service selection, availability, and calendar sync.", dataAccess: "Booking loop evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Booking regressions are classified before release.", failureRule: "Do not create appointments.", currentStatus: "Needs Review" },
  { id: "payment-routing-agent", name: "Payment Routing Agent", department: "Finance", job: "Watch captured payments, routing rows, status history, and payout readiness.", dataAccess: "Payment and routing evidence.", actionAccess: "Read-only diagnostics; guarded repair packet only.", autonomyLevel: "Level 0 Read-only", successMetric: "No captured money lacks a business object.", failureRule: "Never release payout, refund, or override Stripe truth.", currentStatus: "Needs Review" },
  { id: "culture-health-agent", name: "Culture Health Agent", department: "Content & Community", job: "Watch Culture posts, author identity, comments, reports, and booking CTAs.", dataAccess: "Culture-safe public post evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Social loop regressions are surfaced.", failureRule: "Do not create fake posts, counts, or promotions.", currentStatus: "Needs Review" },
  { id: "shop-relationship-agent", name: "Shop Relationship Agent", department: "Operations", job: "Watch owner invites, barber acceptance, active relationships, and owner sync.", dataAccess: "Shop relationship evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Accepted barbers appear in owner read models.", failureRule: "Do not accept invites for barbers.", currentStatus: "Needs Review" },
  { id: "calendar-sync-agent", name: "Calendar Sync Agent", department: "Operations", job: "Watch appointment visibility across client confirmation, barber calendar, and owner timeline.", dataAccess: "Calendar and appointment evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Calendar mismatches become incidents.", failureRule: "Do not mutate appointments.", currentStatus: "Needs Review" },
  { id: "kiosk-flow-agent", name: "Kiosk Flow Agent", department: "Operations", job: "Watch kiosk readiness without changing kiosk internals.", dataAccess: "Kiosk status evidence when available.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Kiosk blockers are visible.", failureRule: "Do not change kiosk internals.", currentStatus: "Needs Review" },
  { id: "verification-agent", name: "Verification Agent", department: "Compliance", job: "Watch account verification and trust gates.", dataAccess: "Verification queue evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Trust-gate blockers are surfaced.", failureRule: "Do not approve or reject users automatically.", currentStatus: "Needs Review" },
  { id: "revenue-recovery-agent", name: "Revenue Recovery Agent", department: "Finance", job: "Placeholder for missed revenue and failed payment recovery.", dataAccess: "Finance evidence only when implemented.", actionAccess: "Draft mode only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Future recovery opportunities are documented.", failureRule: "No payment actions, refunds, or payout release.", currentStatus: "Needs Review" },
  { id: "retention-agent", name: "Retention Agent", department: "Marketing", job: "Placeholder for retention insights and creator/client engagement.", dataAccess: "Aggregated engagement evidence only when implemented.", actionAccess: "Draft mode only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Future retention signals are documented.", failureRule: "No manipulative notifications or fake urgency.", currentStatus: "Needs Review" },
  ...(["CEO", "Product", "Technology", "Operations", "Finance", "Marketing", "Compliance", "Security", "Content & Community"] as MissionDepartment[]).map((department) => ({
    id: `${department.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-assistant`,
    name: `${department} Assistant`,
    department,
    job: `Organize ${department} evidence and draft next actions for Architect review.`,
    dataAccess: `${department} lane evidence cards and validator status.`,
    actionAccess: "Read-only review and draft recommendations.",
    autonomyLevel: "Level 1 Draft mode" as const,
    successMetric: `${department} risks are summarized without fake health claims.`,
    failureRule: "Escalate missing data as Needs Review.",
    currentStatus: "Needs Review" as const
  }))
];

export const MISSION_INCIDENT_DEFINITIONS: MissionIncidentDefinition[] = [
  incidentDefinition("culture_social_loop_failed", "Content & Community", "Culture Social Loop", "Culture feed, author identity, comments, or engagement evidence failed.", "broken", false, true, ["public Culture post safety", "author identity hydration", "comment/engagement route health", "book CTA eligibility"]),
  incidentDefinition("culture_booking_bridge_failed", "Marketing", "Culture-to-Booking Loop", "Culture attention is not converting into a safe booking entry.", "critical", false, true, ["CTA route attribution", "booking state attribution", "appointment creation", "barber calendar visibility"]),
  incidentDefinition("booking_slot_generation_failed", "Operations", "Booking Availability Loop", "Booking availability inputs do not produce expected real slots.", "critical", false, true, ["barber id", "service id", "location id", "availability rules", "blocked time and appointment filters"]),
  incidentDefinition("barber_calendar_missing_appointment", "Operations", "Barber Calendar Loop", "Created appointment is missing from barber command calendar.", "critical", false, true, ["appointment row", "calendar query", "barber id", "selected date"]),
  incidentDefinition("shop_relationship_accept_failed", "Operations", "Shop Relationship Loop", "Barber acceptance did not activate the canonical shop relationship.", "critical", false, true, ["relationship row", "approved_by_barber_at", "status", "owner read model"]),
  incidentDefinition("owner_active_barber_sync_failed", "Operations", "Owner Command Calendar Loop", "Accepted active barber is missing from owner Home read models.", "critical", false, true, ["active relationship", "owner active count", "scoreboard", "shop labels"]),
  incidentDefinition("owner_kpi_mismatch", "Operations", "Owner KPI Aggregation", "Owner shop KPIs do not match active shop-barber truth.", "broken", false, true, ["active relationships only", "pending excluded", "shop-context production only"]),
  incidentDefinition("payment_routing_missing", "Finance", "Payment/Routing Loop", "Completed paid appointment or paid POS sale is missing routing.", "critical", true, true, ["appointment/payment truth", "routing row", "schema constraints", "no payout release"]),
  incidentDefinition("payout_constraint_mismatch", "Finance", "Payout Eligibility", "Routing exists but payout readiness or constraints are inconsistent.", "broken", false, true, ["readiness legal values", "eligible meaning", "released_at remains null"]),
  incidentDefinition("deployment_pending_or_failed", "Technology", "Deployment Health", "Deployment metadata is missing, pending, or failed.", "broken", false, true, ["commit hash", "deployment id", "branch", "build time"]),
  incidentDefinition("regression_test_missing", "Technology", "Regression Coverage", "A production loop lacks a matching regression test.", "warning", false, true, ["test file exists", "fixture covers loop", "validation command documented"]),
  incidentDefinition("schema_constraint_mismatch", "Technology", "Schema Constraints", "Runtime code attempted values rejected by production schema constraints.", "critical", false, true, ["constraint evidence", "legal values", "repair payload values"]),
  incidentDefinition("unsafe_repair_requested", "Security", "Unsafe Action Prevention", "A requested action would mutate money, roles, production schema, or consent-owned state unsafely.", "critical", false, false, ["blocked action", "reason", "approval boundary"])
];

export const CODEX_FAILURE_CLASSES: CodexFailureClass[] = [
  failureClass("culture_booking_bridge_failed", "Culture booking bridge failure", ["Marketing", "Operations"], ["components/culture/culture-post-card.tsx", "lib/culture/service.ts", "components/booking/booking-form.tsx", "app/api/bookings/route.ts"], ["culture_posts", "appointments"], ["Culture feed layout", "Stripe/payment internals", "payout release logic", "appointment completion internals"], ["Culture CTA attribution test", "booking state attribution test", "calendar visibility regression"], ["npm run typecheck", "targeted Culture booking CTA tests", "targeted booking/calendar regression tests", "npm run build"]),
  failureClass("booking_slot_generation_failed", "Booking slot generation failure", ["Operations", "Technology"], ["components/booking/booking-form.tsx", "lib/booking/availability-slot-engine.ts", "app/api/barbers/[id]/availability/route.ts"], ["availability_rules", "appointments", "blocked_times", "services"], ["Culture feed UI", "Stripe/payment internals", "appointment final creation"], ["Sunday availability slot test", "location resolution test", "find next available test"], ["npm run typecheck", "targeted availability tests", "targeted booking form tests", "npm run build"]),
  failureClass("barber_calendar_missing_appointment", "Barber calendar missing appointment", ["Operations"], ["components/operations/barber-schedule-workspace.tsx", "app/api/bookings/route.ts", "lib/booking/platform-service.ts"], ["appointments", "appointment_status_history"], ["payment capture", "payout routing", "Culture feed UI"], ["booking-to-calendar regression", "barber timeline test"], ["npm run typecheck", "targeted booking/calendar tests", "npm run build"]),
  failureClass("shop_relationship_accept_failed", "Shop relationship active sync failure", ["Operations"], ["components/barber-experience/barber-settings-screen.tsx", "lib/operations/shop-team-invites.ts", "components/operations/owner-team-workspace.tsx"], ["shop_barber_relationships", "staff_locations", "shops", "barbers"], ["profiles.role", "booking engine", "Stripe", "payout routing"], ["shop relationship accept test", "owner active barber read-model test"], ["npm run typecheck", "targeted shop relationship tests", "targeted owner tests", "npm run build"]),
  failureClass("owner_active_barber_sync_failed", "Owner active barber sync failure", ["Operations"], ["components/operations/owner-team-workspace.tsx", "lib/operations/shop-team-invites.ts", "lib/booking/platform-service.ts"], ["shop_barber_relationships", "staff_locations", "appointments"], ["profiles.role", "appointment completion logic", "old freelance appointment ownership"], ["accepted relationship count test", "owner scoreboard test", "owner KPI active-only test"], ["npm run typecheck", "targeted owner command calendar tests", "npm run build"]),
  failureClass("owner_kpi_mismatch", "Owner KPI mismatch", ["Operations", "Finance"], ["components/operations/owner-team-workspace.tsx", "lib/booking/platform-service.ts"], ["appointments", "shop_barber_relationships", "payment_routing_records"], ["payout release", "Stripe", "appointment completion"], ["owner KPI aggregation test", "pending invite exclusion test"], ["npm run typecheck", "targeted owner tests", "npm run build"]),
  failureClass("payment_routing_missing", "Payment routing missing", ["Finance", "Technology"], ["lib/architect/repairs/payment-routing-repair.ts", "lib/architect/mission-control/schema-constraints.ts", "app/api/architect/repairs/payment-routing/route.ts"], ["appointments", "payments", "payment_routing_records", "appointment_status_history"], ["booking creation", "Stripe booking charge", "payout release", "client discovery"], ["architect routing repair test", "payment routing incident test", "payout completion regression"], ["npm run typecheck", "targeted Architect routing tests", "npm run build"]),
  failureClass("payout_constraint_mismatch", "Payout constraint mismatch", ["Finance", "Technology"], ["lib/architect/mission-control/schema-constraints.ts", "lib/architect/repairs/payment-routing-repair.ts"], ["payment_routing_records", "information_schema.check_constraints"], ["payout release", "Stripe payment status", "commission/booth-rent rules"], ["schema constraint debug test", "routing repair constraint test"], ["npm run typecheck", "targeted schema constraint tests", "npm run build"]),
  failureClass("deployment_pending_or_failed", "Deployment mismatch", ["Technology"], ["app/api/architect/mission-control/route.ts", "lib/architect/debug/env.ts"], [], ["application feature UX", "database schema", "payment internals"], ["deployment debug test", "Mission Control status test"], ["npm run typecheck", "targeted Architect deployment tests", "npm run build"]),
  failureClass("regression_test_missing", "Regression missing", ["Technology"], ["tests/unit"], [], ["runtime business logic without evidence", "production data"], ["new targeted regression test"], ["npm run typecheck", "targeted regression test", "npm run build"]),
  failureClass("schema_constraint_mismatch", "Schema constraint mismatch", ["Technology", "Finance"], ["lib/architect/mission-control/schema-constraints.ts", "lib/architect/repairs/payment-routing-repair.ts"], ["information_schema.check_constraints", "payment_routing_records"], ["payout release", "production schema drop/recreate", "Stripe truth"], ["schema constraint mismatch packet test", "repair legal value test"], ["npm run typecheck", "targeted Architect schema tests", "npm run build"]),
  failureClass("unsafe_repair_requested", "Unsafe repair requested", ["Security", "Finance"], ["lib/architect/mission-control/foundation.ts", "components/architect/mission-control/mission-control.tsx"], [], ["refund", "payout release", "role mutation", "appointment deletion", "production schema mutation"], ["unsafe action blocked test", "Action Registry test"], ["npm run typecheck", "targeted Architect action registry tests", "npm run build"])
];

export function classifyArchitectIncident(diagnosisCode: string): MissionIncidentDefinition {
  const type = mapDiagnosisToIncidentType(diagnosisCode);
  return MISSION_INCIDENT_DEFINITIONS.find((definition) => definition.type === type)
    ?? MISSION_INCIDENT_DEFINITIONS.find((definition) => definition.type === "regression_test_missing")
    ?? MISSION_INCIDENT_DEFINITIONS[0];
}

export function getCodexFailureClass(diagnosisCode: string): CodexFailureClass {
  const type = mapDiagnosisToIncidentType(diagnosisCode);
  return CODEX_FAILURE_CLASSES.find((failureClassItem) => failureClassItem.incidentType === type)
    ?? CODEX_FAILURE_CLASSES.find((failureClassItem) => failureClassItem.incidentType === "regression_test_missing")
    ?? CODEX_FAILURE_CLASSES[0];
}

export function validateCoreLoopState(fixture: CoreLoopFixture = {}): CoreLoopValidator[] {
  return [
    buildValidator("culture-social-loop", "Culture Social Loop", "Content & Community", "Culture Social Loop", [
      check("public Culture posts exist or empty state is clean", fixture.cultureSocial?.publicPostsExist, "Public Culture post truth or clean empty state exists.", "Public Culture post truth failed.", "Public Culture post truth has not been inspected."),
      check("author identity hydrates", fixture.cultureSocial?.authorIdentityHydrates, "Author identity hydration is proven.", "Author identity hydration failed.", "Author identity hydration has not been inspected."),
      check("comments route exists", fixture.cultureSocial?.commentsRouteExists, "Comments route exists.", "Comments route is missing.", "Comments route has not been inspected."),
      check("comment preview route exists", fixture.cultureSocial?.commentPreviewExists, "Comment preview exists.", "Comment preview is missing.", "Comment preview has not been inspected."),
      check("engagement actions exist", fixture.cultureSocial?.engagementActionsExist, "Like/save/share/follow actions exist.", "Engagement action surface failed.", "Engagement actions have not been inspected."),
      check("book CTA exists for bookable barber post", fixture.cultureSocial?.bookCtaExistsForBookableBarber, "Book CTA exists for a bookable barber post.", "Book CTA missing for bookable barber post.", "Book CTA eligibility has not been inspected.")
    ], false, true),
    buildValidator("culture-to-booking-loop", "Culture-to-Booking Loop", "Marketing", "Culture-to-Booking Loop", [
      check("Culture post can carry booking CTA", fixture.cultureBooking?.bookingCtaUrlHasAttribution, "Booking CTA carries Culture attribution.", "Booking CTA attribution failed.", "Booking CTA attribution has not been inspected."),
      check("booking form accepts Culture attribution", fixture.cultureBooking?.bookingFormAcceptsAttribution, "Booking form accepts Culture attribution.", "Booking form drops Culture attribution.", "Booking form attribution has not been inspected."),
      check("appointment can be created through booking flow", fixture.cultureBooking?.appointmentCreatedThroughBooking, "Appointment creation is proven through booking flow.", "Appointment creation failed.", "Appointment creation has not been inspected."),
      check("appointment appears on barber calendar", fixture.cultureBooking?.appointmentAppearsOnBarberCalendar, "Appointment appears on barber calendar.", "Barber calendar appointment is missing.", "Barber calendar visibility has not been inspected."),
      check("regression test exists", fixture.cultureBooking?.regressionTestExists, "Regression test exists.", "Regression test is missing.", "Regression coverage has not been inspected.")
    ], false, true),
    buildValidator("booking-availability-loop", "Booking Availability Loop", "Operations", "Booking Availability Loop", [
      check("selected barber resolves", fixture.bookingAvailability?.selectedBarberResolves, "Selected barber resolves.", "Selected barber does not resolve.", "Selected barber resolution has not been inspected."),
      check("selected service resolves", fixture.bookingAvailability?.selectedServiceResolves, "Selected service resolves.", "Selected service does not resolve.", "Selected service resolution has not been inspected."),
      check("canonical location resolution works", fixture.bookingAvailability?.canonicalLocationResolves, "Canonical location resolves.", "Canonical location resolution failed.", "Canonical location resolution has not been inspected."),
      check("availability rules generate slots", fixture.bookingAvailability?.availabilityRulesGenerateSlots, "Availability rules generate slots.", "Availability rules do not generate slots.", "Availability slot generation has not been inspected."),
      check("no appointment before final confirm", fixture.bookingAvailability?.noAppointmentBeforeFinalConfirm, "No appointment is created before final confirmation.", "Appointment was created before final confirmation.", "Pre-confirm appointment creation has not been inspected.")
    ], false, true),
    buildValidator("barber-calendar-loop", "Barber Calendar Loop", "Operations", "Barber Calendar Loop", [
      check("appointment appears on barber command calendar", fixture.barberCalendar?.appointmentAppearsOnCommandCalendar, "Appointment appears on barber command calendar.", "Appointment is missing from barber command calendar.", "Barber calendar visibility has not been inspected."),
      check("barber sees Complete Service", fixture.barberCalendar?.barberCanCompleteOwnService, "Barber can complete own service.", "Barber cannot complete own service.", "Barber completion action has not been inspected."),
      check("owner does not see Complete Service", fixture.barberCalendar?.ownerCannotCompleteBarberService, "Owner completion action is hidden.", "Owner can see Complete Service.", "Owner completion visibility has not been inspected.")
    ], false, true),
    buildValidator("shop-relationship-loop", "Shop Relationship Loop", "Operations", "Shop Relationship Loop", [
      check("owner invite can exist", fixture.shopRelationship?.ownerInviteCanExist, "Owner invite can exist.", "Owner invite cannot exist.", "Owner invite path has not been inspected."),
      check("barber can accept", fixture.shopRelationship?.barberCanAccept, "Barber acceptance is proven.", "Barber acceptance failed.", "Barber acceptance has not been inspected."),
      check("active relationship appears in owner Home", fixture.shopRelationship?.activeRelationshipAppearsInOwnerHome, "Active relationship appears in owner Home.", "Accepted relationship missing from owner Home.", "Owner active relationship read model has not been inspected."),
      check("pending invites do not count as active", fixture.shopRelationship?.pendingInvitesExcludedFromActiveCount, "Pending invites are excluded from active count.", "Pending invites are counted as active.", "Pending invite math has not been inspected."),
      check("accepted barber appears in scoreboard", fixture.shopRelationship?.acceptedBarberAppearsInScoreboard, "Accepted barber appears in scoreboard.", "Accepted barber missing from scoreboard.", "Scoreboard sync has not been inspected."),
      check("profile role remains barber_user", fixture.shopRelationship?.profileRoleRemainsBarberUser, "Profile role remains barber_user.", "Profile role mutation detected.", "Profile role preservation has not been inspected.")
    ], false, true),
    buildValidator("owner-command-calendar-loop", "Owner Command Calendar Loop", "Operations", "Owner Command Calendar Loop", [
      check("active barbers counted from active relationships", fixture.ownerCommandCalendar?.activeBarbersFromRelationships, "Active barbers come from active relationships.", "Active barber count is not relationship-backed.", "Active barber source has not been inspected."),
      check("pending invites excluded", fixture.ownerCommandCalendar?.pendingInvitesExcluded, "Pending invites are excluded.", "Pending invites are counted.", "Pending invite exclusion has not been inspected."),
      check("shop production only counts shop-context production", fixture.ownerCommandCalendar?.shopProductionUsesShopContext, "Production uses shop context.", "Production includes non-shop context.", "Shop production source has not been inspected."),
      check("owner timeline is shop-wide", fixture.ownerCommandCalendar?.ownerTimelineShopWide, "Owner timeline is shop-wide.", "Owner timeline is not shop-wide.", "Owner timeline has not been inspected."),
      check("no owner Complete Service action", fixture.ownerCommandCalendar?.ownerCompleteServiceHidden, "Owner Complete Service is hidden.", "Owner can complete barber service.", "Owner completion visibility has not been inspected.")
    ], false, true),
    buildValidator("payment-routing-loop", "Payment/Routing Loop", "Finance", "Payment/Routing Loop", [
      check("appointment exists", fixture.paymentRouting?.appointmentExists, "Appointment exists.", "Appointment is missing.", "Appointment existence has not been inspected."),
      check("payment exists", fixture.paymentRouting?.paymentExists, "Payment exists.", "Payment is missing.", "Payment existence has not been inspected."),
      check("status history exists", fixture.paymentRouting?.statusHistoryExists, "Status history exists.", "Status history is missing.", "Status history has not been inspected."),
      check("routing exists or clear failure state exists", fixture.paymentRouting?.routingExistsOrClearFailure, "Routing exists or clear failure is available.", "Routing missing without clear failure.", "Routing state has not been inspected."),
      check("no payout release before completion", fixture.paymentRouting?.noPayoutBeforeCompletion, "Payout release is blocked before completion.", "Payout release before completion detected.", "Payout release guard has not been inspected.")
    ], true, true)
  ];
}

export function buildMissionControlFoundation(
  incidents: ArchitectIncident[] = [],
  checkedAt = new Date().toISOString(),
  ceoPlatformMetrics: MissionEvidenceCard[] = []
): MissionControlFoundation {
  const coreLoopValidators = applyIncidentFailures(validateCoreLoopState(), incidents);
  const departmentLanes = buildDepartmentLanes(coreLoopValidators, incidents);
  const ceoCommandCenter = [
    ...buildCeoPlatformMetricCards(ceoPlatformMetrics),
    ...buildCeoCards(coreLoopValidators, incidents, checkedAt)
  ];

  return {
    navigationLanes: MISSION_CONTROL_LANES,
    defaultLaneId: "ceo",
    ceoCommandCenter,
    departmentLanes,
    coreLoopValidators,
    incidentTypes: MISSION_INCIDENT_DEFINITIONS,
    sourceVault: SOURCE_VAULT_REGISTRY,
    actionRegistry: ACTION_REGISTRY,
    agentRegistry: HIVE_AGENT_REGISTRY,
    codexFailureClasses: CODEX_FAILURE_CLASSES
  };
}

function buildCeoPlatformMetricCards(metrics: MissionEvidenceCard[]): MissionEvidenceCard[] {
  const requestedMetrics = [
    ["ceo-total-users", "Total Users", "Audience", "Total user count is not connected."],
    ["ceo-clients-total", "Clients", "Audience", "Client count is not connected."],
    ["ceo-barbers-total", "Barbers", "Supply", "Barber count is not connected."],
    ["ceo-shop-owners-total", "Shop Owners", "Supply", "Shop owner count is not connected."],
    ["ceo-total-bookings", "Total Bookings", "Bookings", "Booking count is not connected."],
    ["ceo-todays-bookings", "Today's Bookings", "Bookings", "Today's booking count is not connected."],
    ["ceo-completed-appointments", "Completed Appointments", "Operations", "Completed appointment count is not connected."],
    ["ceo-gross-booked-volume", "Gross Booked Volume", "Finance", "Gross booked volume is not connected."],
    ["ceo-platform-fees", "Platform Fees / App Revenue", "Finance", "Platform fee revenue is not connected."],
    ["ceo-payments-captured", "Payments Captured", "Finance", "Captured payment count is not connected."],
    ["ceo-payment-routing-health", "Payment Routing Health", "Finance", "Payment routing health is not connected."],
    ["ceo-payout-readiness-health", "Payout Readiness Health", "Finance", "Payout readiness health is not connected."],
    ["ceo-culture-health", "Culture Health", "Culture", "Culture health is not connected."],
    ["ceo-active-shops", "Active Shops", "Operations", "Active shop count is not connected."],
    ["ceo-active-barbers", "Active Barbers", "Operations", "Active barber count is not connected."],
    ["ceo-pending-approvals", "Pending Barber/Shop Approvals", "Compliance", "Pending approval count is not connected."],
    ["ceo-critical-incidents", "Critical Incidents", "Incidents", "Critical incident count is not connected."],
    ["ceo-regression-deployment-health", "Regression / Deployment Health", "Technology", "Regression and deployment health are not connected."],
    ["ceo-next-executive-decisions", "Next Executive Decisions", "Executive Decisions", "Executive decision queue is not connected."]
  ] as const;
  const byId = new Map(metrics.map((card) => [card.id, card]));

  return requestedMetrics.map(([id, label, workflow, summary]) => byId.get(id) ?? {
    ...evidenceCard(id, label, "CEO", workflow, "Needs Review", summary, ["Not connected."]),
    metricValue: "Not connected"
  });
}

function buildCeoCards(validators: CoreLoopValidator[], incidents: ArchitectIncident[], checkedAt: string): MissionEvidenceCard[] {
  const criticalIncidents = incidents.filter((incident) => incident.severity === "critical");
  const failedValidators = validators.filter((validator) => validator.status === "Failed");
  const reviewValidators = validators.filter((validator) => validator.status === "Needs Review");

  return [
    evidenceCard("overall-platform-status", "Overall platform status", "CEO", "Global Health", failedValidators.length || criticalIncidents.length ? "Failed" : "Needs Review", failedValidators.length || criticalIncidents.length ? "Critical workflow evidence needs attention." : "No full-platform proof bundle has been run in this snapshot.", [
      `${incidents.length} active automatic incident(s) detected.`,
      `${failedValidators.length} core loop validator(s) failed.`,
      `${reviewValidators.length} core loop validator(s) need review.`,
      `checkedAt=${checkedAt}`
    ]),
    evidenceCard("critical-incidents", "Critical incidents", "CEO", "Incident Review", criticalIncidents.length ? "Failed" : "Needs Review", criticalIncidents.length ? `${criticalIncidents.length} critical incident(s) need executive attention.` : "No critical incidents were detected, but absence of incidents is not a full Pass.", criticalIncidents.map((incident) => incident.headline).concat(criticalIncidents.length ? [] : ["Automatic incident detector returned no critical incidents."])),
    evidenceCard("revenue-posture", "Revenue posture", "CEO", "Finance", incidents.some((incident) => incident.affectedDepartment === "Finance" || incident.diagnosisCode.includes("payment") || incident.diagnosisCode.includes("routing")) ? "Failed" : "Needs Review", "Revenue posture depends on payment/routing validators and Stripe truth.", ["Missing or passing finance incidents alone does not prove revenue health."]),
    evidenceCard("booking-posture", "Booking posture", "CEO", "Booking", validatorStatus(validators, "culture-to-booking-loop"), "Culture-to-booking and availability loops determine booking posture.", validatorEvidence(validators, "culture-to-booking-loop")),
    evidenceCard("culture-posture", "Culture posture", "CEO", "Culture", validatorStatus(validators, "culture-social-loop"), "Culture social loop is tracked separately from marketplace discovery.", validatorEvidence(validators, "culture-social-loop")),
    evidenceCard("role-health", "Client/Barber/Owner role health", "CEO", "Role Health", validatorStatus(validators, "owner-command-calendar-loop"), "Role health watches client booking, barber chair command, owner shop command, and relationship sync.", validatorEvidence(validators, "owner-command-calendar-loop")),
    evidenceCard("deployment-health", "Deployment health", "CEO", "Deployment", "Needs Review", "Deployment fingerprint is present in the legacy Mission Control snapshot; CI/deploy status needs external confirmation.", ["Missing deployment data must remain Needs Review."]),
    evidenceCard("regression-status", "Regression status", "CEO", "Regression Coverage", "Needs Review", "Regression status is tracked by test evidence and must not infer Pass automatically.", ["Run targeted Architect and loop regressions for proof."]),
    evidenceCard("source-vault-status", "Source Vault status", "CEO", "Source Vault", "Needs Review", "Sources are registered for v1, not ingested into AI memory.", [`${SOURCE_VAULT_REGISTRY.length} source(s) registered.`, "No ingestion system is claimed."]),
    evidenceCard("agent-status", "Agent status", "CEO", "Hive AI", "Needs Review", "Hive agents are Level 0 or Level 1 only in v1.", [`${HIVE_AGENT_REGISTRY.length} agent(s) registered.`, "No autonomous money/account/team/code execution enabled."]),
    evidenceCard("next-executive-decisions", "Next executive decisions", "CEO", "Executive Decisions", "Needs Review", "Phillip remains final executive decision maker.", ["Mission Control can surface decisions; it does not make executive decisions in v1."])
  ];
}

function buildDepartmentLanes(validators: CoreLoopValidator[], incidents: ArchitectIncident[]): MissionDepartmentLane[] {
  const laneCards: Record<MissionLaneId, MissionEvidenceCard[]> = {
    ceo: [],
    product: [
      evidenceCard("product-client-health", "Client lane health", "Product", "Client", "Needs Review", "Client booking and engagement health require fresh loop evidence.", ["No fake client health metrics are generated."]),
      evidenceCard("product-barber-health", "Barber lane health", "Product", "Barber", validatorStatus(validators, "barber-calendar-loop"), "Barber chair command depends on calendar and completion evidence.", validatorEvidence(validators, "barber-calendar-loop")),
      evidenceCard("product-owner-health", "Owner lane health", "Product", "Owner", validatorStatus(validators, "owner-command-calendar-loop"), "Owner shop command depends on active team and KPI truth.", validatorEvidence(validators, "owner-command-calendar-loop")),
      evidenceCard("product-culture-loop", "Culture loop health", "Product", "Culture", validatorStatus(validators, "culture-social-loop"), "Culture social health is tracked through public posts, identity, comments, engagement, and booking CTA.", validatorEvidence(validators, "culture-social-loop")),
      evidenceCard("product-booking-ux", "Booking UX health", "Product", "Booking UX", validatorStatus(validators, "booking-availability-loop"), "Booking UX depends on real slots and no pre-confirm appointment creation.", validatorEvidence(validators, "booking-availability-loop")),
      evidenceCard("product-feature-readiness", "Feature readiness", "Product", "Feature Readiness", "Needs Review", "Feature readiness requires targeted regression proof.", ["Missing test evidence stays Needs Review."])
    ],
    technology: [
      evidenceCard("technology-deployments", "Deployments", "Technology", "Deployments", "Needs Review", "Deployment health needs CI/deploy truth.", ["Commit metadata alone is not a Pass."]),
      evidenceCard("technology-build-tests", "Build/test status", "Technology", "Regression", "Needs Review", "Build and test status comes from validation commands.", ["Run targeted tests, typecheck, and build."]),
      evidenceCard("technology-database", "Database health", "Technology", "Database", "Needs Review", "Database health requires schema/read evidence.", ["No database migration is part of v1 foundation."]),
      evidenceCard("technology-api", "API health", "Technology", "API", "Needs Review", "API health requires route-specific evidence.", ["Architect APIs remain gated."]),
      evidenceCard("technology-schema", "Schema constraints", "Technology", "Schema", incidents.some((incident) => incident.diagnosisCode === "schema_constraint_mismatch") ? "Failed" : "Needs Review", "Schema constraint evidence is available for payment routing.", ["Constraint checks are read-only."]),
      evidenceCard("technology-coverage", "Regression coverage", "Technology", "Coverage", "Needs Review", "Regression coverage must be explicit.", ["Missing regression test is not a Pass."])
    ],
    operations: [
      evidenceCard("operations-appointments", "Appointments", "Operations", "Appointments", validatorStatus(validators, "culture-to-booking-loop"), "Appointment loop is validated through Culture-to-booking and calendar sync.", validatorEvidence(validators, "culture-to-booking-loop")),
      evidenceCard("operations-calendars", "Calendars", "Operations", "Calendars", validatorStatus(validators, "barber-calendar-loop"), "Calendar posture watches barber and owner visibility.", validatorEvidence(validators, "barber-calendar-loop")),
      evidenceCard("operations-relationships", "Shop relationships", "Operations", "Shop Relationships", validatorStatus(validators, "shop-relationship-loop"), "Shop relationship posture watches owner invites and barber acceptance.", validatorEvidence(validators, "shop-relationship-loop")),
      evidenceCard("operations-kiosk", "Kiosk readiness", "Operations", "Kiosk", "Needs Review", "Kiosk readiness is visible only as a placeholder in this v1 foundation.", ["Kiosk internals are untouched."]),
      evidenceCard("operations-command-calendars", "Owner/barber command calendars", "Operations", "Command Calendars", validatorStatus(validators, "owner-command-calendar-loop"), "Command calendar posture watches chair and shop-floor operating surfaces.", validatorEvidence(validators, "owner-command-calendar-loop")),
      evidenceCard("operations-completion", "Service completion flow", "Operations", "Service Completion", validatorStatus(validators, "barber-calendar-loop"), "Only barbers should complete their own services.", validatorEvidence(validators, "barber-calendar-loop"))
    ],
    finance: [
      evidenceCard("finance-payment-health", "Payment health", "Finance", "Payments", validatorStatus(validators, "payment-routing-loop"), "Payment health uses appointment/payment/routing truth.", validatorEvidence(validators, "payment-routing-loop")),
      evidenceCard("finance-stripe", "Stripe status", "Finance", "Stripe", "Needs Review", "Stripe status requires provider truth; v1 does not mutate Stripe.", ["No Stripe/payment internals changed."]),
      evidenceCard("finance-routing", "Routing health", "Finance", "Routing", validatorStatus(validators, "payment-routing-loop"), "Routing health uses payment_routing_records evidence.", validatorEvidence(validators, "payment-routing-loop")),
      evidenceCard("finance-payout", "Payout readiness", "Finance", "Payouts", "Needs Review", "Payout release remains blocked from repair/debug flows.", ["No payout release before completion."]),
      evidenceCard("finance-fees", "Platform fee posture", "Finance", "Fees", "Needs Review", "Fee posture needs routing math evidence.", ["No fake revenue totals."]),
      evidenceCard("finance-future", "Booth rent/commission future readiness", "Finance", "Future Money Models", "Needs Review", "Future money models remain approval-gated.", ["No commission or booth-rent rule mutation."])
    ],
    marketing: [
      evidenceCard("marketing-culture-feed", "Culture feed", "Marketing", "Culture", validatorStatus(validators, "culture-social-loop"), "Culture feed is the demand/content signal.", validatorEvidence(validators, "culture-social-loop")),
      evidenceCard("marketing-discovery", "Discovery signals", "Marketing", "Discovery", "Needs Review", "Discovery signals require real counts and safe attribution.", ["No fake trending or local ranking."]),
      evidenceCard("marketing-attribution", "Booking attribution", "Marketing", "Attribution", validatorStatus(validators, "culture-to-booking-loop"), "Culture attribution must survive into booking truth.", validatorEvidence(validators, "culture-to-booking-loop")),
      evidenceCard("marketing-referrals", "Referral readiness", "Marketing", "Referrals", "Needs Review", "Referral readiness is future-scaffolded.", ["No referral automation is enabled."]),
      evidenceCard("marketing-campaigns", "Campaign tracking future readiness", "Marketing", "Campaigns", "Needs Review", "Campaign tracking requires future implementation.", ["No fake campaign tracking."])
    ],
    compliance: [
      evidenceCard("compliance-verification", "Verification", "Compliance", "Verification", "Needs Review", "Verification queues remain existing Architect surfaces.", ["No automatic approval/rejection in v1."]),
      evidenceCard("compliance-review-integrity", "Review integrity", "Compliance", "Reviews", "Needs Review", "Review integrity requires future evidence.", ["No fake trust state."]),
      evidenceCard("compliance-trust-gates", "Client/barber/shop trust gates", "Compliance", "Trust Gates", "Needs Review", "Trust gates need role-specific evidence.", ["Missing evidence remains Needs Review."]),
      evidenceCard("compliance-consent", "Consent/opt-out readiness", "Compliance", "Consent", "Needs Review", "Consent and opt-out readiness are not mutated by v1.", ["No user notification action is enabled."]),
      evidenceCard("compliance-policy", "Policy visibility", "Compliance", "Policy", "Needs Review", "Policy visibility requires source review.", ["Source Vault is registered, not ingested."])
    ],
    security: [
      evidenceCard("security-role-access", "Role access", "Security", "Access", "Needs Review", "Architect route and API guards exist; broader role audit needs explicit proof.", ["Architect route uses platform-admin guard."]),
      evidenceCard("security-route-protection", "Route protection", "Security", "Route Protection", "Needs Review", "Architect APIs use debug access guard.", ["Public roles are blocked by guard tests."]),
      evidenceCard("security-unsafe-actions", "Unsafe action prevention", "Security", "Action Registry", "Pass", "Unsafe v1 actions are blocked in Action Registry.", ACTION_REGISTRY.filter((action) => action.riskClass === "Unsafe / blocked").map((action) => `${action.label}: blocked`)),
      evidenceCard("security-audit", "Audit trail coverage", "Security", "Audit", "Needs Review", "Audit trail coverage exists for some repair/validation flows only.", ["Coverage must be loop-specific."]),
      evidenceCard("security-restrictions", "Account restrictions", "Security", "Restrictions", "Needs Review", "Account restrictions require route-by-route evidence.", ["No role mutation is allowed from v1."])
    ],
    content_community: [
      evidenceCard("community-moderation", "Culture moderation", "Content & Community", "Moderation", "Needs Review", "Moderation depends on reports/comments evidence.", ["No moderation dashboard is built in this v1 foundation."]),
      evidenceCard("community-comments", "Comments/reports", "Content & Community", "Comments", validatorStatus(validators, "culture-social-loop"), "Comments and reports are part of Culture social health.", validatorEvidence(validators, "culture-social-loop")),
      evidenceCard("community-creators", "Creator behavior", "Content & Community", "Creators", "Needs Review", "Creator behavior needs safe public post evidence.", ["No private identity data exposed."]),
      evidenceCard("community-signals", "Community signals", "Content & Community", "Signals", "Needs Review", "Signals must be real engagement evidence only.", ["No fake likes/comments/views."]),
      evidenceCard("community-health", "Content health", "Content & Community", "Content Health", validatorStatus(validators, "culture-social-loop"), "Content health is tied to public, approved, non-deleted Culture posts.", validatorEvidence(validators, "culture-social-loop"))
    ]
  };

  return MISSION_CONTROL_LANES.map((lane) => ({
    id: lane.id,
    label: lane.label,
    purpose: lane.purpose,
    status: aggregateStatus(laneCards[lane.id]),
    cards: laneCards[lane.id]
  }));
}

function applyIncidentFailures(validators: CoreLoopValidator[], incidents: ArchitectIncident[]) {
  return validators.map((validator) => {
    const related = incidents.filter((incident) => {
      const type = incident.missionIncidentType ?? mapDiagnosisToIncidentType(incident.diagnosisCode);
      if (validator.id === "culture-social-loop") return type === "culture_social_loop_failed";
      if (validator.id === "culture-to-booking-loop") return type === "culture_booking_bridge_failed" || type === "barber_calendar_missing_appointment";
      if (validator.id === "booking-availability-loop") return type === "booking_slot_generation_failed";
      if (validator.id === "barber-calendar-loop") return type === "barber_calendar_missing_appointment";
      if (validator.id === "shop-relationship-loop") return type === "shop_relationship_accept_failed" || type === "owner_active_barber_sync_failed";
      if (validator.id === "owner-command-calendar-loop") return type === "owner_active_barber_sync_failed" || type === "owner_kpi_mismatch";
      if (validator.id === "payment-routing-loop") return type === "payment_routing_missing" || type === "payout_constraint_mismatch" || type === "schema_constraint_mismatch";
      return false;
    });

    if (!related.length) return validator;

    return {
      ...validator,
      status: "Failed" as const,
      summary: related[0].headline,
      evidence: [...related.flatMap((incident) => incident.evidence), ...validator.evidence],
      validationChecklist: [...related.flatMap((incident) => incident.validationChecklist ?? []), ...validator.validationChecklist],
      safeRepairAvailable: validator.safeRepairAvailable || related.some((incident) => incident.canRepair),
      codexPatchNeeded: validator.codexPatchNeeded || related.some((incident) => incident.codexRequired)
    };
  });
}

function buildValidator(
  id: string,
  label: string,
  department: MissionDepartment,
  workflow: string,
  checks: BooleanCheck[],
  safeRepairAvailable: boolean,
  codexPatchNeeded: boolean
): CoreLoopValidator {
  const failed = checks.filter((item) => item.passed === false);
  const missing = checks.filter((item) => typeof item.passed === "undefined");
  const status: MissionControlStatus = failed.length ? "Failed" : missing.length ? "Needs Review" : "Pass";
  const summary = failed.length
    ? `${failed[0].label} failed.`
    : missing.length
      ? `${missing.length} validation check(s) need evidence.`
      : "All validator checks passed for the provided fixture.";

  return {
    id,
    label,
    department,
    workflow,
    status,
    summary,
    evidence: checks.map((item) => {
      if (item.passed === true) return item.evidenceWhenPass;
      if (item.passed === false) return item.evidenceWhenFail;
      return item.evidenceWhenMissing;
    }),
    validationChecklist: checks.map((item) => item.label),
    safeRepairAvailable,
    codexPatchNeeded
  };
}

function check(
  label: string,
  passed: boolean | undefined,
  evidenceWhenPass: string,
  evidenceWhenFail: string,
  evidenceWhenMissing: string
): BooleanCheck {
  return { label, passed, evidenceWhenPass, evidenceWhenFail, evidenceWhenMissing };
}

function evidenceCard(
  id: string,
  label: string,
  department: MissionDepartment,
  workflow: string,
  status: MissionControlStatus,
  summary: string,
  evidence: string[]
): MissionEvidenceCard {
  return { id, label, department, workflow, status, summary, evidence };
}

function validatorStatus(validators: CoreLoopValidator[], id: string): MissionControlStatus {
  return validators.find((validator) => validator.id === id)?.status ?? "Needs Review";
}

function validatorEvidence(validators: CoreLoopValidator[], id: string): string[] {
  return validators.find((validator) => validator.id === id)?.evidence ?? ["Validator evidence is missing."];
}

function aggregateStatus(cards: MissionEvidenceCard[]): MissionControlStatus {
  if (cards.some((card) => card.status === "Failed")) return "Failed";
  if (cards.some((card) => card.status === "Warning")) return "Warning";
  if (cards.length && cards.every((card) => card.status === "Pass")) return "Pass";
  return "Needs Review";
}

function incidentDefinition(
  type: ArchitectMissionIncidentType,
  affectedDepartment: MissionDepartment,
  affectedWorkflow: string,
  likelyRootCause: string,
  severity: MissionSeverity,
  safeRepairAvailable: boolean,
  codexPatchNeeded: boolean,
  validationChecklist: string[]
): MissionIncidentDefinition {
  return { type, affectedDepartment, affectedWorkflow, likelyRootCause, severity, safeRepairAvailable, codexPatchNeeded, validationChecklist };
}

function failureClass(
  incidentType: ArchitectMissionIncidentType,
  label: string,
  affectedDepartments: MissionDepartment[],
  affectedFiles: string[],
  affectedTables: string[],
  doNotTouch: string[],
  testsRequired: string[],
  validationRequired: string[]
): CodexFailureClass {
  return { incidentType, label, affectedDepartments, affectedFiles, affectedTables, doNotTouch, testsRequired, validationRequired };
}

function mapDiagnosisToIncidentType(diagnosisCode: string): ArchitectMissionIncidentType {
  if (diagnosisCode.includes("culture") && diagnosisCode.includes("booking")) return "culture_booking_bridge_failed";
  if (diagnosisCode.includes("culture")) return "culture_social_loop_failed";
  if (diagnosisCode.includes("slot") || diagnosisCode.includes("availability")) return "booking_slot_generation_failed";
  if (diagnosisCode.includes("calendar")) return "barber_calendar_missing_appointment";
  if (diagnosisCode.includes("relationship_accept")) return "shop_relationship_accept_failed";
  if (diagnosisCode.includes("active_barber_sync")) return "owner_active_barber_sync_failed";
  if (diagnosisCode.includes("owner_kpi")) return "owner_kpi_mismatch";
  if (diagnosisCode.includes("schema_constraint")) return "schema_constraint_mismatch";
  if (diagnosisCode.includes("payout") || diagnosisCode.includes("not_eligible")) return "payout_constraint_mismatch";
  if (diagnosisCode.includes("routing") || diagnosisCode.includes("payment")) return "payment_routing_missing";
  if (diagnosisCode.includes("deployment")) return "deployment_pending_or_failed";
  if (diagnosisCode.includes("regression")) return "regression_test_missing";
  if (diagnosisCode.includes("unsafe")) return "unsafe_repair_requested";
  return "regression_test_missing";
}
