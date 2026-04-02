# BVRB3R Platform Plan

`PLANS.md` tracks delivery against the current release line and maps the long-range `VISION.md` into phased execution.

## Delivery mode

Work is tracked by milestone. The verification gate for each milestone is:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- update `CHANGELOG.md`
- update `TODO.md` with deferred work

## Latest gate result

- Date: 2026-03-10
- Commands run successfully: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- Additional smoke verification: production build responded `200` for `/`, `/discover`, `/barber/wave`, `/booking/new`, `/dashboard/client`, `/dashboard/barber`, `/dashboard/front-desk`, `/dashboard/manager`, `/dashboard/owner`, `/manifest.webmanifest`, `/sw.js`, `/api/mobile/deep-links`, `/api/mobile/native/bootstrap`, `/api/mobile/push/subscriptions`, `/api/mobile/native/tokens`, and `/api/engagement/deliveries`; authenticated demo-session smoke verification also returned `200` for `/api/engagement/barber/summary`, `/api/engagement/owner/intelligence`, `/api/trust/barber/verification`, `/api/mobile/push/subscriptions`, and `/api/mobile/native/tokens`
- Result: pass
- Notes:
  - Live appointment lifecycle now reads and writes through a provider-backed operations API instead of local-authoritative Zustand state
  - Supabase or Postgres mode now has live operations tables, revision-based conflict handling, and realtime publication wiring
  - Owner and manager dashboards now read persisted analytics or workflow data, and barber compensation reads persisted compensation snapshots
  - Added multi-user synchronization and stale-edit conflict coverage
  - Human browser or staging QA is still pending and blocks release certification
  - Marketplace foundation now includes service ownership controls, popularity scaffolding, public barber pages, discovery search, map discovery scaffolding, instant-chair matching foundations, richer discovery-feed browsing, public follow or share UX, style-driven browsing routes, leaderboards, and client referral loops
  - Trust, Verification, and Safety Layer now adds barber and shop verification architecture, public trust badges and proof, review-integrity scaffolding, safety-report and dispute intake, risk-flag foundations, and owner or barber trust workspaces
  - Marketplace Activation and Monetization now adds secure verification upload flows, notification delivery ledgers, boosted visibility controls, featured placement controls, city rollout tooling, trust-aware monetization rules, and owner or barber activation reporting
  - Mobile Push and Native Activation now adds per-user and per-device push subscription persistence, push-delivery attempt wiring, deep-link APIs, Capacitor-ready mobile config, and honest offline-safe activation UX across role workspaces
  - Native Distribution and Live Delivery now adds provider-backed email, SMS, and web-push execution where credentials exist, delivery-attempt and retry metadata, native bootstrap and association routes, wrapped-runtime activation handling, and device-launch QA scaffolds
  - Real Device QA and Store Submission now adds hashed native APNs or FCM token storage, `/api/mobile/native/tokens`, production delivery config paths, release-candidate certification artifacts, and stronger real-device or store-readiness guidance

## Milestone status

### Milestone 1: project setup, schema, auth, RBAC
- Status: Complete and verified
- Includes: Next.js project structure, Supabase-first schema, auth or runtime helpers, role guards, and RBAC scaffolding
- Verification: Passed in the 2026-03-09 full-project gate

### Milestone 2: booking flow, availability, appointments
- Status: Complete and verified
- Includes: client booking flow, availability checks, appointment creation, and appointment lifecycle state
- Verification: Passed in the 2026-03-09 full-project gate

### Milestone 3: dashboards by role
- Status: Complete and verified
- Includes: owner, manager, front desk, barber, and client dashboard routes with role-aware navigation
- Verification: Passed in the 2026-03-09 full-project gate

### Milestone 4: front desk queue and checkout
- Status: Complete and verified
- Includes: front desk live board, walk-in queue basics, check-in action, checkout action, payment-and-tip capture flow, and live state updates
- Verification: Passed in the 2026-03-09 full-project gate

### Milestone 5: compensation logic for booth rent and commission
- Status: Complete and verified
- Includes: derived commission views, booth-rent due visibility, and live compensation metrics from appointment outcomes
- Verification: Passed in the 2026-03-09 full-project gate

### Milestone 6: analytics and reporting
- Status: Complete and verified
- Includes: owner revenue activity, chart data derived from live appointment state, and workflow activity feed
- Verification: Passed in the 2026-03-09 full-project gate

### Milestone 7: polish, README, seed data, verification
- Status: Complete and verified
- Includes: branded UI pass, docs, runbook, seeded demo content, Windows-safe local verification, and milestone process updates
- Verification: Passed in the 2026-03-09 full-project gate

### Milestone 8: production hardening
- Status: Complete and verified
- Includes: Supabase or Postgres persistence for workflow events, compensation snapshots, and owner analytics; six-step workflow end-to-end coverage; QA and release certification checklist files; ESLint CLI migration; and stable local typecheck verification
- Verification: Passed in the 2026-03-09 full-project gate

### Milestone 9: multi-user realtime readiness
- Status: Complete and verified at the code or build level
- Includes:
  - provider-backed live operations API for booking, lifecycle transitions, checkout, and scoped state reads
  - Supabase or Postgres live operations tables and realtime publication wiring
  - persisted analytics or compensation reads for owner, manager, and barber dashboards
  - Zustand reduced to UI state, optimistic state, and conflict messaging only
  - revision-based simultaneous-edit conflict handling for front desk, barber, and manager workflows
  - multi-user synchronization or conflict tests and production smoke verification
- Verification: Passed in the 2026-03-09 full-project gate and local production smoke check
- Release note: human browser or staging QA and final certification remain open
### Marketplace Foundation Phase
- Status: Complete and verified
- Includes:
  - service ownership engine with owner-controlled shop services for commission work and self-owned services for booth-rent barbers
  - service popularity engine scaffolding with booking count, revenue, rating, repeat-rate, and popularity rank signals
  - public barber profile routes at `/barber/{username}`
  - discovery search at `/discover` for barber, shop, service, style, and location-driven exploration
  - map discovery data and UI shell foundation
  - `GET A HAIRCUT NOW` matching foundation using favorite barber, favorite shop, nearby fit, and available-now priority
  - Supabase marketplace schema scaffold with profile, portfolio, style, ranking, visibility, and search tables
- Verification: Passed in the 2026-03-10 full-project gate
- Release note: ranking optimization, live marketplace persistence, full map provider integration, and trust or safety automation remain future-phase work
### Engagement Architecture Scaffold
- Status: Complete and verified
- Includes:
  - modular engagement domain types, demo seed data, state, notification helpers, APIs, and React Query hooks for client, barber, and owner growth systems
  - client engagement summaries for smart rebooking, loyalty points, barber follows, referrals, and reminder-ready notifications
  - barber engagement summaries for today or week or month earnings extensions, reputation inputs, ranking snapshots, follower count, client insights, and growth recommendations
  - owner intelligence summaries for retention, loyalty usage, referral activity, and rebooking effectiveness
  - role-safe engagement APIs for client summary, barber summary, owner intelligence, follow actions, and future event recording
  - Supabase migration `0006_engagement_architecture.sql` for loyalty ledgers, referral records, follows, engagement events, rebooking, notification preferences, reputation, ranking, and growth recommendation tables
- Verification: Passed in the 2026-03-10 full-project gate
- Release note: delivery channels, persistence wiring, and ranking consumption are now connected for current marketplace flows, with broader growth automation still deferred
### Milestone 10: marketplace persistence and ranking
- Status: Complete and verified
- Includes:
  - provider-backed Supabase or Postgres persistence for marketplace services, conversion analytics, booking attributions, waitlist requests, and engagement summaries
  - persisted discovery ranking inputs wired into public discovery and public barber profile proof
  - booking CTA attribution from `/discover` and `/barber/{username}` into `/booking/new`
  - marketplace conversion analytics rollups and booking-completion conversion updates
  - engagement persistence upgrades for loyalty, follows, notifications, rebooking records, referrals, reputation, ranking snapshots, and growth recommendations
- Verification: Passed in the 2026-03-10 full-project gate
- Release note: live browser or staging validation, richer ranking automation, and full map provider polish remain open for the Marketplace Growth Engine milestone

### Milestone 11: marketplace growth engine
- Status: Complete and verified
- Includes:
  - richer discovery-feed sections for nearby, top rated, trending now, available today, rising barbers, and favorite-barber updates
  - style discovery route foundations at `/discover/styles`, visible ranking surfaces at `/discover/top` and `/leaderboards`, and stronger marketplace browse navigation
  - real public follow or unfollow UX plus profile sharing on `/barber/{username}`
  - stronger public social proof using persisted follows, reviews, profile views, conversion, reputation, and most-booked-service signals
  - client referral workspace at `/referrals` backed by the engagement referral architecture and marketplace share-event analytics
  - upgraded barber and owner growth visibility for profile performance, conversion, shares, referrals, and discovery-source pulse
  - follow-aware `GET A HAIRCUT NOW` matching and marketplace growth analytics on current public surfaces
- Verification: Passed in the 2026-03-10 full-project gate and local production smoke check
- Release note: live notification delivery, boosted visibility controls, full style-media search, and city-density personalization remain future-phase work
### Milestone 12: trust, verification, and safety layer
- Status: Complete and verified
- Includes:
  - trust domain types, seeded trust data, provider-backed trust runtime reads, and Supabase migration `0008_trust_verification_safety.sql`
  - barber verification architecture for identity, license, payout, and shop-affiliation status plus secure document references
  - shop verification architecture, trust badges, reliability scores, review-moderation scaffolding, safety reports, disputes, risk flags, and moderation-action records
  - public trust signal surfacing across discovery and public barber profiles using verification labels, trust score, reliability, and integrity proof
  - owner-safe and barber-safe trust views embedded into current role experiences without weakening permissions
  - trust-engine test coverage and trust-aware marketplace proof coverage
- Verification: Passed in the 2026-03-10 full-project gate and authenticated demo-session smoke check
- Release note: live verification review queues, secure document upload storage flows, automated fraud scoring, and compliance automation remain future-phase work

### Milestone 13: marketplace activation and monetization
- Status: Complete and verified
- Includes:
  - secure verification upload flows for barber and shop trust submissions with private storage references and role-safe submission APIs
  - notification delivery ledgers and provider-backed in-app, SMS-placeholder, email-placeholder, and push-ready delivery synchronization
  - trust-aware boosted visibility controls, featured placement inventory, promoted discovery proof, and city rollout management APIs
  - activation and monetization visibility inside barber and owner workspaces without weakening existing marketplace or role protections
  - synced list and map discovery proof, monetization analytics events, featured or boost proof on public barber profiles, and trust-aware eligibility gating
  - Supabase migration `0009_marketplace_activation_and_monetization.sql` for activation, notification delivery, monetization, and city-rollout persistence
- Verification: Passed in the 2026-03-10 full-project gate
- Release note: live provider delivery integrations, payment settlement for premium inventory, full visual map-provider polish, and city-density automation remain future-phase work
### Milestone 14: mobile push and native activation
- Status: Complete and verified
- Includes:
  - persisted push subscription and device-registration runtime flows with role-safe `/api/mobile/push/subscriptions`
  - push-delivery attempt wiring connected to the existing notification delivery architecture
  - deep-link payload helpers, recorded deep-link events, and `/api/mobile/deep-links` for app-ready route activation
  - upgraded PWA provider UX for install, push opt-in, device sync, and offline-safe messaging on mobile role surfaces
  - Capacitor-style native-wrap readiness through runtime flags, deep-link scheme support, and `capacitor.config.ts`
  - expanded service-worker handling for cached shell reads, notification clicks, and push-ready mobile routing
  - mobile-link and mobile-engine unit coverage plus PWA-provider coverage for install or push activation behavior
- Verification: Passed in the 2026-03-10 full-project gate
- Release note: real provider credentials for web push, wrapped-native bridge code, richer offline read caching, and store-distribution packaging remain future-phase work
### Milestone 15: native distribution and live delivery
- Status: Complete and verified
- Includes:
  - provider-backed notification execution for email, SMS, and web push where runtime credentials are present, with durable delivery-attempt metadata and retry timing
  - role-safe delivery inspection and trigger endpoint at `/api/engagement/deliveries`
  - native bootstrap metadata at `/api/mobile/native/bootstrap` plus Android and Apple association routes for wrapped deep-link validation
  - wrapped-runtime mobile-shell behavior updates for native activation, push opt-in, and install-prompt suppression
  - launch packaging docs, mobile-device QA checklist, store-launch checklist, and Supabase migration `0011_native_distribution_and_live_delivery.sql`
- Verification: Passed in the 2026-03-10 full-project gate and local production smoke check
- Release note: APNs and FCM bridge delivery execution, store packaging assets, and human device QA remain future-phase work
### Milestone 16: real device QA and store submission
- Status: Complete and verified at the code and build level
- Includes:
  - hashed APNs and FCM native token bridge storage plus role-safe `/api/mobile/native/tokens`
  - native bootstrap expansion for token-bridge, delivery-provider, and release-candidate metadata
  - production delivery config-path updates for web push, Twilio, Resend, APNs, and FCM readiness
  - wrapped-runtime token registration and revoke wiring in the PWA provider for future Capacitor bridge execution
  - real-device QA, store launch, release certification, and release-candidate certification documentation updates
  - Supabase migration `0012_real_device_qa_and_store_submission.sql`
- Verification: Passed in the 2026-03-10 full-project gate and local production smoke check
- Release note: live APNs and FCM outbound delivery, real-device human QA, and final store submission sign-off remain open
## Phase alignment

### Phase 1: Core platform

Status: mostly implemented at the code and build level, with production validation still open.

Scope:

- authentication
- booking engine
- barber profiles
- owner dashboards
- payment and compensation system

Current alignment:

- authentication is implemented through the Supabase-first auth architecture and demo mode fallback
- booking engine is implemented through booking routes, availability logic, waitlist support, and live appointment lifecycle flows
- barber profiles exist at an operational level through profile, barber, service, availability, and compensation data, but profile trust depth is still limited
- owner dashboards are implemented with persisted activity, revenue, and compensation reporting basics
- payment and compensation systems are implemented at the MVP level through deposits, checkout capture, commission visibility, booth-rent visibility, and persisted compensation snapshots

Remaining Phase 1 closure work:

- execute human browser or staging QA
- complete release certification
- validate live Supabase auth and RLS end to end with real role accounts
- unify live operational text references with canonical UUID-linked domain records

### Phase 2: Growth features

Status: partially scaffolded.

Scope:

- loyalty
- referrals
- marketing campaigns
- queue management
- analytics improvements

Current alignment:

- loyalty has schema, engagement summaries, transaction rails, and owner reporting foundations, with deeper automation and reward UX still pending
- referrals now have a client-safe growth loop, invite tracking, share analytics, and owner visibility, with fuller reward automation still deferred
- marketing campaigns remain placeholder-level, but notification-delivery ledgers and trigger architecture are now in place for future execution
- queue management exists in basic front-desk form, but not as a broader operational growth module
- analytics are solid for current MVP reporting, but still need deeper role-specific, marketing, trust, discovery, and retention insights

Recommended focus inside Phase 2:

- trust-aware barber profiles
- referral tracking and incentives
- campaign and segmentation tables
- stronger queue-management workflows and KPIs
- broader analytics models across client, barber, owner, and location views
- public barber profile foundations for later marketplace expansion

### Phase 3: Ecosystem expansion

Status: architecture direction only.

Scope:

- multi-location enterprise support
- barber discovery marketplace
- AI insights
- franchise infrastructure

Current alignment:

- multi-location basics already exist, but enterprise hierarchy and control layers do not
- discovery marketplace behavior is now implemented through feed sections, leaderboards, style browsing, public follows, share loops, trust proof, and activation-aware promoted placement, with deeper personalization still deferred
- AI insights are not yet implemented
- franchise infrastructure is not yet implemented

Recommended Phase 3 foundation:

- business or organization hierarchy above locations
- marketplace trust, ranking, style, and search data model
- discovery feed, map mode, and `Get a Haircut Now` product surfaces
- AI-ready event and analytics pipelines
- franchise-ready operating-unit and reporting architecture
- marketplace monetization, safety, and launch sequencing

## Architecture reconciliation summary

### Implemented features

- authentication and RBAC basics
- booking engine and appointment lifecycle
- basic barber operational profiles
- owner dashboards and reporting basics
- payment and compensation foundations
- front desk queue basics
- multi-location basics

### Partially implemented features

- loyalty
- analytics depth
- queue management expansion
- marketing automation foundations
- payout depth
- trust workflow automation depth
- public surfaces that can later host richer trust-safe discovery profiles

### Missing features

- referrals
- discovery feed
- map mode
- `Get a Haircut Now`
- style discovery engine
- marketplace ranking algorithm
- public trust-rich marketplace profiles
- AI insights
- franchise infrastructure
- general ledger architecture
- hybrid compensation model
- enterprise multi-location hierarchy

### Future roadmap items

- trust-system data model
- relationship-engine tables
- referral and campaign systems
- enterprise multi-location operations
- marketplace ranking, style, and discovery
- subscriptions, AI analytics, safety controls, and franchise controls

## Follow-up focus

- Execute a real browser walkthrough in a staging-like Supabase environment and complete the manual QA and release certification sign-off
- Map the live text-reference operations tables onto canonical Supabase UUID relational records for long-term reporting consistency
- Reduce admin-client dependence in the operations API so more reads and writes flow directly through session-scoped RLS paths
- Add Playwright or equivalent browser automation for the six-step workflow and role-based conflict scenarios
- Use `VISION_ALIGNMENT_REPORT.md` as the planning bridge between the Master Plan, the marketplace layer, and future milestones



## Mobile App / PWA Conversion

Status: completed on 2026-03-10

Completed:
- installable manifest and icon assets
- service worker shell caching and offline fallback messaging
- app-level install prompt and app-like mobile shell behavior
- role-safe mobile dock navigation for dashboard experiences
- touch-first layout refinement for booking, discovery, map, and public barber profile surfaces
- PWA manifest and provider unit coverage





