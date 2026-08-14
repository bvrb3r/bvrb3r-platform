# Changelog

## Unreleased

- Added server-owned Road account-setup reconciliation for 71 Client, Barber, and Shop Owner achievements, including 22 live setup checks, sequential replay, immutable evidence, and role-isolated service RPCs.
- Added corrective setup actions for verified contact, profiles, payment and payout readiness, Barber services and availability, Owner location, hours and policies, and secure ClientBridge guest-history resolution.
- Replaced verification path submission with opaque, signed Supabase Storage uploads that bind the actor, owner, category, object, MIME type, and byte size before evidence can be submitted.
- Applied and certified migration `20260814023406_road_account_setup_reconciliation` database-first in production; the idempotent initial reconcile produced 23 setup-truth events, 21 Road progress rows, and 3 badges with no duplicate or sequencing invariant failures.
- Applied and rollback-certified migration `20260814091007_road_setup_atomic_writes` database-first in production, making Owner hours and Barber availability writes transactional while extending owned pending-shop geocoding without exposing unapproved shops to discovery.
- Application release remains gated on the exact-head pull-request, CI, Vercel preview, signed-in three-role walkthrough, and production smoke sequence.

## 0.8.3

- Added Real Device QA and Store Submission on top of the verified Native Distribution and Live Delivery milestone without weakening role protections or destabilizing the stable marketplace and operating-system MVP
- Added hashed APNs and FCM native token bridge storage, the new `/api/mobile/native/tokens` API, and Supabase migration `0012_real_device_qa_and_store_submission.sql`
- Expanded native bootstrap metadata with token-bridge, delivery-provider, and release-candidate documentation signals for wrapped-runtime validation
- Wired the PWA provider to register and revoke native token bridge state during wrapped-runtime push activation while preserving the existing PWA behavior
- Added release-candidate certification, stronger mobile-device QA guidance, store launch packaging guidance, and production delivery config-path documentation
- Re-verified `lint`, `typecheck`, `test`, `build`, and a local production smoke pass on 2026-03-10
## 0.8.2

- Added Native Distribution and Live Delivery on top of the verified Mobile Push and Native Activation milestone without weakening role protections or destabilizing the stable marketplace and operating-system MVP
- Added provider-backed email, SMS, and web-push execution paths where credentials are available, plus durable delivery-attempt metadata, retry timing, and the new `/api/engagement/deliveries` execution or inspection API
- Added native bootstrap and association-link routes at `/api/mobile/native/bootstrap`, `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`, and `/apple-app-site-association`
- Upgraded the mobile shell for wrapped-native runtime detection, native-safe push activation, and install-prompt suppression while preserving the existing PWA experience
- Added Supabase migration `0011_native_distribution_and_live_delivery.sql`, mobile-device QA docs, store-launch packaging docs, and new unit coverage for live delivery and native bootstrap
- Re-verified `lint`, `typecheck`, `test`, `build`, and a local production smoke pass on 2026-03-10
## 0.8.1

- Added Mobile Push and Native Activation on top of the verified Mobile App / PWA conversion without weakening role protections or destabilizing the stable operating-system MVP
- Added persisted per-user and per-device push-subscription flows, device registration APIs, deep-link recording APIs, and Supabase migration `0010_mobile_push_and_native_activation.sql`
- Upgraded the PWA provider and service worker with push opt-in UX, notification-click routing, app re-entry deep links, and role-safe mobile activation messaging
- Added Capacitor-ready native-wrap configuration, mobile deep-link helpers, push-delivery attempt wiring, and mobile activation summaries for client, barber, and owner experiences
- Added mobile-link and mobile-engine unit coverage and re-verified `lint`, `typecheck`, `test`, and `build` on 2026-03-10
## 0.8.0

- Added Mobile App / PWA Conversion with a standalone web app manifest, home-screen icon set, offline fallback page, and service worker shell caching
- Added a client-side PWA provider for install prompts, offline messaging, and future push-ready app-shell behavior
- Upgraded the shared dashboard shell with mobile identity framing, role-safe quick navigation, and a bottom dock for phone-sized workflows
- Tuned booking, discovery, public barber profile, and map/list discovery layouts for cleaner mobile stacking and touch-first booking flow behavior
- Added PWA-focused test coverage for manifest metadata and install or offline provider behavior
## 0.6.5

- Added Marketplace Activation and Monetization on top of the verified Trust, Verification, and Safety Layer without weakening role protections or destabilizing the operating-system MVP
- Added secure verification upload flows, private verification references, and owner or barber-safe submission UX for marketplace trust activation
- Added provider-backed notification delivery ledgers for in-app, SMS-placeholder, email-placeholder, and push-ready activation or engagement notifications
- Added boosted visibility controls, featured placement inventory, city rollout APIs, and trust-aware eligibility enforcement for premium marketplace visibility
- Added monetization proof on discovery cards and public barber profiles, synced activation-aware map discovery, and owner or barber activation reporting surfaces
- Added Supabase migration `0009_marketplace_activation_and_monetization.sql`, activation unit coverage, and re-verified `lint`, `typecheck`, `test`, and `build` on 2026-03-10

## 0.6.4

- Added the Trust, Verification, and Safety Layer on top of the verified Marketplace Growth Engine without weakening role protections or changing the stable operating-system MVP
- Added trust domain types, seeded data, provider-backed runtime reads, and Supabase migration `0008_trust_verification_safety.sql` for barber verifications, shop verifications, trust badges, review moderation, safety reports, disputes, risk flags, moderation actions, and reliability scores
- Added public trust proof to discovery and public barber profiles, including verification labels, trust score, reliability, integrity, and trust-aware ranking inputs
- Added owner-safe and barber-safe trust visibility for verification progress, trust watchlists, shop verification status, open reports, disputes, and active risk signals
- Added trust, dispute, and safety intake APIs plus trust-engine and trust-aware marketplace proof test coverage
- Re-verified `lint`, `typecheck`, `test`, `build`, public route smoke checks, and authenticated trust or engagement API smoke checks on 2026-03-10

## 0.6.3

- Added Marketplace Growth Engine on top of the verified Marketplace Persistence and Ranking milestone without changing role protections or the stable operating-system MVP
- Added richer marketplace browse surfaces at `/discover`, `/discover/top`, `/discover/styles`, and `/leaderboards` with feed sections for nearby, top-rated, trending, rising, and available-today discovery
- Added real public follow or unfollow and share UX to public barber profiles, plus stronger persisted social-proof surfacing for follows, views, conversion, and most-booked services
- Added a client referral workspace at `/referrals` and connected referral sharing or invite actions into the existing engagement and marketplace analytics architecture
- Upgraded barber and owner growth visibility with marketplace profile-performance metrics, conversion signals, shares, and source-level pulse indicators
- Improved `GET A HAIRCUT NOW` with follow-aware matching and re-verified `lint`, `typecheck`, `test`, `build`, and local route smoke checks on 2026-03-10
## 0.6.2

- Added Marketplace Persistence and Ranking on top of the verified Marketplace Foundation and Engagement Architecture without changing role protections or the stable operating-system MVP
- Added Supabase migration `0007_marketplace_persistence_and_ranking.sql` for marketplace services, conversion events, booking attributions, waitlist requests, ranking-input columns, and engagement dedupe keys
- Switched marketplace and engagement APIs to provider-backed runtime reads so Supabase mode now serves persisted discovery, public profile proof, service ownership, loyalty, follows, and owner-intelligence data
- Connected real booking creation, waitlist joins, barber service completion, follow actions, and checkout completion to marketplace attribution or engagement persistence where applicable
- Added persisted proof signals to public barber profiles, preselected booking CTAs from marketplace routes into `/booking/new`, and owner-safe marketplace conversion analytics rollups
- Added marketplace proof and booking-link unit coverage and re-verified `lint`, `typecheck`, `test`, and `build` on 2026-03-10
## 0.6.1

- Added the Engagement Architecture Scaffold on top of the verified Marketplace Foundation without changing the current role architecture or operating workflows
- Added modular engagement domain types, seeded data, state, notification helpers, APIs, and React Query hooks for client, barber, and owner growth systems
- Added client engagement scaffolding for smart rebooking, BVRB3R Points, barber follows, referral codes, and engagement notifications
- Added barber engagement scaffolding for today or week or month earnings extensions, reputation inputs, ranking snapshots, follower counts, and growth recommendations
- Added owner intelligence scaffolding for retention, loyalty usage, referral activity, and rebooking effectiveness
- Added Supabase migration `0006_engagement_architecture.sql` for loyalty transactions, referral records, barber follows, engagement events, rebooking, notification preferences, reputation scores, ranking snapshots, and growth recommendations
- Added engagement engine coverage and re-verified `lint`, `typecheck`, `test`, and `build` on 2026-03-10
## 0.6.0

- Added the Marketplace Foundation Phase on top of the stable operating-system MVP without changing the core role architecture
- Added a service ownership engine with owner-controlled shop services for commission workflows and booth-rent barber-owned self-service control
- Added service popularity scaffolding, public barber profile routes, discovery search, map discovery shell, and `GET A HAIRCUT NOW` matching foundation
- Added marketplace client hooks, public marketplace UI components, internal service catalog workspace routing, and shell navigation for owner or barber service management
- Added Supabase migration `0005_marketplace_foundation.sql` to scaffold marketplace profiles, portfolios, styles, rankings, visibility, search history, preferences, and location indexing
- Added marketplace engine test coverage and verified `lint`, `typecheck`, `test`, and `build` on 2026-03-10

## 0.5.5

- Integrated the BVRB3R Marketplace layer into `VISION.md` as the long-range discovery network for barbers, clients, and shops
- Expanded `SPEC.md` so the expansion-architecture comparison now includes marketplace gaps such as discovery feed, map mode, style search, trust systems, ranking, and monetization
- Updated `PLANS.md` and `TODO.md` so marketplace discovery, trust, safety, ranking, and rollout work are tracked as future phases instead of altering the current MVP
- Expanded `VISION_ALIGNMENT_REPORT.md` with marketplace-specific match, gap, and milestone guidance

## 0.5.4

- Refreshed `VISION.md` as the integrated BVRB3R Platform Master Plan and aligned its roadmap to Phase 1 Core platform, Phase 2 Growth features, and Phase 3 Ecosystem expansion
- Added the `BVRB3R Platform Expansion Architecture` section to `SPEC.md` with implemented, partial, missing, and future-roadmap comparisons against the current codebase
- Realigned `PLANS.md` and `TODO.md` to the new phase structure while preserving the working MVP and milestone history
- Added `VISION_ALIGNMENT_REPORT.md` to document where the current platform matches the vision, where architecture needs expansion, and which milestones should come next

## 0.5.3

- Expanded `VISION.md` with the new three-ecosystem architecture for client, barber, and owner
- Added shared infrastructure engine direction for identity, booking, payment, payout, relationship, analytics, and marketing
- Added explicit relationship architecture, trust-system requirements, ledger-first financial engine requirements, and multi-location owner architecture
- Updated `PLANS.md` and `TODO.md` so future phases now reflect relationship-engine, trust, hybrid compensation, payout scheduling, subscriptions, AI analytics, and marketplace ranking work

## 0.5.2

- Updated `VISION.md` with the new industry-operating-system positioning for BVRB3R Platform
- Added explicit platform philosophy, long-term mission, client, barber, and owner pillar experiences, differentiation, and long-term impact framing
- Expanded the roadmap language in `PLANS.md` and `TODO.md` to reflect discovery, independent professionals, salon suites, and grooming-brand scale without changing the current MVP scope

## 0.5.1

- Added `VISION.md` as the primary long-range product architecture document for BVRB3R Platform
- Reframed `SPEC.md` as the MVP delivery contract and aligned it with the current Milestone 9 release state
- Updated `PLANS.md` and `TODO.md` to map the master-plan direction into Phase 1 MVP, Phase 2 Growth, and Phase 3 Scale
- Added schema and architecture reconciliation notes so future work can extend the product without destabilizing the current MVP

## 0.5.0

- Added Milestone 9 multi-user realtime readiness with provider-backed live operations APIs for booking, lifecycle transitions, checkout, and scoped state reads
- Added a Supabase or Postgres live operations schema layer with `live_clients`, `live_appointments`, `live_walk_in_queue`, revision-based conflict handling, and realtime publication wiring
- Refactored booking, front desk, barber, owner, and manager surfaces to read server-backed live state instead of local-authoritative Zustand data
- Reduced Zustand to UI-only operational state for selection, optimistic interaction smoothing, and conflict messaging
- Switched barber compensation views to persisted compensation snapshots and owner or manager reporting to persisted analytics or workflow feeds
- Added multi-user synchronization and stale-edit conflict tests plus a production smoke pass across the core dashboards and booking route
- Updated local Supabase seed data so the new live operations tables boot with realistic BVRB3R demo content

## 0.4.0

- Added Milestone 8 production hardening with a Supabase or Postgres workflow sync path for workflow events, compensation snapshots, and owner daily analytics
- Added `POST /api/operations/workflow-sync` plus a provider layer that safely falls back to demo sync mode when Supabase service credentials are not present
- Wired the six-step workflow to publish persistence status from booking through checkout so owner, barber, and front desk views surface sync health
- Added end-to-end workflow coverage for commission and booth-rent flows and added persistence builder tests
- Added `QA_MANUAL_CHECKLIST.md` and `RELEASE_CERTIFICATION.md` for manual QA and release sign-off
- Replaced deprecated `next lint` usage with the ESLint CLI and a flat-config compatibility setup
- Added `tsconfig.typecheck.json` so `npm run typecheck` remains stable alongside Next-managed route-type generation on Windows

## 0.3.1

- Completed the milestone verification pass on 2026-03-08 with successful `lint`, `typecheck`, `test`, and `build` runs
- Fixed the booking flow JSX parsing error that was blocking lint and TypeScript
- Normalized Windows-encoded source files to UTF-8 so Next.js could compile the affected routes and workflow components
- Moved `typedRoutes` to the supported Next.js config location and tightened dashboard navigation typing for route-safe links
- Added a Windows-safe `scripts/typecheck.mjs` helper so `npm run typecheck` works reliably in local development
- Tightened operations store typing for booked clients so build-time type validation matches runtime behavior

## 0.3.0

- Reorganized project delivery around Milestones 1-7 with explicit post-milestone verification gates
- Added a first working operations loop covering booking, check-in, service completion, checkout, compensation updates, and owner revenue updates
- Upgraded the visual system to better match The BVRB3R Shop(TM) brand: black backgrounds, charcoal surfaces, neon green accents, and a more editorial feel
- Attempted the milestone gate commands on 2026-03-08, but `npm` was not available on this machine so lint, typecheck, test, and build could not run

## 0.2.0

- Added Supabase-first runtime helpers for browser, server, and admin usage
- Added Supabase local CLI config, seed SQL, auth trigger, storage bucket setup, and billing or payment schema extensions
- Added Stripe-ready payment provider abstraction and API routes for deposit intents and saved-payment setup intents
- Added dual local startup guidance: quick-start demo mode and full local Supabase mode

## 0.1.0

- Created BVRB3R Platform MVP codebase and App Router structure
- Added premium marketing site and mobile-first booking flow
- Added role-based dashboards for owner, manager, front desk, barber, and client
- Added seeded domain model, business logic helpers, and Supabase-ready schema
- Added tests, docs, env example, and operational runbook




