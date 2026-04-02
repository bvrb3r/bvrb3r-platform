# Runbook

## Required tooling

- Node.js 22+
- npm 10+
- Supabase CLI and Docker for full local backend mode
- Real iPhone and Android devices or wrapped-native simulators for release-candidate validation

## Commands

- `npm install`
- `npm run dev`
- `npm run dev:local`
- `npm run dev:staging`
- `npm run dev:production`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run build:local`
- `npm run build:staging`
- `npm run build:production`
- `npm run cap:build:web`
- `npm run cap:build:web:local`
- `npm run cap:build:web:staging`
- `npm run cap:build:web:production`
- `npm run cap:sync`
- `npm run cap:sync:local`
- `npm run cap:sync:staging`
- `npm run cap:sync:production`
- `npm run start -- --hostname 127.0.0.1 --port 3001`
- `npm run start:local`
- `npm run start:staging`
- `npm run start:production`
- `npm run seed`
- `npm run supabase:start`
- `npm run supabase:stop`
- `npm run supabase:db:reset`

## Environment profiles

- `local` uses `.env.local` and the `dev:local`, `build:local`, and `start:local` scripts.
- `staging` uses `.env.staging` and the `dev:staging`, `build:staging`, and `start:staging` scripts.
- `production` uses `.env.production` and the `dev:production`, `build:production`, and `start:production` scripts.
- Staging and production scripts load `.env.local` first, then the profile-specific file, so staging or production values override local defaults during those builds.
- Shell and CI environment variables still override file-loaded values.
- See `ENVIRONMENT_CONFIGURATION.md` for the full variable reference and code usage map.

## Capacitor wrapper strategy

- The native wrapper does not copy `.next` directly anymore.
- Capacitor now uses `dist/capacitor`, a generated shell with a real root `index.html`.
- The actual Next.js app remains server-rendered and should be reached through `CAPACITOR_SERVER_URL` for device testing and staging or production wrapper builds.
- Use `npm run build:staging` to verify the Next.js app build, then `npm run cap:sync:staging` to rebuild the Capacitor shell and sync the native wrapper.
- For local device testing against a LAN-accessible server, set `CAPACITOR_SERVER_URL` in `.env.local` to something like `http://YOUR-LAN-IP:3000`, run the Next dev server, then run `npm run cap:sync:local`.

## Milestone gate

Run this after every milestone:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. Update `CHANGELOG.md`
6. Update `TODO.md`

## Local setup options

### Quick-start demo mode

1. Install Node.js and npm.
2. Copy `.env.example` to `.env.local`.
3. Keep `NEXT_PUBLIC_AUTH_MODE=demo`.
4. Keep `PAYMENTS_PROVIDER=mock`.
5. Run `npm install`.
6. Run `npm run dev`.

Quick-start demo mode still uses the live operations APIs. The difference is the provider stays in-memory, which keeps startup fast while preserving the same conflict-aware request or response contract used by Supabase mode.

### Full local Supabase mode

1. Install Node.js, npm, Docker, and Supabase CLI.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_AUTH_MODE=supabase`.
4. Run `npm install`.
5. Run `npm run supabase:start`.
6. Run `npm run supabase:db:reset`.
7. Update `.env.local` with the local anon and service role keys reported by Supabase.
8. Run `npm run dev`.

## Production delivery and native config

Add these environment values before real provider and wrapped-device testing:

- `DELIVERY_ENVIRONMENT`
- `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CAPACITOR_SERVER_URL`
- `NEXT_PUBLIC_IOS_BUNDLE_ID`
- `IOS_TEAM_ID`
- `IOS_KEY_ID`
- `IOS_PRIVATE_KEY`
- `APNS_USE_SANDBOX`
- `NEXT_PUBLIC_ANDROID_PACKAGE_NAME`
- `ANDROID_SIGNING_SHA256`
- `NEXT_PUBLIC_APP_STORE_ID`
- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`
- `FCM_SENDER_ID`

## Verification notes

- `npm run lint` uses the ESLint CLI via `eslint.config.mjs`.
- `npm run typecheck` uses `scripts/typecheck.mjs` plus `tsconfig.typecheck.json` for stable standalone verification alongside Next route type generation.
- `npm run test` includes workflow, multi-user, marketplace, trust, live-delivery, PWA, and mobile bridge coverage.
- `npm run build` verifies the production bundle and App Router routes.
- `npm run start -- --hostname 127.0.0.1 --port 3001` can be used for a local production smoke pass after `npm run build`.

## Latest verification snapshot

Completed on 2026-03-10:

- `npm run lint` passed
- `npm run typecheck` passed
- `npm run test` passed
- `npm run build` passed
- Local production smoke returned `200` for `/`, `/discover`, `/barber/wave`, `/booking/new`, `/dashboard/client`, `/dashboard/barber`, `/dashboard/front-desk`, `/dashboard/manager`, `/dashboard/owner`, `/manifest.webmanifest`, `/sw.js`, `/api/mobile/deep-links`, `/api/mobile/native/bootstrap`, `/api/mobile/push/subscriptions`, `/api/mobile/native/tokens`, and `/api/engagement/deliveries`

## QA and release files

- Manual QA checklist: `QA_MANUAL_CHECKLIST.md`
- Release certification checklist: `RELEASE_CERTIFICATION.md`
- Release candidate certification: `RELEASE_CANDIDATE_CERTIFICATION.md`
- Mobile device QA checklist: `MOBILE_DEVICE_QA.md`
- Store launch checklist: `STORE_LAUNCH_CHECKLIST.md`

## Native distribution notes

Native validation routes now include:

- `/.well-known/assetlinks.json`
- `/.well-known/apple-app-site-association`
- `/apple-app-site-association`
- `/api/mobile/native/bootstrap`
