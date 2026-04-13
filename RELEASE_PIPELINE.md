# BVRB3R Preview-First Release Pipeline

This is the operating model for auth, onboarding, payments, verification, and other production-sensitive changes.

## Release Contract

1. Code changes happen on a non-production Git branch such as `codex/...`, `fix/...`, or a feature branch.
2. Vercel creates a Preview deployment for that exact branch/commit.
3. Preview is the release-candidate environment and must be tested before production.
4. Required Supabase migrations and provider dashboard config are applied before preview QA.
5. Production receives the exact commit/deployment that passed preview QA.
6. No recoding happens between preview pass and production promotion.

`main` is production-ready only. Do not use production as the first place to debug onboarding, callbacks, Stripe, Twilio, or RLS.

## Current Weak Points Being Closed

- OAuth returned to `/?code=...` and the homepage did not treat that as callback input.
- Preview and production behavior were easy to confuse because callback URLs and provider envs were not documented as a release gate.
- Role launch and contact verification bugs were tested against production symptoms instead of a stable preview release candidate.
- `.env.staging.example` previously documented `TWILIO_PHONE_NUMBER`, but the app reads `TWILIO_FROM_NUMBER`.

## Auth Callback Architecture

The only app callback path is:

```text
/auth/callback
```

The intended flow is:

1. Browser calls `supabase.auth.signInWithOAuth()`.
2. `redirectTo` is `${window.location.origin}/auth/callback`.
3. Supabase returns the browser to `/auth/callback?code=...`.
4. `/auth/callback` routes code-based callbacks through `/auth/callback/exchange`.
5. `/auth/callback/exchange` calls `exchangeCodeForSession(code)` and writes Supabase cookies.
6. `/auth/callback` re-reads the authenticated user, ensures the canonical profile row, resolves the next onboarding path, and redirects.

Recovery rule:

- `/`, `/home`, `/login`, and `/signup` must redirect `?code=...` or `?error=...` into `/auth/callback`.
- A public page is never a terminal OAuth callback state.

## Required Callback URLs

### Google Cloud OAuth

Google OAuth should point back to Supabase, not directly to the Next.js app:

```text
https://<supabase-project-ref>.supabase.co/auth/v1/callback
```

If Supabase uses a custom auth domain, add that auth-domain callback too:

```text
https://<supabase-auth-domain>/auth/v1/callback
```

### Supabase Auth URL Configuration

Set the production Site URL to the canonical production origin:

```text
https://www.bvrb3r.app
```

Add redirect allow-list entries:

```text
https://www.bvrb3r.app/auth/callback
https://bvrb3r.app/auth/callback
https://preview.bvrb3r.app/auth/callback
https://<exact-vercel-preview-origin>/auth/callback
```

Use a stable preview alias such as `https://preview.bvrb3r.app` if available. If using rotating Vercel preview URLs, add the exact preview URL under test. Avoid a broad `*.vercel.app` allow-list unless there is no safer preview-domain option.

## Vercel Environment Matrix

| Variable | Used by | Production | Preview | Share values? |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | app metadata, Stripe return URLs, callback origin expectations | `https://www.bvrb3r.app` | stable preview origin, preferably `https://preview.bvrb3r.app` | No |
| `NEXT_PUBLIC_AUTH_MODE` | `lib/config/runtime.ts`, auth session mode | `supabase` | `supabase` | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | browser/server/admin Supabase clients | production Supabase URL | same project short-term or staging Supabase URL when split | Short-term yes, long-term no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser/server Supabase clients | production anon key | matching preview/staging anon key | Short-term yes, long-term no |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side canonical profile/lane writes | production service role | matching preview/staging service role | Short-term yes, long-term no |
| `NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET` | media/storage config | `bvrb3r-media` | `bvrb3r-media` or staging bucket | Usually yes |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client payment setup | `pk_live_...` | `pk_test_...` | No |
| `STRIPE_SECRET_KEY` | payments, Connect, Identity | `sk_live_...` | `sk_test_...` | No |
| `STRIPE_WEBHOOK_SECRET` | fallback webhook signing secret | live endpoint secret | preview/test endpoint secret | No |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect webhook verification | live Connect endpoint secret | preview/test Connect endpoint secret | No |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | Identity webhook verification | live Identity endpoint secret | preview/test Identity endpoint secret | No |
| `TWILIO_ACCOUNT_SID` | SMS send/verification delivery | live Twilio account | test/subaccount or same account with test numbers | Prefer no |
| `TWILIO_AUTH_TOKEN` | SMS send/verification delivery | live token | preview/test token | Prefer no |
| `TWILIO_MESSAGING_SERVICE_SID` | preferred Twilio sender path | live Messaging Service | preview/test Messaging Service | No |
| `TWILIO_FROM_NUMBER` | fallback Twilio sender path | live Twilio number | preview/test Twilio number | No |
| `GOOGLE_*` | not read by app code | Configure in Supabase provider/Google Cloud | Configure in Supabase provider/Google Cloud | N/A |
| `APPLE_*` | not read by app code | Configure in Supabase provider/Apple Developer | Configure in Supabase provider/Apple Developer | N/A |
| `RESEND_API_KEY` | email delivery | live key | preview/test key | No |
| `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | web push | live VAPID | preview VAPID | No |
| iOS/APNs variables | native push/association | production app/team values | sandbox/preview values | No |
| Android/FCM variables | native push/association | production app values | staging Firebase values | No |

The app does not currently read `TWILIO_PHONE_NUMBER`; use `TWILIO_FROM_NUMBER`.

## Supabase Release Discipline

Rules:

1. Every schema change is a migration in `supabase/migrations`.
2. Every RLS/storage policy change is a migration.
3. Preview QA must not start against a DB missing required migrations.
4. Production promotion must not happen until migrations have been applied safely.
5. Auth redirect allow-lists are part of release readiness.

Current recommendation:

- Short term: continue with the current Supabase project for preview QA only if the goal is to validate this release candidate quickly with isolated test accounts.
- Near term before real-user scale: split into staging and production Supabase projects so preview can test destructive or policy-sensitive changes without touching production data.

If using one Supabase project short-term, preview must use named test accounts and test shops only. Do not run broad data resets or destructive QA against that project.

## Stripe Preview/Production Separation

Preview must use Stripe test mode only:

```text
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_preview_standard...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_preview_connect...
STRIPE_IDENTITY_WEBHOOK_SECRET=whsec_preview_identity...
```

Production must use Stripe live mode only:

```text
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_standard...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_live_connect...
STRIPE_IDENTITY_WEBHOOK_SECRET=whsec_live_identity...
```

Webhook URLs:

```text
Preview standard: https://<preview-origin>/api/stripe/webhook
Preview Connect:  https://<preview-origin>/api/stripe/connect/webhook
Preview Identity: https://<preview-origin>/api/stripe/identity/webhook
Production standard: https://www.bvrb3r.app/api/stripe/webhook
Production Connect:  https://www.bvrb3r.app/api/stripe/connect/webhook
Production Identity: https://www.bvrb3r.app/api/stripe/identity/webhook
```

## Twilio Preview/Production Separation

The app sends SMS through Twilio when all of these are present:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER
```

Preview options:

- Preferred: Twilio test/subaccount with a preview Messaging Service and verified test recipients.
- Acceptable short-term: same Twilio account with a clearly labeled preview Messaging Service and test recipients.
- Not acceptable for release confidence: fallback/dev code logging standing in for real SMS.

No webhook URL is required for the current phone-code flow unless Twilio Verify callbacks are introduced later.

## Preview QA Checklist

Auth:

- Google login returns to `/auth/callback`, not `/?code=...`.
- If `/?code=...` occurs, it redirects to `/auth/callback?code=...`.
- `/auth/callback/exchange` completes session exchange.
- Session persists after page reload.
- `/login` redirects authenticated users through post-auth resolution.

Contact verification:

- `/verify-contact` loads canonical `profiles` data.
- Contact save persists `full_name`, `email`, and `phone`.
- SMS send uses the saved canonical phone.
- SMS verify writes `phone_verified_at`.
- `/api/auth/debug-contact-state` shows `missingFields: []` and `nextPath: "/role-select"` when contact is complete.

Role select:

- Contact-complete user with no official lane reaches `/role-select`.
- Client launch routes to `/dashboard/client`.
- Barber launch routes to `/onboarding/barber-type`.
- Shop Owner launch accepts shop name and routes to owner setup or `/dashboard/owner`.
- Stale `profiles.role` or incomplete stale lane rows do not falsely block launch.

Resume:

- Logout/login resumes Client to client dashboard.
- Logout/login resumes Barber to subtype/setup/dashboard based on canonical state.
- Logout/login resumes Owner to owner setup/dashboard based on canonical state.

Payments/provider truth:

- Preview checkout uses Stripe test keys.
- Preview webhook secret verifies events.
- Connect onboarding uses test-mode connected accounts.
- Identity sessions use test mode and update canonical verification state.

Failure modes:

- Callback exchange failure redirects to `/login?error=...`.
- Contact persistence failure returns explicit API error.
- Lane launch denial includes the real reason/code in preview logs.
- Duplicate appointment/payment paths fail safely.

## Production Promotion Checklist

1. Record preview commit SHA.
2. Confirm Vercel preview deployment URL.
3. Confirm `npm run typecheck`, `npm run test`, and `npm run build` passed for that SHA.
4. Confirm required Supabase migrations are applied.
5. Confirm Supabase redirect allow-list includes production and preview `/auth/callback`.
6. Confirm Google Cloud OAuth redirect URI points to Supabase callback.
7. Confirm production Vercel env vars are present and use live provider values.
8. Confirm preview Stripe keys are test-mode and production Stripe keys are live-mode.
9. Confirm Twilio production sender path is configured with `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`.
10. Promote the exact passing preview deployment/commit to production.
11. Smoke test production: Google login, callback, verify-contact, role-select, one lane launch, relogin resume.

## Commands

Run before requesting preview QA:

```bash
npm run typecheck
npm run test
npm run build
```

Optional local readiness check:

```bash
npm run release:check
```
