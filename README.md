# BVRB3R Platform

BVRB3R Platform is a multi-role, barbershop-first operating system for The BVRB3R Shop(TM) & Co. The MVP includes a premium public marketing site, a client booking flow, role-based dashboards, walk-in and appointment operations, compensation views for booth-rent and commission barbers, analytics, and a Supabase-first backend architecture.

The current foundation also includes the first marketplace layer: public barber profile pages at /barber/{username}, a discovery route at /discover, a service ownership engine, service popularity scaffolding, map discovery groundwork, and a GET A HAIRCUT NOW matching foundation.

On top of that, the engagement architecture is now scaffolded for smart rebooking, BVRB3R Points, barber follows, referral signals, reputation or ranking inputs, and owner retention intelligence.

Marketplace Persistence and Ranking is now in place for current flows: public barber proof, service popularity, follows, conversion events, booking attribution, waitlist persistence, and owner-safe marketplace analytics all run through provider-backed runtime paths in Supabase mode.

Marketplace Growth Engine now extends those foundations with a richer `/discover` feed, `/discover/top`, `/discover/styles`, `/leaderboards`, public follow or share UX on barber profiles, a client referral workspace at `/referrals`, stronger social proof, and upgraded barber or owner growth visibility.

Trust, Verification, and Safety Layer now adds barber and shop verification architecture, review-integrity scaffolding, trust badges, reliability scores, safety-report intake, dispute records, risk flags, owner-safe trust oversight, and barber-safe verification or trust status views.

Marketplace Activation and Monetization now adds secure verification upload flows, activation-ready notification delivery ledgers, boosted visibility controls, featured placement inventory, city rollout tooling, trust-aware monetization rules, and monetization analytics on top of the stable marketplace and operating-system foundations.

Mobile App / PWA Conversion, Mobile Push and Native Activation, Native Distribution and Live Delivery, and Real Device QA and Store Submission now add an installable app shell, service-worker caching, deep-link infrastructure, device registration, persisted push-subscription APIs, hashed native APNs or FCM bridge storage, provider-backed delivery execution where credentials are available, native bootstrap and association routes, and release-candidate wrapper foundations across every role experience.

## Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- React Hook Form + Zod
- TanStack Query
- Zustand for UI-only interaction state
- Recharts
- Supabase for auth, Postgres, storage, realtime, and RLS
- Stripe-ready payment provider abstraction for deposits and saved payment methods
- ESLint CLI with flat-config compatibility
- Vitest for unit, integration, workflow, and multi-user conflict coverage
- PWA installability, service worker, deep-link, and push-ready mobile activation architecture

## Local run modes

### 1. Quick-start demo mode

Use this when you want the UI running fast without provisioning Supabase or Stripe first.

1. Install Node.js 22+ and npm 10+.
2. Copy `.env.example` to `.env.local`.
3. Leave `NEXT_PUBLIC_AUTH_MODE=demo` and `PAYMENTS_PROVIDER=mock`.
4. Run `npm install`.
5. Run `npm run dev`.

Quick-start demo mode now uses the same live-operations API contract as Supabase mode, backed by an in-memory provider instead of local-authoritative dashboard state.

### 2. Full local Supabase mode

Use this when you want local auth, database, storage, row-level security, and realtime updates.

1. Install the Supabase CLI and Docker.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_AUTH_MODE=supabase`.
4. Run `npm install`.
5. Run `npm run supabase:start`.
6. Run `npm run supabase:db:reset`.
7. Update `.env.local` with the local anon and service role keys from the Supabase CLI output.
8. Run `npm run dev`.

The local seed now includes live appointments, walk-ins, workflow events, compensation snapshots, and owner analytics so the realtime dashboards have meaningful starter data.

## Payment and live operations architecture

Sensitive payment handling is abstracted behind `lib/payments/provider.ts`.

Live operations now flow through:

- `lib/operations/live-provider.ts`
- `app/api/operations/state/route.ts`
- `app/api/operations/bookings/route.ts`
- `app/api/operations/appointments/[appointmentId]/transition/route.ts`
- `app/api/operations/appointments/[appointmentId]/checkout/route.ts`

Modes:

- `demo`: in-memory provider with the same conflict-aware lifecycle contract for easy local startup
- `supabase`: Postgres-backed live operations tables plus Supabase realtime publication and persisted analytics or compensation tables
- `stripe`: payment provider shape for deposits and saved payment method setup intents

## Key folders

- `app/`: App Router pages and route handlers
- `components/`: reusable UI, dashboard, booking, and workflow components
- `lib/auth/`: auth routing and runtime helpers
- `lib/operations/`: live provider, metrics, persistence builders, and workflow state logic
- `lib/marketplace/`: service ownership, discovery, public profile, and instant-match marketplace logic
- `lib/engagement/`: loyalty, follows, rebooking, notification hooks, reputation, ranking, and owner-intelligence scaffolding
- `lib/mobile/`: deep-link helpers, push-subscription runtime, device activation state, and native-wrap readiness helpers
- `lib/store/`: Zustand UI stores only
- `lib/supabase/`: browser, server, and admin Supabase clients
- `lib/payments/`: provider abstraction for deposit and saved-payment flows
- `supabase/`: migrations, local config, and local seed SQL
- `tests/`: unit, integration, workflow, and multi-user conflict coverage

## Architecture docs

- Long-range product architecture: `VISION.md`
- Current MVP delivery contract: `SPEC.md`
- Master Plan comparison report: `VISION_ALIGNMENT_REPORT.md`
- Milestone and phase tracking: `PLANS.md`
- Deferred implementation backlog: `TODO.md`

## Marketplace and engagement routes

- Public discovery feed: `/discover`
- Ranked discovery surfaces: `/discover/top`, `/discover/styles`, `/leaderboards`
- Public barber profile: `/barber/{username}`
- Client referral workspace: `/referrals`
- Internal owner or barber services workspace: `/services`
- Marketplace APIs: `/api/marketplace/discover`, `/api/marketplace/map`, `/api/marketplace/haircut-now`, `/api/marketplace/barbers/[username]`, `/api/marketplace/services`, `/api/marketplace/analytics`, `/api/marketplace/waitlist`
- Engagement APIs: `/api/engagement/client/summary`, `/api/engagement/barber/summary`, `/api/engagement/owner/intelligence`, `/api/engagement/follows`, `/api/engagement/events`
- Trust APIs: `/api/trust/barber/verification`, `/api/trust/owner/overview`, `/api/trust/owner/shop-verification`, `/api/trust/reports`, `/api/trust/disputes`, `/api/trust/uploads`
- Activation and monetization APIs: `/api/marketplace/boosts`, `/api/marketplace/featured`, `/api/marketplace/cities`
- Engagement delivery API: `/api/engagement/deliveries`
- Mobile activation APIs: `/api/mobile/push/subscriptions`, `/api/mobile/native/tokens`, `/api/mobile/deep-links`, `/api/mobile/native/bootstrap`
- Native association routes: `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`, `/apple-app-site-association`

## QA and release

- Manual QA checklist: `QA_MANUAL_CHECKLIST.md`
- Release certification checklist: `RELEASE_CERTIFICATION.md`
- Release candidate certification: `RELEASE_CANDIDATE_CERTIFICATION.md`
- Mobile device QA checklist: `MOBILE_DEVICE_QA.md`
- Store launch checklist: `STORE_LAUNCH_CHECKLIST.md`
- Exact commands and demo credentials: `RUNBOOK.md`

## Current readiness

The codebase is build-green and passed `lint`, `typecheck`, `test`, `build`, and a local production smoke check on March 10, 2026. It now includes the Marketplace Foundation Phase, the Engagement Architecture Scaffold, Marketplace Persistence and Ranking, the Marketplace Growth Engine, the Trust, Verification, and Safety Layer, Marketplace Activation and Monetization, Mobile Push and Native Activation, Native Distribution and Live Delivery, and Real Device QA and Store Submission on top of the stable MVP. It is not yet fully production-ready for a real multi-user barbershop rollout because human browser or staging QA, live Supabase release certification, APNs or FCM live bridge execution, and store-submission sign-off are still pending.

## Deployment notes

- Configure Supabase auth, database, storage buckets, realtime publication, and row-level security.
- Switch `PAYMENTS_PROVIDER=stripe` only when Stripe keys are present.
- Provide `SUPABASE_SERVICE_ROLE_KEY` to enable server-side live operations persistence in Supabase mode.
- Replace demo-mode defaults with real Supabase auth users and environment-specific secrets before release.


## Mobile App / PWA and Push activation

The platform now includes an installable PWA layer with:

- `app/manifest.ts` for install metadata and shortcuts
- `public/sw.js` for conservative shell caching and offline fallback behavior
- generated home-screen icons in `public/icons/`
- `components/pwa/pwa-provider.tsx` for install prompts, offline messaging, live push opt-in, and device activation hooks
- `lib/mobile/` plus `/api/mobile/*` routes for persisted push subscriptions, device registrations, and deep-link recording
- `public/sw.js` push handlers and notification-click routing for app-style re-entry
- `capacitor.config.ts` and runtime scheme support for future native wrapping
- mobile dashboard docking and touch-first layout tuning across booking, discovery, and role workspaces

Offline behavior remains intentionally honest: cached shell and read views are supported, but live booking, checkout, and operational writes still require a connection. Push delivery now executes through real email, SMS, and web-push provider paths when credentials are present, while native APNs and FCM token-bridge storage and wrapped-runtime registration contracts are now in place for real-device QA. The app now also exposes native bootstrap metadata, association-link routes, `/api/mobile/native/tokens`, and mobile QA, release-candidate, or store-launch checklists for wrapped-device validation.





