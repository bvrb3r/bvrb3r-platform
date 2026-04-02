# BVRB3R Local QA Runbook

This repo's local QA flow is designed to keep the app and Stripe test-mode pinned to one stable host:

- Browser QA base URL: `http://localhost:3000`
- Stripe webhook URL: `http://localhost:3000/api/stripe/webhook`
- Android emulator host mapping later: `http://10.0.2.2:3000`

## 1. Pre-flight check

Run this first:

```powershell
npm run qa:check
```

This verifies:

- `.env.local` exists
- `NEXT_PUBLIC_APP_URL` is `http://localhost:3000`
- `STRIPE_SECRET_KEY` exists
- `STRIPE_WEBHOOK_SECRET` exists
- Stripe CLI is installed and reachable

## 2. Start the app

In terminal 1:

```powershell
npm run qa:app
```

What this does:

- frees port `3000` first
- fails if port `3000` cannot be freed
- starts Next on port `3000` only
- does not silently move to another port

Expected readiness log:

```text
✅ Port 3000 is ready
```

## 3. Start Stripe webhook forwarding

In terminal 2:

```powershell
npm run qa:stripe
```

This forwards both standard Stripe and Connect events to:

```text
http://localhost:3000/api/stripe/webhook
```

Important:

- Stripe CLI will print a `whsec_...` signing secret
- if that secret changed, update `STRIPE_WEBHOOK_SECRET` in `.env.local`
- restart the app after changing `.env.local`

## 4. Verify localhost is active

Open:

```text
http://localhost:3000
```

Core QA routes:

- Client profile: `http://localhost:3000/profile`
- Reports / fintech workspace: `http://localhost:3000/reports`
- Barber earnings / readiness: `http://localhost:3000/earnings`
- Booking flow: `http://localhost:3000/booking/new`

## 5. Stripe QA flow

Use the running app plus the Stripe listener to test:

1. Barber onboarding
   - open `/earnings`
   - start or resume connected-account onboarding
2. Shop onboarding
   - open `/reports`
   - start or resume shop Stripe onboarding
3. Booking and payment
   - create a booking in `/booking/new`
   - complete the existing Stripe-backed payment path
4. Payout execution
   - open `/reports`
   - verify routing becomes executable only when payment settlement and readiness are valid
5. Refund / reversal
   - refund a payment
   - confirm reversal / reconciliation state updates

## 6. Stripe event testing

After `npm run qa:stripe` is running, you can trigger events from another terminal:

```powershell
stripe trigger payment_intent.succeeded
```

Use the existing onboarding and transfer flows to exercise Connect and payout webhook handling.

## 7. Android Studio later

Keep the host app on:

```text
http://localhost:3000
```

When using an Android emulator, point the wrapped app to:

```text
http://10.0.2.2:3000
```

That reaches the same host machine dev server while keeping the QA flow anchored to the same local environment.
