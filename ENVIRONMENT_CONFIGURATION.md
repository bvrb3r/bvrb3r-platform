# Environment Configuration

This repo supports three environment profiles without changing application logic:

- `local`
- `staging`
- `production`

## Profile files and precedence

- `local` uses `.env.local`
- `staging` uses `.env.local` plus `.env.staging`
- `production` uses `.env.local` plus `.env.production`
- Shell or CI environment variables still win over values loaded from files.
- Staging and production scripts load `.env.local` first and the profile-specific file second, so `.env.staging` and `.env.production` override local defaults during those builds.
- `.env.example` and `.env.staging.example` are templates only and are not loaded automatically.

## Commands

- `npm run dev`
- `npm run dev:local`
- `npm run dev:staging`
- `npm run dev:production`
- `npm run build`
- `npm run build:local`
- `npm run build:staging`
- `npm run build:production`
- `npm run start`
- `npm run start:local`
- `npm run start:staging`
- `npm run start:production`

## Variable reference

### App runtime and environment selection

| Variable | Used in | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | `lib/config/runtime.ts`, `app/manifest.ts`, `capacitor.config.ts`, `lib/mobile/native.ts` | Sets app display metadata and native bootstrap metadata. |
| `NEXT_PUBLIC_APP_URL` | `lib/config/runtime.ts`, `app/layout.tsx`, `lib/mobile/links.ts`, `lib/mobile/native.ts` | Canonical web origin for metadata, deep links, and native bootstrap payloads. |
| `NEXT_PUBLIC_APP_LINK_SCHEME` | `lib/config/runtime.ts`, `app/layout.tsx`, `lib/mobile/links.ts`, `capacitor.config.ts`, `lib/mobile/native.ts` | Custom scheme for native deep links. |
| `NEXT_PUBLIC_APP_RUNTIME` | `lib/config/runtime.ts`, `components/pwa/pwa-provider.tsx` | Controls PWA or wrapped-native runtime behavior on the client. |
| `CAPACITOR_SERVER_URL` | `lib/config/runtime.ts`, `capacitor.config.ts` | Optional remote URL for a wrapped-native shell. |
| `DELIVERY_ENVIRONMENT` | `lib/config/runtime.ts` | Labels provider execution mode and environment metadata. |
| `NEXT_PUBLIC_AUTH_MODE` | `lib/config/runtime.ts`, `lib/auth/session.ts` | Switches between demo and Supabase auth flows. |
| `PAYMENTS_PROVIDER` | `lib/config/runtime.ts`, `lib/payments/provider.ts` | Keeps payments mock or Stripe-backed without changing feature logic. |
| `NEXT_PUBLIC_DEMO_ROLE` | `lib/config/runtime.ts` | Demo-only persona selection. |
| `NEXT_PUBLIC_DEMO_EMAIL` | `lib/config/runtime.ts`, `lib/auth/session.ts` | Demo-only user identity. |

### Supabase

| Variable | Used in | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/config/runtime.ts`, `lib/supabase/browser.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts` | Base URL for browser, server, and admin Supabase clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/config/runtime.ts`, `lib/supabase/browser.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts` | Public anon key for browser and SSR clients. |
| `NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET` | `lib/config/runtime.ts` | Storage bucket name for app media. The bucket is created by `supabase/migrations/0002_auth_storage_payments.sql`. |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/config/runtime.ts`, `lib/supabase/admin.ts` | Server-side admin key for elevated Supabase access. |

### Twilio

| Variable | Used in | Notes |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | `lib/config/runtime.ts`, `lib/engagement/live-delivery.ts` | Used to build authenticated Twilio SMS API requests. |
| `TWILIO_AUTH_TOKEN` | `lib/config/runtime.ts`, `lib/engagement/live-delivery.ts` | Basic-auth credential for Twilio SMS delivery. |
| `TWILIO_MESSAGING_SERVICE_SID` | `lib/config/runtime.ts`, `lib/engagement/live-delivery.ts` | Preferred sender path for Twilio messaging service delivery. |
| `TWILIO_FROM_NUMBER` | `lib/config/runtime.ts`, `lib/engagement/live-delivery.ts` | Alternate sender path when no messaging service SID is configured. |

### Resend

| Variable | Used in | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | `lib/config/runtime.ts`, `lib/engagement/live-delivery.ts` | Bearer token for Resend email delivery. |
| `RESEND_FROM_EMAIL` | `lib/config/runtime.ts`, `lib/engagement/live-delivery.ts` | Sender identity for outbound email. |
| `CRON_SECRET` | `app/api/cron/account-privacy/route.ts` | Long random bearer secret used by the scheduled privacy export/deletion worker. Server-only. |

### Web push (VAPID)

| Variable | Used in | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` | `lib/config/runtime.ts`, `components/pwa/pwa-provider.tsx`, `lib/engagement/delivery.ts` | Public VAPID key exposed to the client for subscription registration and placeholder-vs-live provider selection. |
| `WEB_PUSH_PRIVATE_KEY` | `lib/config/runtime.ts`, `lib/engagement/live-delivery.ts` | Private VAPID key used for signed web push delivery. |
| `WEB_PUSH_SUBJECT` | `lib/config/runtime.ts`, `lib/engagement/live-delivery.ts` | Contact subject for VAPID claims. |

### Mapbox and PostGIS discovery

| Variable | Used in | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | `components/marketplace/mapbox-discovery-canvas.tsx`, shop address search | URL-restricted public token for browser rendering and temporary suggestions. Never place a secret token here. |
| `NEXT_PUBLIC_MAPBOX_STYLE_DARK` | `components/marketplace/mapbox-discovery-canvas.tsx` | Liquid Black Glass Mapbox Studio style URL; Mapbox dark is the temporary fallback. |
| `NEXT_PUBLIC_MAPBOX_STYLE_LIGHT` | Mapbox light-theme surfaces | Platinum Frost Mapbox Studio style URL; Mapbox light is the temporary fallback. |
| `MAPBOX_SERVER_TOKEN` | Permanent shop geocoding and top-candidate Matrix travel times | Server-only token used after an approved owner confirms a shop address and for bounded one-to-many drive-time estimates. |

### App ID

| Variable | Used in | Notes |
| --- | --- | --- |
| `APP_ID_SIGNING_SECRET` | `/id` QR issuance and resolution | Server-only HMAC secret with at least 32 random characters. Use a different value in each environment. |
| `APP_ID_APPLE_WALLET_ISSUER_URL_TEMPLATE` | `/id` Apple Wallet action | Optional HTTPS signed-pass issuer template containing `{token}`. If absent, Apple Wallet is honestly shown as setup required. |
| `APP_ID_GOOGLE_WALLET_ISSUER_URL_TEMPLATE` | `/id` Google Wallet action | Optional HTTPS signed-pass issuer template containing `{token}`. If absent, Google Wallet is honestly shown as setup required. |
| `GIFT_CARD_CLAIM_SECRET` | Gift-card purchase confirmation and Stripe webhook delivery | Server-only HMAC secret with at least 32 random characters. It makes a paid claim credential recoverable without storing plaintext; use a different value per environment. |

### Group split payments

| Variable | Used in | Notes |
| --- | --- | --- |
| `GROUP_PAYMENT_LINK_SECRET` | Signed `/pay/group/...` links | Server-only HMAC secret with at least 32 random characters. Use a different random value in each environment. Split payment remains visibly gated when it is absent. |
| `PAYMENTS_PROVIDER` | Group-booking provider readiness | Must be `stripe` only after Stripe keys, the signed webhook, and Twilio delivery are verified. `mock` never creates or texts a payment link. |

### Calendar sync

| Variable | Used in | Notes |
| --- | --- | --- |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | `lib/calendar-sync/secrets.ts` | Server-only 32-byte encryption key for provider credentials and OAuth state. Use a different random key per environment. |
| `CALENDAR_SYNC_CRON_SECRET` | `app/api/calendar-sync/scheduled/route.ts` | Optional dedicated scheduler bearer secret. Vercel's automatic cron bearer using `CRON_SECRET` is also accepted. |
| `SQUARE_APPLICATION_ID` | Square ChairSync OAuth | Square scheduling application ID. Square payment and checkout data are outside this integration. |
| `SQUARE_APPLICATION_SECRET` | Square ChairSync OAuth | Server-only Square scheduling credential. |
| `SQUARE_CALENDAR_REDIRECT_URI` | Square ChairSync OAuth | Exact callback URL registered with Square. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square calendar webhook | Server-only signature verifier for inbound schedule events. |
| `SQUARE_CALENDAR_WEBHOOK_URL` | Square calendar webhook | Exact public webhook URL registered with Square. |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google Calendar OAuth | OAuth client ID for the dedicated BVRB3R calendar. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google Calendar OAuth | Server-only OAuth secret. |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Google Calendar OAuth | Exact callback URL registered with Google. |

### APNs

| Variable | Used in | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_IOS_BUNDLE_ID` | `lib/config/runtime.ts`, `components/pwa/pwa-provider.tsx`, `lib/mobile/native.ts`, `lib/mobile/association.ts`, `app/layout.tsx` | iOS application identifier used in metadata and native token payloads. |
| `IOS_TEAM_ID` | `lib/config/runtime.ts`, `lib/mobile/association.ts` | Used to generate Apple association metadata. |
| `IOS_KEY_ID` | `lib/config/runtime.ts` | Declares the APNs signing key id in runtime config readiness checks. |
| `IOS_PRIVATE_KEY` | `lib/config/runtime.ts` | Declares APNs signing material in runtime config readiness checks. |
| `APNS_USE_SANDBOX` | `lib/config/runtime.ts` | Marks whether native iOS push should target Apple sandbox. |
| `NEXT_PUBLIC_APP_STORE_ID` | `lib/config/runtime.ts`, `app/layout.tsx`, `app/manifest.ts`, `lib/mobile/native.ts` | Optional store metadata for smart banners and manifest hints. |

### Firebase Cloud Messaging

| Variable | Used in | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_ANDROID_PACKAGE_NAME` | `lib/config/runtime.ts`, `components/pwa/pwa-provider.tsx`, `lib/mobile/native.ts`, `lib/mobile/association.ts`, `app/layout.tsx`, `app/manifest.ts`, `capacitor.config.ts` | Android application identifier used across web, native, and association metadata. |
| `ANDROID_SIGNING_SHA256` | `lib/config/runtime.ts`, `lib/mobile/association.ts` | SHA-256 signing fingerprint served by `/.well-known/assetlinks.json`. |
| `FCM_PROJECT_ID` | `lib/config/runtime.ts` | Declares Firebase project identity in runtime config readiness checks. |
| `FCM_CLIENT_EMAIL` | `lib/config/runtime.ts` | Declares Firebase service-account identity in runtime config readiness checks. |
| `FCM_PRIVATE_KEY` | `lib/config/runtime.ts` | Declares Firebase private key material in runtime config readiness checks. |
| `FCM_SENDER_ID` | `lib/config/runtime.ts` | Exposed in native push bootstrap metadata and readiness checks. |

### Stripe

| Variable | Used in | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `lib/payments/provider.ts`, group split-payment page | Browser key used only when `PAYMENTS_PROVIDER=stripe`. |
| `STRIPE_SECRET_KEY` | `lib/payments/provider.ts`, group split-payment service | Server secret for Stripe-backed payment flows. |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe/webhook` | Signing secret for the Platform Money destination only. It verifies payment-ledger, billing, gift-card, and group-responsibility events and is never accepted by the Connect or Identity routes. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `/api/stripe/connect/webhook` | Signing secret for the Connected Account destination only. It is required independently and never falls back to `STRIPE_WEBHOOK_SECRET`. |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | `/api/stripe/identity/webhook` | Signing secret for the Identity destination only. It is required independently and never falls back to either money-webhook secret. |

Create one Stripe webhook destination per route and store the signing secret from
that exact destination in its matching server-only variable. The three values
must be distinct. Do not reuse a signing secret, concatenate secrets, or configure
fallbacks between destinations. Configure all four Stripe server secrets in each
Vercel environment that is expected to pass release readiness.

### Other declared variables

| Variable | Used in | Notes |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | `.env.example` | Declared in the repo template, but not referenced by current application code. |

## Operational notes

- Use `.env.staging.example` as the checklist for creating `.env.staging`.
- For a webhook-separation cutover, first deploy the strict route code while
  preserving the existing Platform destination and `STRIPE_WEBHOOK_SECRET`.
  Confirm `/api/stripe/webhook` continues to return `2xx` for a signed Platform
  delivery. Only then create the Connect and Identity destinations, save their
  distinct signing secrets as `STRIPE_CONNECT_WEBHOOK_SECRET` and
  `STRIPE_IDENTITY_WEBHOOK_SECRET`, and redeploy.
- Release readiness remains in `attention` (and `npm run release:check` exits
  nonzero) until `STRIPE_SECRET_KEY` and all three dedicated webhook signing
  secrets are configured.
- Run staging smoke tests with `npm run build:staging` and `npm run start:staging`; service worker and push behavior only fully activate in production mode.
- The repo includes `capacitor.config.ts` plus native bootstrap and association routes, but it does not currently include checked-in `ios/` or `android/` project folders.
- APNs and FCM settings currently drive readiness checks and native token metadata. The current native push delivery path is still placeholder-only in `lib/engagement/live-delivery.ts`.
